/**
 * 远程控制路由
 * 处理 Telegram / QQ / Feishu Webhook
 */

import { logger } from '../services/logger.service'
import { wsService } from '../services/websocket.service'
import { unifiedMessageService } from '../services/unified-message.service'
import { getConfigDatabase, type RemoteControlConfig as DBRRemoteControlConfig } from '../services/config-database.service'
import { remoteAgentRegistry } from '../agents/remote.agent'
import { remoteControlLogService } from '../services/remote-control-log.service'

const configDb = getConfigDatabase()

export type RemoteControlConfig = DBRRemoteControlConfig

function maskToken(token: string): string {
  if (!token || token.length < 8) return '***'
  return token.slice(0, 4) + '****' + token.slice(-4)
}

let remoteConfig: RemoteControlConfig = configDb.getRemoteControlConfig()

const TELEGRAM_FETCH_TIMEOUT = 65000
const TELEGRAM_SEND_TIMEOUT = 10000

let telegramConnectionOk = false
let lastPollingErrorTime = 0
let pollingErrorCount = 0
let telegramPollingTimer: ReturnType<typeof setTimeout> | null = null

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = TELEGRAM_FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, keepalive: true })
    return response
  } finally {
    clearTimeout(timer)
  }
}

function getProxyConfig() {
  try {
    const json = configDb.getAppConfigJson()
    if (json) {
      const parsed = JSON.parse(json)
      return parsed?.settings?.proxy
    }
  } catch (e) {
    logger.warn('[RemoteControl] Failed to parse proxy config', e)
  }
  return undefined
}

async function fetchWithProxy(
  url: string,
  options: RequestInit = {},
  useProxy: boolean,
  timeoutMs: number = TELEGRAM_FETCH_TIMEOUT
): Promise<Response> {
  if (!useProxy) {
    return fetchWithTimeout(url, options, timeoutMs)
  }

  const savedHttpProxy = process.env.HTTP_PROXY
  const savedHttpsProxy = process.env.HTTPS_PROXY

  const proxyConfig = getProxyConfig()
  if (proxyConfig?.enabled && proxyConfig.host && proxyConfig.port) {
    const protocol = proxyConfig.protocol || 'http'
    const auth = proxyConfig.username && proxyConfig.password
      ? `${encodeURIComponent(proxyConfig.username)}:${encodeURIComponent(proxyConfig.password)}@`
      : ''
    process.env.HTTP_PROXY = `${protocol}://${auth}${proxyConfig.host}:${proxyConfig.port}`
    process.env.HTTPS_PROXY = `${protocol}://${auth}${proxyConfig.host}:${proxyConfig.port}`
  }

  try {
    return await fetchWithTimeout(url, options, timeoutMs)
  } finally {
    if (savedHttpProxy !== undefined) {
      process.env.HTTP_PROXY = savedHttpProxy
    } else {
      delete process.env.HTTP_PROXY
    }
    if (savedHttpsProxy !== undefined) {
      process.env.HTTPS_PROXY = savedHttpsProxy
    } else {
      delete process.env.HTTPS_PROXY
    }
  }
}

// ── Telegram CraBot 接入 ────────────────────────────────────────────────────
const telegramAgent = remoteAgentRegistry.get('telegram')

telegramAgent.registerReplier(async (text: string, sender: string) => {
  const token = remoteConfig.telegram?.botToken
  if (!token) return
  const chatId = sender.split(':')[0] || remoteConfig.telegram?.chatId || ''
  if (!chatId) return
  try {
    await fetchWithProxy(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    }, remoteConfig.telegram.proxyEnabled, TELEGRAM_SEND_TIMEOUT)
  } catch (e) {
    logger.warn('[RemoteControl] Telegram send message failed', e)
  }
})

