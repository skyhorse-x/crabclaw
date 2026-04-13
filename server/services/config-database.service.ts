/**
 * 配置数据库服务
 * 使用 SQLite 保存桌面端所有配置和聊天历史
 */

import { Database } from 'bun:sqlite'
import { logger } from './logger.service'
import { getUnifiedDbPath } from './unified-db-path'

export interface RemoteControlConfig {
  enabled: boolean
  commandPrefix: string
  verifyCode: string
  telegram: {
    enabled: boolean
    botToken: string
    chatId: string
  }
  qq: {
    enabled: boolean
    botId: string
    webhook: string
  }
  wechat: {
    enabled: boolean
    webhook: string
  }
  feishu: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
  discord: {
    enabled: boolean
    botToken: string
    channelId: string
  }
  slack: {
    enabled: boolean
    botToken: string
    channelId: string
  }
  teams: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
  whatsapp: {
    enabled: boolean
    accountSid: string
    authToken: string
    fromNumber: string
  }
}

export interface ChatMessage {
  id?: number
  conversationId: string
  idx: number
  role: string
  text: string
  meta?: string
  error: boolean
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export class ConfigDatabaseService {
  private db: Database
  private dbPath: string

  constructor(_userDataDir?: string) {
    this.dbPath = getUnifiedDbPath()
    this.db = new Database(this.dbPath)
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS remote_control_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        enabled INTEGER DEFAULT 0,
        command_prefix TEXT DEFAULT '/agent',
        verify_code TEXT DEFAULT '',
        telegram_enabled INTEGER DEFAULT 0,
        telegram_bot_token TEXT DEFAULT '',
        telegram_chat_id TEXT DEFAULT '',
        qq_enabled INTEGER DEFAULT 0,
        qq_bot_id TEXT DEFAULT '',
        qq_webhook TEXT DEFAULT '',
        wechat_enabled INTEGER DEFAULT 0,
        wechat_webhook TEXT DEFAULT '',
        feishu_enabled INTEGER DEFAULT 0,
        feishu_app_id TEXT DEFAULT '',
        feishu_app_secret TEXT DEFAULT '',
        feishu_webhook TEXT DEFAULT '',
        discord_enabled INTEGER DEFAULT 0,
        discord_bot_token TEXT DEFAULT '',
        discord_channel_id TEXT DEFAULT '',
        slack_enabled INTEGER DEFAULT 0,
        slack_bot_token TEXT DEFAULT '',
        slack_channel_id TEXT DEFAULT '',
        teams_enabled INTEGER DEFAULT 0,
        teams_app_id TEXT DEFAULT '',
        teams_app_secret TEXT DEFAULT '',
        teams_webhook TEXT DEFAULT '',
        whatsapp_enabled INTEGER DEFAULT 0,
        whatsapp_account_sid TEXT DEFAULT '',
        whatsapp_auth_token TEXT DEFAULT '',
        whatsapp_from_number TEXT DEFAULT '',
        updated_at INTEGER NOT NULL
      )
    `)

    const existing = this.db.query('SELECT COUNT(*) as count FROM remote_control_config').get() as { count: number }
    if (existing.count === 0) {
      this.db.query('INSERT INTO remote_control_config (id, updated_at) VALUES (1, ?)').run(Date.now())
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        meta TEXT,
        error INTEGER DEFAULT 0,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id, idx)
    `)

