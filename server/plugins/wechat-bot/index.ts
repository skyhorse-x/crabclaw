import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import type { CrabclawPlugin, PluginContext } from '../plugin-types'
import { remoteAgentRegistry } from '../../agents/remote.agent'
import { ensureReadableText } from '../../handlers/chat.handler'

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'
const CHANNEL_VERSION = '1.0.0'
const ILINK_APP_ID = 'bot'
const ILINK_APP_CLIENT_VERSION = 132099
const QR_POLL_INTERVAL_MS = 2000
const QR_POLL_TIMEOUT_MS = 35000
const ILINK_BOT_TYPE = '3'

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

function b64RandomUin(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const hex = buf[0].toString(16).padStart(8, '0')
  return Buffer.from(hex, 'hex').toString('base64')
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

async function apiPost(baseUrl: string, endpoint: string, token: string | null, body: unknown, timeoutMs = 15000): Promise<Response> {
  const headers = iLinkHeaders(token)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${baseUrl}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } finally { clearTimeout(timer) }
}

async function apiGet(baseUrl: string, endpoint: string, token: string | null, timeoutMs = 15000): Promise<Response> {
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
    return await fetch(`${baseUrl}/${endpoint}`, { method: 'GET', headers, signal: controller.signal })
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
  } catch {}
}

/**
 * 向指定用户发送"正在输入"状态。
 * iLink 协议端点：ilink/bot/msg/typing
 * payload 与 sendmessage 类似，message_type=4 表示输入状态事件。
 * 返回 true 表示服务端接受（HTTP 200 且 ret===0），用于首次探测。
 */
