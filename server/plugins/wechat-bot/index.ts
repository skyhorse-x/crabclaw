import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import type { CrabclawPlugin, PluginContext } from '../plugin-types'
import { remoteAgentRegistry } from '../../agents/remote.agent'
import { ensureReadableText } from '../../handlers/chat.handler'
import { getEncryptionService } from '../../services/encryption.service'
import { wsService } from '../../services/websocket.service'

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'
const CHANNEL_VERSION = '1.0.2'
const ILINK_APP_ID = 'bot'
const ILINK_APP_CLIENT_VERSION = 132099
const QR_POLL_INTERVAL_MS = 2000
const QR_POLL_TIMEOUT_MS = 35000
const ILINK_BOT_TYPE = '3'
const TYPING_INTERVAL_MS = 4000

// 添加 API 响应类型定义
interface QrCodeResponse {
  qrcode: string
  qrcode_img_content: string
  ret?: number
}

interface QrCodeStatusResponse {
  status: 'waiting' | 'confirmed' | 'expired'
  bot_token?: string
  ilink_bot_id?: string
  ilink_user_id?: string
  baseurl?: string
  nickname?: string
  ret?: number
}

interface GetUpdatesResponse {
  ret?: number
  base_resp?: {
    ret?: number
    err_msg?: string
    status_code?: number
  }
  msgs?: WechatInboundMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
  errmsg?: string
}

interface SendMessageResponse {
  ret: number
  errcode?: number
  errmsg?: string
  msg_id?: string
  msg_id_str?: string
}

interface GetConfigResponse {
  typing_ticket?: string
  ret?: number
}

interface SendTypingResponse {
  ret?: number
}

interface WechatAccount {
  baseUrl: string
  token: string
  wxid: string
  userId: string
  nickname: string
  getUpdatesBuf: string
  contextTokens: Record<string, string>
  loggedInAt: number
}

interface StoredState {
  accounts: WechatAccount[]
}

interface LoginSession {
  qrcode: string
  qrcodeUrl: string
  startedAt: number
  resolved: boolean
  token?: string
  wxid?: string
  nickname?: string
  baseUrl?: string
}

interface WechatInboundMessage {
  from_user_id?: string
  from_wxid?: string
  context_token?: string
  timestamp?: number
  msg_time?: number
  content?: { text?: string }
  item_list?: Array<{
    type?: number
    text_item?: { text?: string }
    voice_item?: { text?: string }
    file_item?: { file_name?: string }
    image_item?: Record<string, unknown>
  }>
  text?: string
}

function b64RandomUin(): string {
  const val = String(Math.floor(Math.random() * 4294967295))
  return Buffer.from(val).toString('base64')
}

function baseInfo() {
  return { base_info: { channel_version: CHANNEL_VERSION, bot_agent: 'crabclaw-wechat/1.0.0' } }
}

function iLinkHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    headers['AuthorizationType'] = 'ilink_bot_token'
    headers['X-WECHAT-UIN'] = b64RandomUin()
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

async function apiPost<T = unknown>(baseUrl: string, endpoint: string, token: string | null, body: unknown, timeoutMs = 15000): Promise<T> {
  const headers = iLinkHeaders(token)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json() as T
    return data
  } finally { clearTimeout(timer) }
}