    logger.info('[ConfigDB] Database initialized', { path: this.dbPath })
  }

  // ============ Remote Control Config ============

  getRemoteControlConfig(): RemoteControlConfig {
    const row = this.db.query('SELECT * FROM remote_control_config WHERE id = 1').get() as any

    if (!row) {
      return this.getDefaultRemoteControlConfig()
    }

    return {
      enabled: Boolean(row.enabled),
      commandPrefix: row.command_prefix || '/agent',
      verifyCode: row.verify_code || '',
      telegram: {
        enabled: Boolean(row.telegram_enabled),
        botToken: row.telegram_bot_token || '',
        chatId: row.telegram_chat_id || ''
      },
      qq: {
        enabled: Boolean(row.qq_enabled),
        botId: row.qq_bot_id || '',
        webhook: row.qq_webhook || ''
      },
      wechat: {
        enabled: Boolean(row.wechat_enabled),
        webhook: row.wechat_webhook || ''
      },
      feishu: {
        enabled: Boolean(row.feishu_enabled),
        appId: row.feishu_app_id || '',
        appSecret: row.feishu_app_secret || '',
        webhook: row.feishu_webhook || ''
      },
      discord: {
        enabled: Boolean(row.discord_enabled),
        botToken: row.discord_bot_token || '',
        channelId: row.discord_channel_id || ''
      },
      slack: {
        enabled: Boolean(row.slack_enabled),
        botToken: row.slack_bot_token || '',
        channelId: row.slack_channel_id || ''
      },
      teams: {
        enabled: Boolean(row.teams_enabled),
        appId: row.teams_app_id || '',
        appSecret: row.teams_app_secret || '',
        webhook: row.teams_webhook || ''
      },
      whatsapp: {
        enabled: Boolean(row.whatsapp_enabled),
        accountSid: row.whatsapp_account_sid || '',
        authToken: row.whatsapp_auth_token || '',
        fromNumber: row.whatsapp_from_number || ''
      }
    }
  }

  saveRemoteControlConfig(config: RemoteControlConfig): boolean {
    try {
      this.db.query(`
        UPDATE remote_control_config SET
          enabled = ?,
          command_prefix = ?,
          verify_code = ?,
          telegram_enabled = ?,
          telegram_bot_token = ?,
          telegram_chat_id = ?,
          qq_enabled = ?,
          qq_bot_id = ?,
          qq_webhook = ?,
          wechat_enabled = ?,
          wechat_webhook = ?,
          feishu_enabled = ?,
          feishu_app_id = ?,
          feishu_app_secret = ?,
          feishu_webhook = ?,
          discord_enabled = ?,
          discord_bot_token = ?,
          discord_channel_id = ?,
          slack_enabled = ?,
          slack_bot_token = ?,
          slack_channel_id = ?,
          teams_enabled = ?,
          teams_app_id = ?,
          teams_app_secret = ?,
          teams_webhook = ?,
          whatsapp_enabled = ?,
          whatsapp_account_sid = ?,
          whatsapp_auth_token = ?,
          whatsapp_from_number = ?,
          updated_at = ?
        WHERE id = 1
      `).run(
        config.enabled ? 1 : 0,
        config.commandPrefix,
        config.verifyCode,
        config.telegram.enabled ? 1 : 0,
        config.telegram.botToken,
        config.telegram.chatId,
        config.qq.enabled ? 1 : 0,
        config.qq.botId,
        config.qq.webhook,
        config.wechat.enabled ? 1 : 0,
        config.wechat.webhook,
        config.feishu.enabled ? 1 : 0,
        config.feishu.appId,
        config.feishu.appSecret,
        config.feishu.webhook,
        config.discord.enabled ? 1 : 0,
        config.discord.botToken,
        config.discord.channelId,
        config.slack.enabled ? 1 : 0,
        config.slack.botToken,
        config.slack.channelId,
        config.teams.enabled ? 1 : 0,
        config.teams.appId,
        config.teams.appSecret,
        config.teams.webhook,
        config.whatsapp.enabled ? 1 : 0,
        config.whatsapp.accountSid,
        config.whatsapp.authToken,
        config.whatsapp.fromNumber,
        Date.now()
      )

      logger.info('[ConfigDB] Remote control config saved')
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to save remote control config', error)
      return false
    }
  }

  // ============ Generic Config ============

  getConfig(key: string): string | null {
    const row = this.db.query('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value || null
  }

  setConfig(key: string, value: string): boolean {
    try {
      this.db.query('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, Date.now())
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to set config', { key, error })
      return false
    }
  }

  getAllConfigs(): Record<string, string> {
    const rows = this.db.query('SELECT key, value FROM config').all() as Array<{ key: string; value: string }>
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  // ============ Chat History ============

  getConversations(limit: number = 50): Conversation[] {
    const rows = this.db.query(
      'SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations ORDER BY updated_at DESC LIMIT ?'
    ).all(limit) as Conversation[]
    return rows
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.query(
      'SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?'
    ).get(id) as Conversation | undefined
    return row || null
  }

  createConversation(id: string, title: string): boolean {
    try {
      const now = Date.now()
      this.db.query('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, title, now, now)
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to create conversation', { id, error })
      return false
    }
  }

  updateConversation(id: string, title: string): boolean {
    try {
      this.db.query('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id)
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to update conversation', { id, error })
      return false
    }
  }

  deleteConversation(id: string): boolean {
    try {
      this.db.query('DELETE FROM messages WHERE conversation_id = ?').run(id)
      this.db.query('DELETE FROM conversations WHERE id = ?').run(id)
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to delete conversation', { id, error })
      return false
    }
  }

  getMessages(conversationId: string): ChatMessage[] {
    const rows = this.db.query(
      'SELECT id, conversation_id as conversationId, idx, role, text, meta, error FROM messages WHERE conversation_id = ? ORDER BY idx'
    ).all(conversationId) as Array<{ id: number; conversationId: string; idx: number; role: string; text: string; meta: string | null; error: number }>

    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversationId,
      idx: row.idx,
      role: row.role,
      text: row.text,
      meta: row.meta || undefined,
      error: Boolean(row.error)
    }))
  }

  addMessage(conversationId: string, role: string, text: string, meta?: string, error: boolean = false): boolean {
    try {
      const maxIdx = this.db.query(
        'SELECT COALESCE(MAX(idx), -1) as maxIdx FROM messages WHERE conversation_id = ?'
      ).get(conversationId) as { maxIdx: number }

      const idx = maxIdx.maxIdx + 1
      this.db.query(
        'INSERT INTO messages (conversation_id, idx, role, text, meta, error) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(conversationId, idx, role, text, meta || null, error ? 1 : 0)

      this.db.query('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId)
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to add message', { conversationId, error })
      return false
    }
  }

  clearMessages(conversationId: string): boolean {
    try {
      this.db.query('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
      return true
    } catch (error) {
      logger.error('[ConfigDB] Failed to clear messages', { conversationId, error })
      return false
    }
  }

  // ============

  private getDefaultRemoteControlConfig(): RemoteControlConfig {
    return {
      enabled: false,
      commandPrefix: '/agent',
      verifyCode: '',
      telegram: { enabled: false, botToken: '', chatId: '' },
      qq: { enabled: false, botId: '', webhook: '' },
      wechat: { enabled: false, webhook: '' },
      feishu: { enabled: false, appId: '', appSecret: '', webhook: '' },
      discord: { enabled: false, botToken: '', channelId: '' },
      slack: { enabled: false, botToken: '', channelId: '' },
      teams: { enabled: false, appId: '', appSecret: '', webhook: '' },
      whatsapp: { enabled: false, accountSid: '', authToken: '', fromNumber: '' }
    }
  }

  close() {
    this.db.close()
  }
}

let configDbInstance: ConfigDatabaseService | null = null

export function getConfigDatabase(): ConfigDatabaseService {
  if (!configDbInstance) {
    configDbInstance = new ConfigDatabaseService()
  }
  return configDbInstance
}