telegramAgent.registerTypingIndicator((sender: string) => {
  const token = remoteConfig.telegram?.botToken
  const chatId = sender.split(':')[0] || remoteConfig.telegram?.chatId || ''
  if (!token || !chatId) return () => {}

  const sendTyping = () => {
    fetchWithProxy(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    }, remoteConfig.telegram.proxyEnabled, TELEGRAM_SEND_TIMEOUT).catch((e) => { logger.warn('[RemoteControl] Send chat action failed', e) })
  }

  sendTyping()
  const timer = setInterval(sendTyping, 4000)

  return () => {
    clearInterval(timer)
  }
})
// ───────────────────────────────────────────────────────────────────────────

unifiedMessageService.updateConfig({
  telegram: remoteConfig.telegram,
  qq: { webhook: remoteConfig.qq.webhook, botId: remoteConfig.qq.botId },
  wechat: remoteConfig.wechat,
  feishu: { webhook: remoteConfig.feishu.webhook },
  discord: remoteConfig.discord,
  slack: remoteConfig.slack,
  teams: remoteConfig.teams,
  whatsapp: remoteConfig.whatsapp
})

remoteControlLogService.info('system', 'system', '远控配置已加载', `enabled=${remoteConfig.enabled}`)
logger.info('[RemoteControl] Config loaded from database', { enabled: remoteConfig.enabled })

if (remoteConfig.enabled && remoteConfig.telegram?.enabled && remoteConfig.telegram?.botToken) {
  startTelegramPolling()
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!remoteConfig.telegram.enabled || !remoteConfig.telegram.botToken) {
    return false
  }

  try {
    const token = remoteConfig.telegram.botToken
    const chatId = remoteConfig.telegram.chatId || 'me'

    const response = await fetchWithProxy(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    }, remoteConfig.telegram.proxyEnabled, TELEGRAM_SEND_TIMEOUT)

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      logger.warn('[RemoteControl] Telegram 发送失败', { status: response.status, body: errBody })
      return false
    }

    return true
  } catch (error: any) {
    logger.error('[RemoteControl] Telegram 发送异常', { error: error?.message || String(error) })
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
  if (config.wechat) {
    remoteConfig.wechat = { ...remoteConfig.wechat, ...config.wechat }
  }
  if (config.feishu) {
    remoteConfig.feishu = { ...remoteConfig.feishu, ...config.feishu }
  }
  if (config.discord) {
    remoteConfig.discord = { ...remoteConfig.discord, ...config.discord }
  }
  if (config.slack) {
    remoteConfig.slack = { ...remoteConfig.slack, ...config.slack }
  }
  if (config.teams) {
    remoteConfig.teams = { ...remoteConfig.teams, ...config.teams }
  }
  if (config.whatsapp) {
    remoteConfig.whatsapp = { ...remoteConfig.whatsapp, ...config.whatsapp }
  }

  unifiedMessageService.updateConfig({
    telegram: remoteConfig.telegram,
    qq: { webhook: remoteConfig.qq.webhook, botId: remoteConfig.qq.botId },
    wechat: remoteConfig.wechat,
    feishu: { webhook: remoteConfig.feishu.webhook },
    discord: remoteConfig.discord,
    slack: remoteConfig.slack,
    teams: remoteConfig.teams,
    whatsapp: remoteConfig.whatsapp
  })

  configDb.saveRemoteControlConfig(remoteConfig)
  remoteControlLogService.info('config_updated', 'system', '远控配置已更新', `enabled=${remoteConfig.enabled}, telegram=${remoteConfig.telegram.enabled}`)
  logger.info('[RemoteControl] Config updated', { enabled: remoteConfig.enabled })

  if (remoteConfig.enabled && remoteConfig.telegram.enabled && remoteConfig.telegram.botToken) {
    startTelegramPolling()
  } else {
    stopTelegramPolling()
  }
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
  chatId?: string
}) {
  wsService.broadcastAll({ type: 'remote_message', payload: message })
  remoteControlLogService.info('message_broadcast', message.platform, `收到远控消息: ${message.text.slice(0, 100)}`, `sender=${message.sender}`, message.sender)
  logger.info('[RemoteControl] Message broadcasted', { platform: message.platform, sender: message.sender })

  if (message.text) {
    const agentSender = message.chatId ? `${message.chatId}:${message.sender}` : message.sender
    remoteAgentRegistry.get(message.platform as any).receive({
      platform: message.platform as any,
      text: message.text,
      sender: agentSender,
      timestamp: message.timestamp,
    }).catch((e: any) => {
      remoteControlLogService.error('agent_error', message.platform, `转发 RemoteAgent 失败: ${e.message}`, undefined, message.sender)
      logger.error('[CraBot] 转发 RemoteAgent 失败', e)
    })
  }
}