async function sendTypingStatus(
  baseUrl: string,
  token: string,
  toUserId: string,
  contextToken?: string
): Promise<boolean> {
  try {
    const body: Record<string, any> = {
      to_user_id: toUserId,
      from_user_id: '',
      ...baseInfo(),
    }
    if (contextToken) body.context_token = contextToken
    const resp = await apiPost(baseUrl, 'ilink/bot/msg/typing', token, body, 5000)
    if (!resp.ok) return false
    const data = await resp.json().catch(() => ({}))
    return (data.ret ?? 0) === 0
  } catch {
    return false
  }
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

export default class WechatBotPlugin implements CrabclawPlugin {
  readonly manifest = {
    id: 'wechat-bot', name: '微信机器人', version: '1.0.0',
    description: '基于腾讯iLink协议的个人微信机器人',
  }

  private ctx!: PluginContext
  private statePath = ''
  private state: StoredState = { accounts: [] }
  private pollingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
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
        notifyStart(account.baseUrl, account.token)
        this.startPolling(account)
      }
    }

    // 注册微信回复函数和 typing 指示器到 CraBot RemoteAgent
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
      const resp = await apiPost(account.baseUrl, 'ilink/bot/sendmessage', account.token, reqBody)
      if (!resp.ok) ctx.logger.error(`[CraBot] 微信回复失败: HTTP ${resp.status}`)
    })

    // 微信 typing 指示器：每 4s 调用 ilink/bot/msg/typing 持续刷新
    wechatAgent.registerTypingIndicator((sender: string) => {
      const account = this.state.accounts[0]
      if (!account?.token) return () => {}

      const toUserId = sender || account.userId
      if (!toUserId) return () => {}

      const contextToken = account.contextTokens[toUserId] || undefined

      const tick = () => {
        sendTypingStatus(account.baseUrl, account.token, toUserId, contextToken)
          .then(ok => {
            if (!ok) ctx.logger.warn('[CraBot] 微信 typing 接口返回失败，可能不支持')
          })
          .catch(() => {})
      }

      tick() // 立即发一次
      const timer = setInterval(tick, 4000)
      ctx.logger.info(`[CraBot] 微信 typing 开始: toUserId=${toUserId.slice(0, 8)}`)

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
      const localTokens = this.state.accounts.map((a) => a.token).filter(Boolean)
      const resp = await apiPost(ILINK_BASE_URL, `ilink/bot/get_bot_qrcode?bot_type=${ILINK_BOT_TYPE}`, null, { local_token_list: localTokens }, 15000)
      if (!resp.ok) return this.jsonResponse({ ok: false, error: `获取二维码失败 (HTTP ${resp.status})` }, 500)
      const data = await resp.json()
      if (!data.qrcode || !data.qrcode_img_content) return this.jsonResponse({ ok: false, error: `获取二维码失败: ${JSON.stringify(data).slice(0, 200)}` }, 500)
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
        const resp = await apiGet(ILINK_BASE_URL, `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(session.qrcode)}`, null, QR_POLL_TIMEOUT_MS)
        if (!resp.ok) return
        const data = await resp.json()
        if (data.status === 'confirmed') {
          if (!data.ilink_bot_id) return
          session.resolved = true; session.token = data.bot_token || ''
          session.wxid = data.ilink_bot_id || ''
          session.baseUrl = data.baseurl || ILINK_BASE_URL
          const botToken = session.token; const botWxid = session.wxid; const botBaseUrl = session.baseUrl; const userWxid = data.ilink_user_id || ''
          if (!botToken || !botWxid) return
          const displayName = typeof data.nickname === 'string' ? data.nickname : (data.ilink_user_id || botWxid)
          const account: WechatAccount = { baseUrl: botBaseUrl, token: botToken, wxid: botWxid, userId: userWxid, nickname: displayName, getUpdatesBuf: '', contextTokens: {}, loggedInAt: Date.now() }
          const existingIdx = this.state.accounts.findIndex((a) => a.wxid === account.wxid)
          if (existingIdx >= 0) this.state.accounts[existingIdx] = account
          else this.state.accounts.push(account)
          await this.saveState()
          if (botToken) {
            notifyStart(botBaseUrl, botToken)
            this.startPolling(account)
          }
          clearInterval(timer); this.loginPollingTimers.delete(sessionId)
        }
      } catch {}
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

      const resp = await apiPost(targetAccount.baseUrl, 'ilink/bot/sendmessage', targetAccount.token, reqBody)
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        this.ctx.logger.error(`发送微信消息HTTP失败: status=${resp.status}, body=${errText.slice(0, 300)}`)
        return this.jsonResponse({ ok: false, error: `发送失败: HTTP ${resp.status}` }, 500)
      }
      const data = await resp.json()

      if (data.ret === 0) {
        this.ctx.logger.info(`发送微信消息成功, to=${toUserId}`)
        return this.jsonResponse({ ok: true, msgId: (data as any).msg_id_str || (data as any).msg_id })
      }

      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.keys(data).length === 0
      ) {
        this.ctx.logger.info(`发送微信消息成功(空响应体按 accepted 处理), to=${toUserId}`)
        return this.jsonResponse({ ok: true, accepted: true })
      }

      if ((data as any).errcode === -14 || data.ret === -14) {
        return this.jsonResponse({ ok: false, error: '会话已过期，请重新登录微信' }, 500)
      }

      this.ctx.logger.error(`发送消息失败: ret=${data.ret}, errcode=${(data as any).errcode}, errmsg=${data.errmsg || '无'}, full=${JSON.stringify(data).slice(0, 300)}`)
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
    this.pollingTimers.delete(account.wxid)
    const poll = async () => {
      try {
        this.ctx.logger.info(`轮询消息: wxid=${account.wxid.slice(0, 8)}..., buf=${account.getUpdatesBuf.slice(0, 20) || '(空)'}`)
        const resp = await apiPost(account.baseUrl, 'ilink/bot/getupdates', account.token, { get_updates_buf: account.getUpdatesBuf, ...baseInfo() }, 40000)
        this.ctx.logger.info(`轮询响应: status=${resp.status}`)
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '')
          this.ctx.logger.error(`轮询HTTP失败: ${resp.status}: ${errText.slice(0, 200)}`)
          this.schedulePolling(account, 5000); return
        }
        const data = await resp.json()
        // iLink API may return ret inside base_resp, or as top-level field, or omit it on success
        const ret = data.ret ?? data.base_resp?.ret ?? data.base_resp?.status_code ?? 0
        this.ctx.logger.info(`轮询数据: ret=${ret}, msgs=${data.msgs?.length || 0}, buf=${(data.get_updates_buf || '').slice(0, 20)}, raw_keys=${Object.keys(data).join(',')}`)

        // Always update buf first — it's valid even when there are no new messages
        if (data.get_updates_buf) {
          account.getUpdatesBuf = data.get_updates_buf
        }

        if (ret === -14) {
          this.ctx.logger.warn(`微信账号 ${account.nickname} 会话过期，停止轮询`)
          this.stopPolling(account.wxid); return
        }
        if (ret !== 0) {
          this.ctx.logger.warn(`轮询非零返回: ret=${ret}, errmsg=${data.errmsg || data.base_resp?.err_msg || '无'}`)
          this.schedulePolling(account, 5000); return
        }

        if (data.msgs && data.msgs.length > 0) {
          this.ctx.logger.info(`收到 ${data.msgs.length} 条微信消息`)
          for (const msg of data.msgs as WechatInboundMessage[]) {
            const sender = msg.from_user_id || msg.from_wxid || ''
            const contextToken = msg.context_token || data.context_token || ''
            if (sender && contextToken) account.contextTokens[sender] = contextToken

            let text = ''; let msgType = 'text'
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
              // 转发给 RemoteAgent 处理（Agent 会调用 AI 并回复）
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
        this.schedulePolling(account, 1000)
      } catch (err: any) {
        this.ctx.logger.error(`轮询异常: ${err.message}`)
        this.schedulePolling(account, 5000)
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
    const timer = this.pollingTimers.get(wxid)
    if (timer) { clearTimeout(timer); this.pollingTimers.delete(wxid) }
  }

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.statePath, 'utf-8')
      const parsed = JSON.parse(content)
      this.state = { accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [] }
      for (const acc of this.state.accounts) {
        if (!acc.userId) acc.userId = ''
        if (!acc.contextTokens) acc.contextTokens = {}
      }
    } catch { this.state = { accounts: [] } }
  }

  private async saveState(): Promise<void> {
    try { await writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8') } catch {}
  }

  private jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  }
}
