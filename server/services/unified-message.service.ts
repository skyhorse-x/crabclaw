import { logger } from './logger.service'
import { getConfigDatabase } from './config-database.service'

export interface MessagePayload {
  platform: 'telegram' | 'qq' | 'wechat' | 'feishu' | 'discord' | 'slack' | 'teams' | 'whatsapp'
  content: string
  chatId?: string
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'plain'
}

export interface SendResult {
  ok: boolean
  platform: string
  messageId?: string
  error?: string
}

interface PlatformSender {
  send(content: string, chatId?: string, parseMode?: MessagePayload['parseMode']): Promise<SendResult>
}

function getProxyConfig() {
  try {
    const configDb = getConfigDatabase()
    const json = configDb.getAppConfigJson()
    if (json) {
      const parsed = JSON.parse(json)
      return parsed?.settings?.proxy
    }
  } catch {
  }
  return undefined
}

async function fetchWithProxy(url: string, options: RequestInit, useProxy: boolean): Promise<Response> {
  if (!useProxy) {
    return fetch(url, options)
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
    return await fetch(url, options)
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

class TelegramSender implements PlatformSender {
  private botToken: string
  private defaultChatId: string
  private proxyEnabled: boolean

  constructor(botToken: string, defaultChatId: string = '', proxyEnabled: boolean = false) {
    this.botToken = botToken
    this.defaultChatId = defaultChatId
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, chatId?: string, parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.botToken) {
      return { ok: false, platform: 'telegram', error: 'Bot token 未配置' }
    }

    try {
      const targetChatId = chatId || this.defaultChatId
      if (!targetChatId) {
        return { ok: false, platform: 'telegram', error: 'chat_id 未配置，请在设置中填写 Chat ID' }
      }
      const body: Record<string, unknown> = {
        chat_id: targetChatId,
        text: content
      }
      if (parseMode && parseMode !== 'plain') {
        body.parse_mode = parseMode
      }

      const response = await fetchWithProxy(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }, this.proxyEnabled)

      if (!response.ok) {
        const err = await response.text()
        return { ok: false, platform: 'telegram', error: `HTTP ${response.status}: ${err}` }
      }

      const data = await response.json() as { ok: boolean; result?: { message_id: number } }
      return {
        ok: true,
        platform: 'telegram',
        messageId: String(data.result?.message_id || '')
      }
    } catch (error) {
      return { ok: false, platform: 'telegram', error: String(error) }
    }
  }
}

class QQSender implements PlatformSender {
  private webhook: string
  private proxyEnabled: boolean

  constructor(webhook: string = '', proxyEnabled: boolean = false) {
    this.webhook = webhook
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, _chatId?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.webhook) {
      return { ok: false, platform: 'qq', error: 'QQ webhook 未配置' }
    }

    try {
      const response = await fetchWithProxy(this.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content
        })
      }, this.proxyEnabled)

      if (!response.ok) {
        return { ok: false, platform: 'qq', error: `HTTP ${response.status}` }
      }

      return { ok: true, platform: 'qq' }
    } catch (error) {
      return { ok: false, platform: 'qq', error: String(error) }
    }
  }
}

class WechatSender implements PlatformSender {
  private webhook: string
  private proxyEnabled: boolean

  constructor(webhook: string = '', proxyEnabled: boolean = false) {
    this.webhook = webhook
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, _chatId?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.webhook) {
      return { ok: false, platform: 'wechat', error: '微信 webhook 未配置' }
    }

    try {
      const response = await fetchWithProxy(this.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content }
        })
      }, this.proxyEnabled)

      if (!response.ok) {
        return { ok: false, platform: 'wechat', error: `HTTP ${response.status}` }
      }

      return { ok: true, platform: 'wechat' }
    } catch (error) {
      return { ok: false, platform: 'wechat', error: String(error) }
    }
  }
}

class FeishuSender implements PlatformSender {
  private webhook: string
  private proxyEnabled: boolean

  constructor(webhook: string = '', proxyEnabled: boolean = false) {
    this.webhook = webhook
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, _chatId?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.webhook) {
      return { ok: false, platform: 'feishu', error: '飞书 webhook 未配置' }
    }

    try {
      const response = await fetchWithProxy(this.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: content }
        })
      }, this.proxyEnabled)

      if (!response.ok) {
        return { ok: false, platform: 'feishu', error: `HTTP ${response.status}` }
      }

      return { ok: true, platform: 'feishu' }
    } catch (error) {
      return { ok: false, platform: 'feishu', error: String(error) }
    }
  }
}