async function fetchTelegramUpdates(offset?: number): Promise<void> {
  if (!remoteConfig.enabled || !remoteConfig.telegram.enabled) return
  if (!remoteConfig.telegram.botToken) return

  try {
    const token = remoteConfig.telegram.botToken
    const limit = 10

    let url = `https://api.telegram.org/bot${token}/getUpdates?limit=${limit}&timeout=30`
    if (offset !== undefined) {
      url += `&offset=${offset}`
    }

    logger.info('[RemoteControl] Telegram 轮询请求', { offset, limit })
    const response = await fetchWithProxy(url, {}, remoteConfig.telegram.proxyEnabled)

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      logger.warn('[RemoteControl] Telegram 轮询 HTTP 错误', { status: response.status, body: errBody })
      if (telegramConnectionOk) {
        remoteControlLogService.error('polling_error', 'telegram', `轮询失败 HTTP ${response.status}: ${errBody.slice(0, 100)}`)
      }
      telegramConnectionOk = false
      scheduleNextPolling(true)
      return
    }

    const data = await response.json() as { ok: boolean; result: TelegramUpdate[] }
    logger.info('[RemoteControl] Telegram 轮询响应', { ok: data.ok, updateCount: data.result?.length || 0 })

    if (!telegramConnectionOk) {
      telegramConnectionOk = true
      pollingErrorCount = 0
      remoteControlLogService.info('polling_start', 'telegram', 'Telegram 轮询连接已恢复')
      logger.info('[RemoteControl] Telegram 轮询连接已恢复')
    }

    if (!data.ok) {
      logger.warn('[RemoteControl] Telegram 轮询返回 ok=false', { data })
      remoteControlLogService.warn('polling_error', 'telegram', 'Telegram API 返回 ok=false')
      scheduleNextPolling()
      return
    }

    if (!data.result.length) {
      logger.info('[RemoteControl] Telegram 轮询无新消息')
      scheduleNextPolling()
      return
    }

    let nextOffset = 0

    for (const update of data.result) {
      if (update.message && update.message.text) {
        const chatId = String(update.message.chat.id)
        const text = update.message.text
        const username = update.message.from?.username || update.message.from?.first_name || 'Unknown'

        if (remoteConfig.telegram.chatId && chatId !== remoteConfig.telegram.chatId) {
          remoteControlLogService.info('message_ignored', 'telegram', `忽略非指定 chatId 消息: ${text.slice(0, 50)}`, `chatId=${chatId}`, `@${username}`)
          continue
        }

        if (text.startsWith(remoteConfig.commandPrefix)) {
          const command = text.slice(remoteConfig.commandPrefix.length).trim()
          remoteControlLogService.info('message_received', 'telegram', `收到命令: ${command.slice(0, 100)}`, `chatId=${chatId}`, `@${username}`)
          broadcastToClients({
            type: 'remote_message',
            platform: 'telegram',
            text: command,
            sender: `@${username}`,
            chatId,
            timestamp: Date.now()
          })
        } else {
          remoteControlLogService.info('message_ignored', 'telegram', `忽略非命令消息: ${text.slice(0, 50)}`, `prefix=${remoteConfig.commandPrefix}`, `@${username}`)
        }
      }

      nextOffset = update.update_id + 1
    }

    if (nextOffset > 0) {
      setTimeout(() => fetchTelegramUpdates(nextOffset), 100)
    } else {
      scheduleNextPolling()
    }
  } catch (error) {
    const now = Date.now()
    pollingErrorCount++

    const errMsg = (error as Error).message || String(error)
    const isSocketClosed = errMsg.includes('socket connection was closed unexpectedly')
    const isTimeout = errMsg.includes('abort') || errMsg.includes('timeout')

    if (now - lastPollingErrorTime > 60000) {
      if (isSocketClosed) {
        if (!telegramConnectionOk && pollingErrorCount <= 3) {
          remoteControlLogService.warn('polling_error', 'telegram', 'Telegram 连接被意外关闭（网络不稳定或代理问题）')
          logger.warn('[RemoteControl] Telegram socket 连接被关闭，请检查网络环境')
        }
      } else if (isTimeout) {
        if (!telegramConnectionOk && pollingErrorCount <= 3) {
          remoteControlLogService.warn('polling_error', 'telegram', 'Telegram 连接超时（无法访问 Telegram 服务器）')
          logger.warn('[RemoteControl] Telegram 连接超时，请检查网络环境')
        }
      } else {
        remoteControlLogService.error('polling_error', 'telegram', `轮询异常: ${errMsg.slice(0, 200)}`)
        logger.error('[RemoteControl] Telegram polling error', errMsg)
      }
      lastPollingErrorTime = now
    }

    telegramConnectionOk = false
    scheduleNextPolling(true)
  }
}