async function apiGet<T = unknown>(baseUrl: string, endpoint: string, token: string | null, timeoutMs = 15000): Promise<T> {
  const headers: Record<string, string> = {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    headers['AuthorizationType'] = 'ilink_bot_token'
    headers['X-WECHAT-UIN'] = b64RandomUin()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/${endpoint}`, { method: 'GET', headers, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json() as T
    return data
  } finally { clearTimeout(timer) }
}

function buildTextMsg(toUserId: string, text: string, contextToken?: string) {
  const msg: Record<string, any> = {
    to_user_id: toUserId,
    from_user_id: '',
    client_id: randomUUID(),
    message_type: 2,
    message_state: 2,
    item_list: [{ type: 1, text_item: { text } }],
  }
  if (contextToken) {
    msg.context_token = contextToken
  }
  return { msg, ...baseInfo() }
}

function sanitizeWechatOutboundText(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return raw

  const cleaned = ensureReadableText(raw).trim()
  return cleaned || raw
}

async function notifyStart(baseUrl: string, token: string): Promise<void> {
  try {
    await apiPost(baseUrl, 'ilink/bot/msg/notifystart', token, baseInfo(), 10000)
  } catch (e) {
    console.warn('[WechatBot] notifyStart failed', e)
  }
}

async function getTypingTicket(baseUrl: string, token: string): Promise<string | null> {
  try {
    const data = await apiPost<GetConfigResponse>(baseUrl, 'ilink/bot/getconfig', token, {}, 5000)
    return data.typing_ticket || null
  } catch (e) {
    console.warn('[WechatBot] getTypingTicket failed', e)
    return null
  }
}

async function sendTypingStatus(
  baseUrl: string,
  token: string,
  ilinkUserId: string,
  typingTicket: string,
  status: string
): Promise<boolean> {
  try {
    const body = {
      ilink_user_id: ilinkUserId,
      typing_ticket: typingTicket,
      status,
    }
    const data = await apiPost<SendTypingResponse>(baseUrl, 'ilink/bot/sendtyping', token, body, 5000)
    return (data.ret ?? 0) === 0
  } catch (e) {
    console.warn('[WechatBot] sendTypingStatus failed', e)
    return false
  }
}

export default class WechatBotPlugin implements CrabclawPlugin {
  readonly manifest = {
    id: 'wechat-bot', name: '微信机器人', version: '1.0.0',
    description: '基于腾讯iLink协议的个人微信机器人',
  }

  private ctx!: PluginContext
  private statePath = ''
  private state: StoredState = { accounts: [] }
  private pollingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private pollingAbortControllers: Map<string, AbortController> = new Map()
  private loginSessions: Map<string, LoginSession> = new Map()
  private loginPollingTimers: Map<string, ReturnType<typeof setInterval>> = new Map()

  async onInit(ctx: PluginContext): Promise<void> {
    this.ctx = ctx
    this.statePath = path.join(ctx.getPluginDataDir(), 'state.json')
    await this.loadState()
    ctx.registerRoute('/api/plugins/wechat-bot', async (pathname, request) => {
      return this.handleRoute(pathname, request)
    })
    for (const account of this.state.accounts) {
      if (account.token) {
        notifyStart(account.baseUrl, account.token).catch(() => {})
        this.startPolling(account)
      }
    }

    const wechatAgent = remoteAgentRegistry.get('wechat')

    wechatAgent.registerReplier(async (text: string, sender: string) => {
      const account = this.state.accounts[0]
      if (!account) return
      const toUserId = sender || account.userId
      if (!toUserId) return
      const contextToken = account.contextTokens[toUserId] || undefined
      const outboundText = sanitizeWechatOutboundText(text)
      if (outboundText !== text) {
        ctx.logger.info(`[CraBot] 微信回复已清洗 JSON 外壳: ${text.slice(0, 120)} -> ${outboundText.slice(0, 120)}`)
      }
      const reqBody = buildTextMsg(toUserId, outboundText, contextToken)
      ctx.logger.info(`[CraBot] 微信 sendmessage payload: to=${toUserId}, has_ctx=${!!contextToken}, text=${outboundText.slice(0, 120)}`)
      try {
        await apiPost<SendMessageResponse>(account.baseUrl, 'ilink/bot/sendmessage', account.token, reqBody, 60000)
      } catch (err: any) {
        ctx.logger.error(`[CraBot] 微信回复失败: ${err.message}`)
      }
    })

    wechatAgent.registerTypingIndicator((sender: string) => {
      const account = this.state.accounts[0]
      if (!account?.token) return () => {}

      const ilinkUserId = sender || account.userId
      if (!ilinkUserId) return () => {}

      notifyStart(account.baseUrl, account.token).catch(() => {})

      let failed = false
      let typingTicket = ''

      const tick = () => {
        if (failed) return
        sendTypingStatus(account.baseUrl, account.token, ilinkUserId, typingTicket, 'Typing')
          .then(async ok => {
            if (!ok) {
              if (!typingTicket) {
                const ticket = await getTypingTicket(account.baseUrl, account.token)
                if (ticket) {
                  typingTicket = ticket
                  return
                }
              }
              failed = true
              clearInterval(timer)
              ctx.logger.info('[CraBot] 微信 typing 接口返回失败，可能不支持（已停止重试）')
            }
          })
          .catch((e) => { ctx.logger.warn('[CraBot] 微信 typing 异常', e) })
      }

      tick()
      const timer = setInterval(tick, TYPING_INTERVAL_MS)
      ctx.logger.info(`[CraBot] 微信 typing 开始: ilinkUserId=${ilinkUserId.slice(0, 8)}`)

      return () => {
        clearInterval(timer)
        ctx.logger.info('[CraBot] 微信 typing 停止')
      }
    })

    ctx.logger.info(`微信机器人已启动，已登录 ${this.state.accounts.length} 个账号`)
  }

  async onDestroy(): Promise<void> {
    for (const t of this.pollingTimers.values()) clearTimeout(t)
    this.pollingTimers.clear()
    for (const ac of this.pollingAbortControllers.values()) ac.abort()
    this.pollingAbortControllers.clear()
    for (const t of this.loginPollingTimers.values()) clearInterval(t)
    this.loginPollingTimers.clear()
  }

  private async handleRoute(pathname: string, request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (pathname === '/api/plugins/wechat-bot/status' && request.method === 'GET') {
      return this.jsonResponse({ ok: true, accounts: this.state.accounts.map((a) => ({ wxid: a.wxid, userId: a.userId, nickname: a.nickname, loggedInAt: a.loggedInAt })) })
    }
    if (pathname === '/api/plugins/wechat-bot/login' && request.method === 'POST') return this.handleLogin()
    if (pathname === '/api/plugins/wechat-bot/check-login' && request.method === 'GET') return this.handleCheckLogin(url.searchParams.get('session') || '')
    if (pathname === '/api/plugins/wechat-bot/send' && request.method === 'POST') {
      const body = await request.json() as { content?: string; wxid?: string }
      return this.handleSend(body)
    }
    if (pathname === '/api/plugins/wechat-bot/logout' && request.method === 'POST') {
      const body = await request.json() as { wxid?: string }
      return this.handleLogout(body.wxid || '')
    }
    return null
  }

  private async handleLogin(): Promise<Response> {
    try {
      const sessionId = randomUUID().slice(0, 8)
      const data = await apiGet<QrCodeResponse>(ILINK_BASE_URL, `ilink/bot/get_bot_qrcode?bot_type=${ILINK_BOT_TYPE}`, null, 15000)
      if (!data.qrcode || !data.qrcode_img_content) {
        return this.jsonResponse({ ok: false, error: `获取二维码失败: ${JSON.stringify(data).slice(0, 200)}` }, 500)
      }
      const session: LoginSession = { qrcode: data.qrcode, qrcodeUrl: data.qrcode_img_content, startedAt: Date.now(), resolved: false }
      this.loginSessions.set(sessionId, session)
      let qrcodeDataUrl = data.qrcode_img_content
      try { qrcodeDataUrl = await QRCode.toDataURL(data.qrcode_img_content, { width: 280, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } }) } catch {}
      this.startQrPolling(sessionId)
      return this.jsonResponse({ ok: true, session: sessionId, qrcodeUrl: qrcodeDataUrl, qrcodeOriginalUrl: data.qrcode_img_content })
    } catch (err: any) {
      return this.jsonResponse({ ok: false, error: `登录请求失败: ${err.message}` }, 500)
    }
  }

  private startQrPolling(sessionId: string): void {
    if (this.loginPollingTimers.has(sessionId)) return
    const timer = setInterval(async () => {
      const session = this.loginSessions.get(sessionId)
      if (!session || session.resolved) { clearInterval(timer); this.loginPollingTimers.delete(sessionId); return }
      if (Date.now() - session.startedAt > 300000) { clearInterval(timer); this.loginPollingTimers.delete(sessionId); this.loginSessions.delete(sessionId); return }
      try {
        const data = await apiGet<QrCodeStatusResponse>(ILINK_BASE_URL, `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(session.qrcode)}`, null, QR_POLL_TIMEOUT_MS)
        if (data.status === 'confirmed') {
          if (!data.ilink_bot_id) return
          session.resolved = true
          session.token = data.bot_token || ''
          session.wxid = data.ilink_bot_id
          session.baseUrl = data.baseurl || ILINK_BASE_URL
          const botToken = session.token
          const botWxid = session.wxid
          const botBaseUrl = session.baseUrl
          const userWxid = data.ilink_user_id || ''
          
          if (!botToken || !botWxid || !botBaseUrl) return
          
          const displayName = typeof data.nickname === 'string' ? data.nickname : (data.ilink_user_id || botWxid)
          const account: WechatAccount = { 
            baseUrl: botBaseUrl, 
            token: botToken, 
            wxid: botWxid, 
            userId: userWxid, 
            nickname: displayName, 
            getUpdatesBuf: '', 
            contextTokens: {}, 
            loggedInAt: Date.now() 
          }
          const existingIdx = this.state.accounts.findIndex((a) => a.wxid === account.wxid)
          if (existingIdx >= 0) this.state.accounts[existingIdx] = account
          else this.state.accounts.push(account)
          await this.saveState()
          if (botToken) {
            notifyStart(botBaseUrl, botToken)
            this.startPolling(account)
          }
          clearInterval(timer)
          this.loginPollingTimers.delete(sessionId)
        }
      } catch (e) { console.warn('[WechatBot] QR polling failed', e) }
    }, QR_POLL_INTERVAL_MS)
    this.loginPollingTimers.set(sessionId, timer)
  }

  private async handleCheckLogin(sessionId: string): Promise<Response> {
    const session = this.loginSessions.get(sessionId)
    if (!session) return this.jsonResponse({ ok: false, error: '会话不存在或已过期' }, 404)
    if (session.resolved && session.wxid) {
      const account = this.state.accounts.find((a) => a.wxid === session.wxid)
      return this.jsonResponse({ ok: true, status: 'success', wxid: session.wxid, nickname: account?.nickname || session.nickname || '' })
    }
    if (Date.now() - session.startedAt > 300000) return this.jsonResponse({ ok: true, status: 'expired' })
    return this.jsonResponse({ ok: true, status: 'waiting' })
  }

  private async handleSend(body: { content?: string; wxid?: string }): Promise<Response> {
    const { content, wxid } = body
    if (!content) return this.jsonResponse({ ok: false, error: '缺少 content 参数' }, 400)
    let targetAccount: WechatAccount | undefined
    if (wxid) targetAccount = this.state.accounts.find((a) => a.wxid === wxid)
    if (!targetAccount) targetAccount = this.state.accounts[0]
    if (!targetAccount) return this.jsonResponse({ ok: false, error: '没有已登录的微信账号' }, 400)

    try {
      const knownSenders = Object.keys(targetAccount.contextTokens)
      const toUserId = targetAccount.userId || (knownSenders.length > 0 ? knownSenders[0] : '')
      if (!toUserId) {
        return this.jsonResponse({ ok: false, error: '还不知道发给谁，请先在手机微信上给 bot 发一条消息' }, 400)
      }
      const contextToken = targetAccount.contextTokens[toUserId] || undefined
      const outboundText = sanitizeWechatOutboundText(content)
      const reqBody = buildTextMsg(toUserId, outboundText, contextToken)
      this.ctx.logger.info(`发送微信消息: to=${toUserId}, has_ctx=${!!contextToken}, text=${outboundText.slice(0, 120)}`)

      const data = await apiPost<SendMessageResponse>(targetAccount.baseUrl, 'ilink/bot/sendmessage', targetAccount.token, reqBody)

      if (data.ret === 0) {
        this.ctx.logger.info(`发送微信消息成功, to=${toUserId}`)
        return this.jsonResponse({ ok: true, msgId: data.msg_id_str || data.msg_id })
      }

      if (Object.keys(data).length === 0) {
        this.ctx.logger.info(`发送微信消息成功(空响应体按 accepted 处理), to=${toUserId}`)
        return this.jsonResponse({ ok: true, accepted: true })
      }

      if ((data.errcode === -14 || data.ret === -14)) {
        return this.jsonResponse({ ok: false, error: '会话已过期，请重新登录微信' }, 500)
      }

      this.ctx.logger.error(`发送消息失败: ret=${data.ret}, errcode=${data.errcode}, errmsg=${data.errmsg || '无'}, full=${JSON.stringify(data).slice(0, 300)}`)
      return this.jsonResponse({ ok: false, error: data.errmsg || `发送失败 (ret=${data.ret})` }, 500)
    } catch (err: any) {
      return this.jsonResponse({ ok: false, error: err.message }, 500)
    }
  }

  private async handleLogout(wxid: string): Promise<Response> {
    if (!wxid) return this.jsonResponse({ ok: false, error: '缺少 wxid 参数' }, 400)
    this.stopPolling(wxid)
    this.state.accounts = this.state.accounts.filter((a) => a.wxid !== wxid)
    await this.saveState()
    return this.jsonResponse({ ok: true })
  }

  private startPolling(account: WechatAccount): void {
    const existingAbort = this.pollingAbortControllers.get(account.wxid)
    if (existingAbort) {
      existingAbort.abort()
    }
    const abortController = new AbortController()
    this.pollingAbortControllers.set(account.wxid, abortController)
    const { signal } = abortController
    this.pollingTimers.delete(account.wxid)
    const poll = async () => {
      if (signal.aborted) return
      try {
        this.ctx.logger.info(`轮询消息: wxid=${account.wxid.slice(0, 8)}..., buf=${account.getUpdatesBuf.slice(0, 20) || '(空)'}`)
        const data = await apiPost<GetUpdatesResponse>(account.baseUrl, 'ilink/bot/getupdates', account.token, { get_updates_buf: account.getUpdatesBuf, ...baseInfo() }, 40000)
        
        if (signal.aborted) return

        const ret = data.ret ?? data.base_resp?.ret ?? data.base_resp?.status_code ?? 0
        
        if (data.get_updates_buf) {
          account.getUpdatesBuf = data.get_updates_buf
        }

        if (ret === -14) {
          this.ctx.logger.warn(`微信账号 ${account.nickname} 会话过期，停止轮询`)
          this.stopPolling(account.wxid)
          return
        }
        
        if (ret !== 0) {
          this.ctx.logger.warn(`轮询非零返回: ret=${ret}, errmsg=${data.errmsg || data.base_resp?.err_msg || '无'}`)
          this.schedulePolling(account, 5000)
          return
        }

        if (data.msgs && data.msgs.length > 0) {
          this.ctx.logger.info(`收到 ${data.msgs.length} 条微信消息`)
          for (const msg of data.msgs) {
            const sender = msg.from_user_id || msg.from_wxid || ''
            const contextToken = msg.context_token || ''
            if (sender && contextToken) account.contextTokens[sender] = contextToken

            let text = ''
            let msgType = 'text'
            if (msg.content?.text) { text = msg.content.text }
            else if (msg.item_list && Array.isArray(msg.item_list)) {
              for (const item of msg.item_list) {
                if (item.type === 1 && item.text_item?.text) text = item.text_item.text
                else if (item.type === 3 && item.voice_item) { text = item.voice_item.text || '[语音]'; msgType = 'voice' }
                else if (item.type === 4 && item.file_item) { text = `[文件] ${item.file_item.file_name || ''}`; msgType = 'file' }
                else if (item.type === 2 && item.image_item) { text = '[图片]'; msgType = 'image' }
              }
            } else if (msg.text) { text = msg.text }

            this.ctx.logger.info(`微信消息内容: from=${sender}, type=${msgType}, has_ctx=${!!contextToken}, text=${text.slice(0, 100)}`)

            if (text || msgType !== 'text') {
              const senderKey = sender || account.userId || account.wxid
              wsService.broadcastAll({
                type: 'remote_message',
                payload: {
                  platform: 'wechat',
                  text: text || '',
                  sender: senderKey,
                  timestamp: msg.timestamp || msg.msg_time || Date.now(),
                  msgType,
                }
              })
              this.ctx.logger.info(`微信消息已广播给前端: ${text.slice(0, 50)}`)
              remoteAgentRegistry.get('wechat').receive({
                platform: 'wechat',
                text: text || '',
                sender: senderKey,
                timestamp: msg.timestamp || msg.msg_time || Date.now(),
                msgType,
              }).catch((err: any) => this.ctx.logger.error(`微信消息转发 RemoteAgent 失败: ${err.message}`))
              this.ctx.logger.info(`微信消息已转发给 RemoteAgent: ${text.slice(0, 50)}`)
            }
          }
          await this.saveState()
        }
        if (!signal.aborted) {
          this.schedulePolling(account, 1000)
        }
      } catch (err: any) {
        if (signal.aborted) return
        this.ctx.logger.error(`轮询异常: ${err.message}`)
        if (!signal.aborted) {
          this.schedulePolling(account, 5000)
        }
      }
    }
    poll()
  }

  private schedulePolling(account: WechatAccount, delayMs: number): void {
    const existing = this.pollingTimers.get(account.wxid)
    if (existing) clearTimeout(existing)
    this.pollingTimers.set(account.wxid, setTimeout(() => this.startPolling(account), delayMs))
  }

  private stopPolling(wxid: string): void {
    const abortController = this.pollingAbortControllers.get(wxid)
    if (abortController) {
      abortController.abort()
      this.pollingAbortControllers.delete(wxid)
    }
    const timer = this.pollingTimers.get(wxid)
    if (timer) { clearTimeout(timer); this.pollingTimers.delete(wxid) }
  }

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.statePath, 'utf-8')
      const parsed = JSON.parse(content) as StoredState
      this.state = { accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [] }
      const encryption = getEncryptionService()
      for (const acc of this.state.accounts) {
        if (!acc.userId) acc.userId = ''
        if (!acc.contextTokens) acc.contextTokens = {}
        if (acc.token && acc.token.includes(':')) {
          try {
            acc.token = encryption.decrypt(acc.token)
          } catch (e) {
            console.warn('[WechatBot] Token decryption failed', e)
          }
        }
      }
    } catch (e) { console.warn('[WechatBot] Load state failed', e); this.state = { accounts: [] } }
  }

  private async saveState(): Promise<void> {
    try {
      const encryption = getEncryptionService()
      const cloned: StoredState = {
        accounts: this.state.accounts.map(acc => ({
          ...acc,
          token: encryption.encrypt(acc.token),
        }))
      }
      await writeFile(this.statePath, JSON.stringify(cloned, null, 2), 'utf-8')
    } catch (e) { console.warn('[WechatBot] Save state failed', e) }
  }

  private jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  }
}