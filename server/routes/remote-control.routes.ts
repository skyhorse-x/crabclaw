/**
 * 远程控制路由
 * 处理 Telegram / QQ 官方机器人 / QQ / Feishu Webhook
 */

import crypto from 'node:crypto'
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
let telegramPermanentError = false
let telegramPollingTimer: ReturnType<typeof setTimeout> | null = null

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = TELEGRAM_FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // 不使用 keepalive：长轮询（timeout=30s）不应复用连接池，keepalive 在 Bun 里会导致 404
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

let cachedProxyConfig: { host?: string; port?: number; protocol?: string; username?: string; password?: string; enabled?: boolean } | undefined
let proxyConfigCachedAt = 0

function getProxyConfig() {
  // 缓存 30 秒，避免每次轮询都读数据库
  if (cachedProxyConfig !== undefined && Date.now() - proxyConfigCachedAt < 30000) {
    return cachedProxyConfig
  }
  try {
    const json = configDb.getAppConfigJson()
    if (json) {
      const parsed = JSON.parse(json)
      cachedProxyConfig = parsed?.settings?.proxy
      proxyConfigCachedAt = Date.now()
      return cachedProxyConfig
    }
  } catch (e) {
    logger.warn('[RemoteControl] Failed to parse proxy config', e)
  }
  cachedProxyConfig = undefined
  proxyConfigCachedAt = Date.now()
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
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' })
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
    const chatId = remoteConfig.telegram.chatId
    if (!chatId) {
      logger.warn('[RemoteControl] Telegram chat_id 未配置，无法发送消息')
      return false
    }

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
  imageUrl?: string
  fileName?: string
  fileUrl?: string
  fileMime?: string
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
  if (telegramPermanentError) return

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

      // 404 可能是网络拦截或临时错误，先验证 token 是否真的失效
      if (response.status === 404) {
        // 用 getMe 验证 token 是否有效，避免因网络问题误判为 token 无效
        try {
          const verifyResp = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) })
          if (!verifyResp.ok) {
            // token 真的无效，永久停止
            telegramPermanentError = true
            telegramConnectionOk = false
            remoteControlLogService.error('polling_error', 'telegram', 'Telegram Bot Token 无效（已通过 getMe 确认），请在控制面板中重新配置')
            logger.error('[RemoteControl] Telegram Bot Token 无效，永久停止轮询')
            return
          }
        } catch {
          // getMe 也失败说明是网络问题，当作临时错误重试
        }
        // token 有效，404 是临时网络问题，当作普通错误重试
        logger.warn('[RemoteControl] Telegram 轮询 404（token 有效，视为临时网络错误，将重试）')
        telegramConnectionOk = false
        scheduleNextPolling(true)
        return
      }

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
      const msg = update.message
      if (msg) {
        const chatId = String(msg.chat.id)
        const chatType = msg.chat.type
        const username = msg.from?.username || msg.from?.first_name || 'Unknown'

        // 群组消息：检查 chatId 白名单；私聊消息：直接放行
        const isGroup = chatType === 'group' || chatType === 'supergroup' || chatType === 'channel'
        if (isGroup && remoteConfig.telegram.chatId && chatId !== remoteConfig.telegram.chatId) {
          remoteControlLogService.info('message_ignored', 'telegram', `忽略非授权群组消息`, `chatId=${chatId}`, `@${username}`)
          nextOffset = update.update_id + 1
          continue
        }

        const prefix = remoteConfig.commandPrefix || ''

        if (msg.text) {
          // 纯文本消息
          const command = (prefix && msg.text.startsWith(prefix))
            ? msg.text.slice(prefix.length).trim()
            : msg.text.trim()

          if (command) {
            remoteControlLogService.info('message_received', 'telegram', `收到消息: ${command.slice(0, 100)}`, `chatId=${chatId}`, `@${username}`)
            broadcastToClients({ type: 'remote_message', platform: 'telegram', text: command, sender: `@${username}`, chatId, timestamp: Date.now() })
          }
        } else if (msg.photo) {
          // 图片消息（取最高分辨率）
          const largest = msg.photo.reduce((a, b) => (b.file_size || 0) > (a.file_size || 0) ? b : a)
          const imageUrl = await getTelegramFileUrl(largest.file_id)
          const caption = msg.caption || '[图片]'
          remoteControlLogService.info('message_received', 'telegram', `收到图片消息`, `chatId=${chatId}`, `@${username}`)
          broadcastToClients({ type: 'remote_message', platform: 'telegram', text: caption, sender: `@${username}`, chatId, timestamp: Date.now(), imageUrl: imageUrl || undefined })
        } else if (msg.document) {
          // 文件/文档消息
          const fileUrl = await getTelegramFileUrl(msg.document.file_id)
          const caption = msg.caption || msg.document.file_name || '[文件]'
          remoteControlLogService.info('message_received', 'telegram', `收到文件消息: ${msg.document.file_name || ''}`, `chatId=${chatId}`, `@${username}`)
          broadcastToClients({ type: 'remote_message', platform: 'telegram', text: caption, sender: `@${username}`, chatId, timestamp: Date.now(), fileUrl: fileUrl || undefined, fileName: msg.document.file_name, fileMime: msg.document.mime_type })
        } else if (msg.sticker) {
          remoteControlLogService.info('message_received', 'telegram', `收到贴纸 ${msg.sticker.emoji || ''}`, `chatId=${chatId}`, `@${username}`)
          broadcastToClients({ type: 'remote_message', platform: 'telegram', text: `[贴纸 ${msg.sticker.emoji || ''}]`, sender: `@${username}`, chatId, timestamp: Date.now() })
        } else if (msg.voice) {
          const fileUrl = await getTelegramFileUrl(msg.voice.file_id)
          remoteControlLogService.info('message_received', 'telegram', `收到语音消息`, `chatId=${chatId}`, `@${username}`)
          broadcastToClients({ type: 'remote_message', platform: 'telegram', text: '[语音消息]', sender: `@${username}`, chatId, timestamp: Date.now(), fileUrl: fileUrl || undefined, fileMime: msg.voice.mime_type })
        } else if (msg.video) {
          const fileUrl = await getTelegramFileUrl(msg.video.file_id)
          const caption = msg.caption || msg.video.file_name || '[视频]'
          remoteControlLogService.info('message_received', 'telegram', `收到视频消息`, `chatId=${chatId}`, `@${username}`)
          broadcastToClients({ type: 'remote_message', platform: 'telegram', text: caption, sender: `@${username}`, chatId, timestamp: Date.now(), fileUrl: fileUrl || undefined, fileMime: msg.video.mime_type })
        }
      }

      nextOffset = update.update_id + 1
    }

    scheduleNextPolling(false, nextOffset > 0 ? nextOffset : undefined)
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

