/**
 * 远程控制路由
 * 处理 Telegram / QQ / Feishu Webhook
 */

import { logger } from '../services/logger.service'
import { wsService } from '../services/websocket.service'
import { unifiedMessageService } from '../services/unified-message.service'
import { getConfigDatabase, type RemoteControlConfig as DBRRemoteControlConfig } from '../services/config-database.service'

const configDb = getConfigDatabase()

export type RemoteControlConfig = DBRRemoteControlConfig

let remoteConfig: RemoteControlConfig = configDb.getRemoteControlConfig()

unifiedMessageService.updateConfig({
  telegram: remoteConfig.telegram,
  qq: { webhook: remoteConfig.qq.webhook, botId: remoteConfig.qq.botId },
  wechat: remoteConfig.wechat,
  feishu: { webhook: remoteConfig.feishu.webhook }
})

logger.info('[RemoteControl] Config loaded from database', { enabled: remoteConfig.enabled })

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!remoteConfig.telegram.enabled || !remoteConfig.telegram.botToken) {
    logger.warn('[RemoteControl] Telegram not configured')
    return false
  }

  try {
    const token = remoteConfig.telegram.botToken
    const chatId = remoteConfig.telegram.chatId || 'me'

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    })

    if (!response.ok) {
      logger.error('[RemoteControl] Failed to send Telegram message', { status: response.status })
      return false
    }

    logger.info('[RemoteControl] Telegram message sent', { text: text.slice(0, 50) })
    return true
  } catch (error) {
    logger.error('[RemoteControl] Telegram send error', error)
    return false
  }
}

export function updateRemoteConfig(config: Partial<RemoteControlConfig>) {
  remoteConfig = { ...remoteConfig, ...config }
  if (config.telegram) {
    remoteConfig.telegram = { ...remoteConfig.telegram, ...config.telegram }
  }
  if (config.qq) {
    remoteConfig.qq = { ...remoteConfig.qq, ...config.qq }
  }
  if (config.feishu) {
    remoteConfig.feishu = { ...remoteConfig.feishu, ...config.feishu }
  }

  unifiedMessageService.updateConfig({
    telegram: remoteConfig.telegram,
    qq: { webhook: remoteConfig.qq.webhook, botId: remoteConfig.qq.botId },
    wechat: remoteConfig.wechat,
    feishu: { webhook: remoteConfig.feishu.webhook }
  })

  configDb.saveRemoteControlConfig(remoteConfig)
  logger.info('[RemoteControl] Config updated', { enabled: remoteConfig.enabled })
}

export function getRemoteConfig(): RemoteControlConfig {
  return remoteConfig
}

function broadcastToClients(message: {
  type: 'remote_message'
  platform: 'telegram' | 'qq' | 'feishu'
  text: string
  sender: string
  timestamp: number
}) {
  wsService.broadcastAll({
    type: 'remote_message',
    payload: message
  })
  logger.info('[RemoteControl] Message broadcasted', { platform: message.platform, sender: message.sender })
}

async function fetchTelegramUpdates(offset?: number): Promise<void> {
  if (!remoteConfig.enabled || !remoteConfig.telegram.enabled) return
  if (!remoteConfig.telegram.botToken) return

  try {
    const token = remoteConfig.telegram.botToken
    const limit = 10
    const timeout = 0

    let url = `https://api.telegram.org/bot${token}/getUpdates?limit=${limit}&timeout=${timeout}`
    if (offset !== undefined) {
      url += `&offset=${offset}`
    }

    const response = await fetch(url)
    if (!response.ok) {
      logger.error('[RemoteControl] Telegram fetch failed', { status: response.status })
      return
    }

    const data = await response.json() as { ok: boolean; result: TelegramUpdate[] }

    if (!data.ok || !data.result.length) return

    let nextOffset = 0

    for (const update of data.result) {
      if (update.message && update.message.text) {
        const chatId = String(update.message.chat.id)
        const text = update.message.text
        const username = update.message.from?.username || update.message.from?.first_name || 'Unknown'

        if (remoteConfig.telegram.chatId && chatId !== remoteConfig.telegram.chatId) {
          continue
        }

        if (text.startsWith(remoteConfig.commandPrefix)) {
          const command = text.slice(remoteConfig.commandPrefix.length).trim()
          broadcastToClients({
            type: 'remote_message',
            platform: 'telegram',
            text: command,
            sender: `@${username}`,
            timestamp: Date.now()
          })
        }
      }

      nextOffset = update.update_id + 1
    }

    if (nextOffset > 0) {
      setTimeout(() => fetchTelegramUpdates(nextOffset), 100)
    }
  } catch (error) {
    logger.error('[RemoteControl] Telegram polling error', error)
    setTimeout(() => fetchTelegramUpdates(), 5000)
  }
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
    text?: string
  }
}

let telegramPollingTimer: ReturnType<typeof setTimeout> | null = null

export function startTelegramPolling(): void {
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
  }
  fetchTelegramUpdates()
}

export function stopTelegramPolling(): void {
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
    telegramPollingTimer = null
  }
}