class DiscordSender implements PlatformSender {
  private botToken: string
  private defaultChannelId: string
  private proxyEnabled: boolean

  constructor(botToken: string = '', defaultChannelId: string = '', proxyEnabled: boolean = false) {
    this.botToken = botToken
    this.defaultChannelId = defaultChannelId
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, channelId?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.botToken) {
      return { ok: false, platform: 'discord', error: 'Discord bot token 未配置' }
    }

    try {
      const targetChannelId = channelId || this.defaultChannelId
      const response = await fetchWithProxy(`https://discord.com/api/v10/channels/${targetChannelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ content })
      }, this.proxyEnabled)

      if (!response.ok) {
        const err = await response.text()
        return { ok: false, platform: 'discord', error: `HTTP ${response.status}: ${err}` }
      }

      const data = await response.json() as { id: string }
      return { ok: true, platform: 'discord', messageId: data.id }
    } catch (error) {
      return { ok: false, platform: 'discord', error: String(error) }
    }
  }
}

class SlackSender implements PlatformSender {
  private botToken: string
  private defaultChannelId: string
  private proxyEnabled: boolean

  constructor(botToken: string = '', defaultChannelId: string = '', proxyEnabled: boolean = false) {
    this.botToken = botToken
    this.defaultChannelId = defaultChannelId
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, channelId?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.botToken) {
      return { ok: false, platform: 'slack', error: 'Slack bot token 未配置' }
    }

    try {
      const targetChannelId = channelId || this.defaultChannelId
      const response = await fetchWithProxy('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          channel: targetChannelId,
          text: content
        })
      }, this.proxyEnabled)

      const data = await response.json() as { ok: boolean; error?: string; ts?: string }
      if (!data.ok) {
        return { ok: false, platform: 'slack', error: data.error || 'Unknown error' }
      }

      return { ok: true, platform: 'slack', messageId: data.ts }
    } catch (error) {
      return { ok: false, platform: 'slack', error: String(error) }
    }
  }
}

class TeamsSender implements PlatformSender {
  private webhook: string
  private proxyEnabled: boolean

  constructor(webhook: string = '', proxyEnabled: boolean = false) {
    this.webhook = webhook
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, _chatId?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.webhook) {
      return { ok: false, platform: 'teams', error: 'Teams webhook 未配置' }
    }

    try {
      const response = await fetchWithProxy(this.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          themeColor: '0076D7',
          summary: 'Desktop Agent Message',
          sections: [{ activityTitle: 'Desktop Agent', activitySubtitle: '', text: content }]
        })
      }, this.proxyEnabled)

      if (!response.ok) {
        return { ok: false, platform: 'teams', error: `HTTP ${response.status}` }
      }

      return { ok: true, platform: 'teams' }
    } catch (error) {
      return { ok: false, platform: 'teams', error: String(error) }
    }
  }
}

class WhatsAppSender implements PlatformSender {
  private accountSid: string
  private authToken: string
  private fromNumber: string
  private proxyEnabled: boolean

  constructor(accountSid: string = '', authToken: string = '', fromNumber: string = '', proxyEnabled: boolean = false) {
    this.accountSid = accountSid
    this.authToken = authToken
    this.fromNumber = fromNumber
    this.proxyEnabled = proxyEnabled
  }

  async send(content: string, to?: string, _parseMode?: MessagePayload['parseMode']): Promise<SendResult> {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      return { ok: false, platform: 'whatsapp', error: 'Twilio WhatsApp 配置不完整' }
    }

    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')
      const response = await fetchWithProxy(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'content-type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            From: this.fromNumber,
            To: to || this.fromNumber,
            Body: content
          })
        },
        this.proxyEnabled
      )

      if (!response.ok) {
        const err = await response.text()
        return { ok: false, platform: 'whatsapp', error: `HTTP ${response.status}: ${err}` }
      }

      const data = await response.json() as { sid: string }
      return { ok: true, platform: 'whatsapp', messageId: data.sid }
    } catch (error) {
      return { ok: false, platform: 'whatsapp', error: String(error) }
    }
  }
}

class UnifiedMessageService {
  private telegram: TelegramSender
  private qq: QQSender
  private wechat: WechatSender
  private feishu: FeishuSender
  private discord: DiscordSender
  private slack: SlackSender
  private teams: TeamsSender
  private whatsapp: WhatsAppSender

  constructor() {
    this.telegram = new TelegramSender('', '')
    this.qq = new QQSender('')
    this.wechat = new WechatSender('')
    this.feishu = new FeishuSender('')
    this.discord = new DiscordSender('', '')
    this.slack = new SlackSender('', '')
    this.teams = new TeamsSender('')
    this.whatsapp = new WhatsAppSender('', '', '')
  }

  updateConfig(config: {
    telegram?: { botToken?: string; chatId?: string; proxyEnabled?: boolean }
    qq?: { webhook?: string; botId?: string; proxyEnabled?: boolean; appSecret?: string }
    wechat?: { webhook?: string; proxyEnabled?: boolean }
    feishu?: { webhook?: string; proxyEnabled?: boolean }
    discord?: { botToken?: string; channelId?: string; proxyEnabled?: boolean }
    slack?: { botToken?: string; channelId?: string; proxyEnabled?: boolean }
    teams?: { webhook?: string; proxyEnabled?: boolean }
    whatsapp?: { accountSid?: string; authToken?: string; fromNumber?: string; proxyEnabled?: boolean }
  }) {
    if (config.telegram) {
      this.telegram = new TelegramSender(
        config.telegram.botToken || '',
        config.telegram.chatId || '',
        config.telegram.proxyEnabled ?? false
      )
    }
    if (config.qq) {
      this.qq = new QQSender(config.qq.webhook || '', config.qq.proxyEnabled ?? false)
    }
    if (config.wechat) {
      this.wechat = new WechatSender(config.wechat.webhook || '', config.wechat.proxyEnabled ?? false)
    }
    if (config.feishu) {
      this.feishu = new FeishuSender(config.feishu.webhook || '', config.feishu.proxyEnabled ?? false)
    }
    if (config.discord) {
      this.discord = new DiscordSender(
        config.discord.botToken || '',
        config.discord.channelId || '',
        config.discord.proxyEnabled ?? false
      )
    }
    if (config.slack) {
      this.slack = new SlackSender(
        config.slack.botToken || '',
        config.slack.channelId || '',
        config.slack.proxyEnabled ?? false
      )
    }
    if (config.teams) {
      this.teams = new TeamsSender(config.teams.webhook || '', config.teams.proxyEnabled ?? false)
    }
    if (config.whatsapp) {
      this.whatsapp = new WhatsAppSender(
        config.whatsapp.accountSid || '',
        config.whatsapp.authToken || '',
        config.whatsapp.fromNumber || '',
        config.whatsapp.proxyEnabled ?? false
      )
    }
    logger.info('[UnifiedMessage] Config updated')
  }

  async send(payload: MessagePayload): Promise<SendResult> {
    const { platform, content, chatId, parseMode } = payload

    logger.info('[UnifiedMessage] Sending message', {
      platform,
      contentLength: String(content || '').length,
      parseMode: parseMode || 'plain'
    })

    let result: SendResult
    switch (platform) {
      case 'telegram':
        result = await this.telegram.send(content, chatId, parseMode)
        break
      case 'qq':
        result = await this.qq.send(content, chatId, parseMode)
        break
      case 'wechat':
        result = await this.wechat.send(content, chatId, parseMode)
        break
      case 'feishu':
        result = await this.feishu.send(content, chatId, parseMode)
        break
      case 'discord':
        result = await this.discord.send(content, chatId, parseMode)
        break
      case 'slack':
        result = await this.slack.send(content, chatId, parseMode)
        break
      case 'teams':
        result = await this.teams.send(content, chatId, parseMode)
        break
      case 'whatsapp':
        result = await this.whatsapp.send(content, chatId, parseMode)
        break
      default:
        result = { ok: false, platform, error: `未知平台: ${platform}` }
    }

    if (result.ok) {
      logger.info('[UnifiedMessage] Message sent successfully', {
        platform,
        messageId: result.messageId
      })
    } else {
      logger.error('[UnifiedMessage] Message send failed', {
        platform,
        error: result.error
      })
    }

    return result
  }

  async sendToAll(content: string): Promise<SendResult[]> {
    const results: SendResult[] = []

    const platforms: Array<'telegram' | 'qq' | 'wechat' | 'feishu'> = ['telegram', 'qq', 'wechat', 'feishu']
    for (const platform of platforms) {
      const result = await this.send({ platform, content })
      results.push(result)
    }

    return results
  }

  getAvailablePlatforms(): string[] {
    return ['telegram', 'qq', 'wechat', 'feishu']
  }
}

export const unifiedMessageService = new UnifiedMessageService()