function scheduleNextPolling(hasError: boolean = false, nextOffset?: number): void {
  if (telegramPermanentError) return
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
  }

  let delay: number
  if (hasError) {
    delay = Math.min(30000 + pollingErrorCount * 5000, 120000)
  } else {
    // 有新消息时快速继续，否则正常间隔
    delay = nextOffset !== undefined ? 100 : 2000
  }

  telegramPollingTimer = setTimeout(() => fetchTelegramUpdates(nextOffset), delay)
}

interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
    text?: string
    caption?: string
    photo?: TelegramPhotoSize[]
    document?: TelegramDocument
    sticker?: { file_id: string; emoji?: string }
    video?: { file_id: string; mime_type?: string; file_name?: string }
    audio?: { file_id: string; mime_type?: string; file_name?: string; title?: string }
    voice?: { file_id: string; mime_type?: string }
  }
}

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const token = remoteConfig.telegram?.botToken
  if (!token) return null
  try {
    const res = await fetchWithProxy(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
      {}, remoteConfig.telegram.proxyEnabled, 10000
    )
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; result?: { file_path?: string } }
    if (!data.ok || !data.result?.file_path) return null
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`
  } catch {
    return null
  }
}

export function startTelegramPolling(): void {
  if (telegramPollingTimer) {
    clearTimeout(telegramPollingTimer)
    telegramPollingTimer = null
  }
  telegramConnectionOk = false
  pollingErrorCount = 0
  telegramPermanentError = false
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
      const chatType = update.message.chat.type
      const text = update.message.text
      const username = update.message.from?.username || update.message.from?.first_name || 'Unknown'

      remoteControlLogService.info('webhook_received', 'telegram', `收到 Webhook 消息: ${text.slice(0, 100)}`, `chatId=${chatId}`, `@${username}`)

      // 群组消息：检查 chatId 白名单；私聊消息：直接放行
      const isGroup = chatType === 'group' || chatType === 'supergroup' || chatType === 'channel'
      if (isGroup && remoteConfig.telegram.chatId && chatId !== remoteConfig.telegram.chatId) {
        remoteControlLogService.info('message_ignored', 'telegram', `Webhook 忽略非授权群组消息`, `chatId=${chatId}`, `@${username}`)
        return new Response('ignored', { status: 200 })
      }

      const prefix = remoteConfig.commandPrefix || ''
      const command = (prefix && text.startsWith(prefix))
        ? text.slice(prefix.length).trim()
        : text.trim()

      if (command) {
        remoteControlLogService.info('message_received', 'telegram', `Webhook 收到消息: ${command.slice(0, 100)}`, `chatId=${chatId}`, `@${username}`)
        broadcastToClients({
          type: 'remote_message',
          platform: 'telegram',
          text: command,
          sender: `@${username}`,
          chatId,
          timestamp: Date.now()
        })
      }
    }
    return new Response('ok', { status: 200 })
  } catch (error) {
    remoteControlLogService.error('webhook_error', 'telegram', `Webhook 处理异常: ${(error as Error).message}`)
    logger.error('[RemoteControl] Telegram webhook error', error)
    return new Response('error', { status: 500 })
  }
}

/**
 * ED25519 签名（QQ 官方机器人回调验证用）
 * 使用 appSecret（32字节 hex）作为种子构造私钥
 */
function ed25519Sign(secretHex: string, message: string): string {
  const seed = Buffer.from(secretHex, 'hex')
  const pkcs8Header = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ])
  const pkcs8Key = Buffer.concat([pkcs8Header, seed])
  const key = crypto.createPrivateKey({ key: pkcs8Key, format: 'der', type: 'pkcs8' })
  const sign = crypto.createSign('ed25519')
  sign.update(Buffer.from(message, 'utf-8'))
  return sign.sign(key, 'hex')
}

/**
 * 解析常见的 sender 名字：优先 nickname，其次 user_openid/member_openid，其次 user_id
 */
function getSenderName(sender: Record<string, any> | undefined, userId?: string): string {
  if (sender?.nickname) return String(sender.nickname)
  if (sender?.user_openid) return String(sender.user_openid).slice(-8)
  if (sender?.member_openid) return String(sender.member_openid).slice(-8)
  if (userId) return userId
  return 'Unknown'
}

/**
 * 处理 QQ 官方机器人 Webhook
 * 支持旧格式 { message, sender } 和 QQ 官方机器人格式 { op, t, d }
 */
async function handleQQWebhook(body: unknown, _requestHeaders?: Headers): Promise<Response> {
  if (!remoteConfig.enabled || !remoteConfig.qq.enabled) {
    return new Response('disabled', { status: 200 })
  }

  const bodyObj = body as Record<string, unknown>

  // ── QQ 官方机器人格式：{ op, t, d } ─────────────────────────────────
  if (typeof bodyObj.op === 'number') {
    const op = bodyObj.op as number
    const t = String(bodyObj.t || '')
    const d = (bodyObj.d || {}) as Record<string, any>
    const logPrefix = `[QQ官方 Bot] op=${op} t=${t}`

    remoteControlLogService.info('webhook_received', 'qq', `收到 QQ 官方机器人 Webhook: ${logPrefix}`)
    logger.info('[RemoteControl] QQ official bot request', { op, t })

    // ── op=13：回调地址验证 ──
    if (op === 13) {
      const plainToken = String(d.plain_token || '')
      const eventTs = String(d.event_ts || '')
      const appSecret = remoteConfig.qq.appSecret || ''

      remoteControlLogService.info('callback_verify', 'qq', `QQ 官方机器人回调验证请求 plainToken=${plainToken.slice(0, 16)}...`)

      if (!appSecret) {
        remoteControlLogService.error('callback_verify_failed', 'qq', '缺少 appSecret，无法完成回调验证，请在配置中填写 QQ 机器人的 appSecret')
        return new Response(JSON.stringify({ plainToken, signature: '' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      try {
        const signature = ed25519Sign(appSecret, plainToken + eventTs)
        remoteControlLogService.info('callback_verify_ok', 'qq', 'QQ 官方机器人回调验证成功')
        logger.info('[RemoteControl] QQ official bot callback verified')
        return new Response(JSON.stringify({ plain_token: plainToken, signature }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      } catch (e) {
        remoteControlLogService.error('callback_verify_error', 'qq', `回调验证签名失败: ${(e as Error).message}`)
        logger.error('[RemoteControl] QQ callback sign error', e)
        return new Response(JSON.stringify({ plain_token: plainToken, signature: '' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
    }

    // ── op=0：事件推送（消息） ──
    if (op === 0) {
      if (t === 'C2C_MESSAGE_CREATE' || t === 'GROUP_AT_MESSAGE_CREATE') {
        const content = String(d.content || '').trim()
        const author = d.author || {}
        const sender = t === 'C2C_MESSAGE_CREATE'
          ? String(author.user_openid || '').slice(-8)
          : String(author.member_openid || '').slice(-8)
        const groupOpenId = String(d.group_openid || '')
        const displayName = sender || 'Unknown'

        remoteControlLogService.info('message_received', 'qq', `收到消息: ${content.slice(0, 100)}`, `sender=${displayName}${groupOpenId ? ' group=' + groupOpenId.slice(-8) : ''}`)

        if (content.startsWith(remoteConfig.commandPrefix)) {
          const command = content.slice(remoteConfig.commandPrefix.length).trim()
          remoteControlLogService.info('command_received', 'qq', `收到命令: ${command.slice(0, 100)}`, undefined, displayName)
          broadcastToClients({
            type: 'remote_message',
            platform: 'qq',
            text: command,
            sender: displayName,
            timestamp: Date.now()
          })
        } else {
          remoteControlLogService.info('message_ignored', 'qq', `忽略非命令消息`, `prefix=${remoteConfig.commandPrefix}`, displayName)
        }
      } else {
        remoteControlLogService.info('event_ignored', 'qq', `忽略非消息事件: ${t}`)
      }
    }

    return new Response('ok', { status: 200 })
  }

  // ── 旧格式兼容：{ message, sender, user_id } ───────────────────────
  try {
    const qqBody = body as { message?: string; sender?: { nickname?: string }; user_id?: number }
    if (qqBody.message) {
      const text = String(qqBody.message)
      const username = getSenderName(qqBody.sender, String(qqBody.user_id || ''))

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

    logger.info('[RemoteControl] Webhook received', { contentType, bodyPreview: JSON.stringify(body).slice(0, 200) })

    if (contentType.includes('application/json')) {
      const bodyObj = body as Record<string, unknown>
      // QQ 官方机器人格式检测：{ op (number), t, d }
      if (typeof bodyObj.op === 'number') {
        logger.info('[RemoteControl] Detected QQ official bot payload', { op: bodyObj.op, t: bodyObj.t })
        return handleQQWebhook(body, request.headers)
      }
      if (bodyObj.msg_type !== undefined || bodyObj.message !== undefined) {
        return handleQQWebhook(body, request.headers)
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