async function handleTelegramWebhook(body: unknown): Promise<Response> {
  if (!remoteConfig.enabled || !remoteConfig.telegram.enabled) {
    return new Response('disabled', { status: 200 })
  }

  try {
    const update = body as TelegramUpdate
    if (update.message && update.message.text) {
      const chatId = String(update.message.chat.id)
      const text = update.message.text
      const username = update.message.from?.username || update.message.from?.first_name || 'Unknown'

      if (remoteConfig.telegram.chatId && chatId !== remoteConfig.telegram.chatId) {
        return new Response('ignored', { status: 200 })
      }

      if (text.startsWith(remoteConfig.commandPrefix)) {
        const command = text.slice(remoteConfig.commandPrefix.length).trim()
        broadcastToClients({
          type: 'remote_message',
          platform: 'telegram',
          text: command,
          sender: `@${username}`,
          timestamp: Date.now()
        })
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    logger.error('[RemoteControl] Telegram webhook error', error)
    return new Response('error', { status: 500 })
  }
}

async function handleQQWebhook(body: unknown): Promise<Response> {
  if (!remoteConfig.enabled || !remoteConfig.qq.enabled) {
    return new Response('disabled', { status: 200 })
  }

  try {
    const qqBody = body as { message?: string; sender?: { nickname?: string }; user_id?: number }
    if (qqBody.message) {
      const text = String(qqBody.message)
      const username = qqBody.sender?.nickname || String(qqBody.user_id) || 'Unknown'

      if (text.startsWith(remoteConfig.commandPrefix)) {
        const command = text.slice(remoteConfig.commandPrefix.length).trim()
        broadcastToClients({
          type: 'remote_message',
          platform: 'qq',
          text: command,
          sender: username,
          timestamp: Date.now()
        })
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    logger.error('[RemoteControl] QQ webhook error', error)
    return new Response('error', { status: 500 })
  }
}

async function handleFeishuWebhook(body: unknown): Promise<Response> {
  if (!remoteConfig.enabled || !remoteConfig.feishu.enabled) {
    return new Response('disabled', { status: 200 })
  }

  try {
    const feishuBody = body as { event?: { message?: { content?: string } }; sender?: { sender_id?: { open_id?: string } }; open_id?: string }
    if (feishuBody.event?.message?.content) {
      let content: string | { text?: string } = feishuBody.event.message.content
      try {
        content = JSON.parse(content as string) as { text?: string }
      } catch {}

      const text = typeof content === 'string' ? content : String(content.text || '')
      const username = feishuBody.sender?.sender_id?.open_id || feishuBody.open_id || 'Unknown'

      if (text.startsWith(remoteConfig.commandPrefix)) {
        const command = text.slice(remoteConfig.commandPrefix.length).trim()
        broadcastToClients({
          type: 'remote_message',
          platform: 'feishu',
          text: command,
          sender: username,
          timestamp: Date.now()
        })
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    logger.error('[RemoteControl] Feishu webhook error', error)
    return new Response('error', { status: 500 })
  }
}

export async function handleRemoteControlRoute(pathname: string, request: Request): Promise<Response | null> {
  if (pathname === '/api/remote-control/hook' && request.method === 'POST') {
    const contentType = request.headers.get('content-type') || ''

    let bodyText = ''
    try {
      if (request.body) {
        const decoder = new TextDecoder()
        const chunks: string[] = []
        const reader = request.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(decoder.decode(value, { stream: true }))
        }
        chunks.push(decoder.decode())
        bodyText = chunks.join('')
      } else {
        bodyText = await request.text()
      }
    } catch (error) {
      logger.error('[RemoteControl] Failed to read body', error)
      return new Response('bad request', { status: 400 })
    }

    let body: unknown = {}
    try {
      if (bodyText.trim()) {
        body = JSON.parse(bodyText)
      }
    } catch (error) {
      logger.error('[RemoteControl] Failed to parse body', error)
      return new Response('bad request', { status: 400 })
    }

    const telegramMode = request.headers.get('x-telegram-bot-api-secret-token')

    if (telegramMode || (body && typeof body === 'object' && 'update_id' in body)) {
      return handleTelegramWebhook(body)
    }

    if (contentType.includes('application/json')) {
      const bodyObj = body as Record<string, unknown>
      if (bodyObj.msg_type !== undefined || bodyObj.message !== undefined) {
        return handleQQWebhook(body)
      }
      if (bodyObj.event !== undefined || bodyObj.open_id !== undefined) {
        return handleFeishuWebhook(body)
      }
    }

    return handleTelegramWebhook(body)
  }

  if (pathname === '/api/remote-control/config' && request.method === 'GET') {
    return new Response(JSON.stringify({
      enabled: remoteConfig.enabled,
      commandPrefix: remoteConfig.commandPrefix,
      verifyCode: remoteConfig.verifyCode,
      telegram: {
        enabled: remoteConfig.telegram.enabled,
        botToken: remoteConfig.telegram.botToken,
        chatId: remoteConfig.telegram.chatId
      },
      qq: {
        enabled: remoteConfig.qq.enabled,
        botId: remoteConfig.qq.botId,
        webhook: remoteConfig.qq.webhook
      },
      feishu: {
        enabled: remoteConfig.feishu.enabled,
        appId: remoteConfig.feishu.appId,
        appSecret: remoteConfig.feishu.appSecret,
        webhook: remoteConfig.feishu.webhook
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  if (pathname === '/api/remote-control/config' && request.method === 'POST') {
    try {
      const body = await request.json() as Partial<RemoteControlConfig>
      updateRemoteConfig(body)

      if (body.telegram?.enabled && body.telegram?.botToken) {
        startTelegramPolling()
      } else {
        stopTelegramPolling()
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: String(error) }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/remote-control/send' && request.method === 'POST') {
    try {
      const body = await request.json() as { platform?: string; content?: string; text?: string; chatId?: string }
      const platform = (body.platform || 'telegram') as 'telegram' | 'qq' | 'wechat' | 'feishu'
      const content = body.content || body.text || ''

      if (!content) {
        return new Response(JSON.stringify({ ok: false, error: '缺少 content 参数' }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      const result = await unifiedMessageService.send({ platform, content, chatId: body.chatId })
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: String(error) }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