function scheduleNextPolling(hasError: boolean = false): void {
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
  }

  let delay: number
  if (hasError) {
    delay = Math.min(30000 + pollingErrorCount * 5000, 120000)
  } else {
    delay = 2000
  }

  telegramPollingTimer = setTimeout(() => fetchTelegramUpdates(), delay)
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

export function startTelegramPolling(): void {
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
    telegramPollingTimer = null
  }
  telegramConnectionOk = false
  pollingErrorCount = 0
  remoteControlLogService.info('polling_start', 'telegram', '开始 Telegram 消息轮询')
  logger.info('[RemoteControl] 开始 Telegram 消息轮询')
  fetchTelegramUpdates()
}

export function stopTelegramPolling(): void {
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
    telegramPollingTimer = null
  }
  telegramConnectionOk = false
  pollingErrorCount = 0
  remoteControlLogService.info('polling_stop', 'telegram', '停止 Telegram 消息轮询')
  logger.info('[RemoteControl] 停止 Telegram 消息轮询')
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

      remoteControlLogService.info('webhook_received', 'telegram', `收到 Webhook 消息: ${text.slice(0, 100)}`, `chatId=${chatId}`, `@${username}`)

      if (remoteConfig.telegram.chatId && chatId !== remoteConfig.telegram.chatId) {
        remoteControlLogService.info('message_ignored', 'telegram', `Webhook 忽略非指定 chatId`, `chatId=${chatId}`, `@${username}`)
        return new Response('ignored', { status: 200 })
      }

      if (text.startsWith(remoteConfig.commandPrefix)) {
        const command = text.slice(remoteConfig.commandPrefix.length).trim()
        remoteControlLogService.info('message_received', 'telegram', `Webhook 收到命令: ${command.slice(0, 100)}`, `chatId=${chatId}`, `@${username}`)
        broadcastToClients({
          type: 'remote_message',
          platform: 'telegram',
          text: command,
          sender: `@${username}`,
          chatId,
          timestamp: Date.now()
        })
      } else {
        remoteControlLogService.info('message_ignored', 'telegram', `Webhook 忽略非命令消息`, `prefix=${remoteConfig.commandPrefix}`, `@${username}`)
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    remoteControlLogService.error('webhook_error', 'telegram', `Webhook 处理异常: ${(error as Error).message}`)
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

      remoteControlLogService.info('webhook_received', 'qq', `收到 Webhook 消息: ${text.slice(0, 100)}`, undefined, username)

      if (text.startsWith(remoteConfig.commandPrefix)) {
        const command = text.slice(remoteConfig.commandPrefix.length).trim()
        remoteControlLogService.info('message_received', 'qq', `收到命令: ${command.slice(0, 100)}`, undefined, username)
        broadcastToClients({
          type: 'remote_message',
          platform: 'qq',
          text: command,
          sender: username,
          timestamp: Date.now()
        })
      } else {
        remoteControlLogService.info('message_ignored', 'qq', `忽略非命令消息`, `prefix=${remoteConfig.commandPrefix}`, username)
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    remoteControlLogService.error('webhook_error', 'qq', `Webhook 处理异常: ${(error as Error).message}`)
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

      remoteControlLogService.info('webhook_received', 'feishu', `收到 Webhook 消息: ${text.slice(0, 100)}`, undefined, username)

      if (text.startsWith(remoteConfig.commandPrefix)) {
        const command = text.slice(remoteConfig.commandPrefix.length).trim()
        remoteControlLogService.info('message_received', 'feishu', `收到命令: ${command.slice(0, 100)}`, undefined, username)
        broadcastToClients({
          type: 'remote_message',
          platform: 'feishu',
          text: command,
          sender: username,
          timestamp: Date.now()
        })
      } else {
        remoteControlLogService.info('message_ignored', 'feishu', `忽略非命令消息`, `prefix=${remoteConfig.commandPrefix}`, username)
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    remoteControlLogService.error('webhook_error', 'feishu', `Webhook 处理异常: ${(error as Error).message}`)
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
      proxyEnabled: remoteConfig.proxyEnabled,
      commandPrefix: remoteConfig.commandPrefix,
      verifyCode: remoteConfig.verifyCode,
      telegram: {
        enabled: remoteConfig.telegram.enabled,
        botToken: maskToken(remoteConfig.telegram.botToken),
        chatId: remoteConfig.telegram.chatId,
        proxyEnabled: remoteConfig.telegram.proxyEnabled
      },
      qq: {
        enabled: remoteConfig.qq.enabled,
        botId: remoteConfig.qq.botId,
        webhook: remoteConfig.qq.webhook,
        proxyEnabled: remoteConfig.qq.proxyEnabled
      },
      wechat: {
        enabled: remoteConfig.wechat.enabled,
        webhook: remoteConfig.wechat.webhook,
        proxyEnabled: remoteConfig.wechat.proxyEnabled
      },
      feishu: {
        enabled: remoteConfig.feishu.enabled,
        appId: remoteConfig.feishu.appId,
        appSecret: maskToken(remoteConfig.feishu.appSecret),
        webhook: remoteConfig.feishu.webhook,
        proxyEnabled: remoteConfig.feishu.proxyEnabled
      },
      discord: {
        enabled: remoteConfig.discord.enabled,
        botToken: maskToken(remoteConfig.discord.botToken),
        channelId: remoteConfig.discord.channelId,
        proxyEnabled: remoteConfig.discord.proxyEnabled
      },
      slack: {
        enabled: remoteConfig.slack.enabled,
        botToken: maskToken(remoteConfig.slack.botToken),
        channelId: remoteConfig.slack.channelId,
        proxyEnabled: remoteConfig.slack.proxyEnabled
      },
      teams: {
        enabled: remoteConfig.teams.enabled,
        appId: remoteConfig.teams.appId,
        appSecret: maskToken(remoteConfig.teams.appSecret),
        webhook: remoteConfig.teams.webhook,
        proxyEnabled: remoteConfig.teams.proxyEnabled
      },
      whatsapp: {
        enabled: remoteConfig.whatsapp.enabled,
        accountSid: maskToken(remoteConfig.whatsapp.accountSid),
        authToken: maskToken(remoteConfig.whatsapp.authToken),
        fromNumber: remoteConfig.whatsapp.fromNumber,
        proxyEnabled: remoteConfig.whatsapp.proxyEnabled
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  if (pathname === '/api/remote-control/config' && (request.method === 'POST' || request.method === 'PUT')) {
    try {
      const body = await request.json() as Partial<RemoteControlConfig>
      updateRemoteConfig(body)

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

  if (pathname === '/api/remote-control/logs' && request.method === 'GET') {
    try {
      const logs = remoteControlLogService.getLogs()
      return new Response(JSON.stringify(logs), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: String(error) }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}