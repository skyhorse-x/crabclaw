import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { Database } from 'bun:sqlite'
import { logger } from './logger.service'

type StoredMessage = {
  role: string
  text: string
  meta?: any
  error?: boolean
}

type StoredConversation = {
  id: string
  title: string
  messages: StoredMessage[]
}

type ChatHistoryRuntimeConfig = {
  platform: NodeJS.Platform
  defaultUserDataDir: string
  currentUserDataDir: string
  dbPath: string
  dbExists: boolean
}

export function getDefaultUserDataDir(): string {
  let home = homedir()
  
  // 安全检查：如果 homedir() 返回无效路径，使用当前工作目录
  if (!home || home.includes('@') || !existsSync(home) || home.includes('472733389qq.com')) {
    home = process.cwd()
  }

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'DesktopAgentStudio')
  }

  if (process.platform === 'win32') {
    // 优先使用 APPDATA 环境变量，如果不存在则使用默认路径
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return path.join(roaming, 'DesktopAgentStudio')
  }

  return path.join(home, '.local', 'share', 'desktop-agent-studio')
}

export class ChatHistoryService {
  private db: Database
  private userDataDir: string
  private dbPath: string

  constructor(userDataDir?: string) {
    this.userDataDir = path.resolve(userDataDir || getDefaultUserDataDir())
    this.dbPath = path.join(this.userDataDir, 'chat-history.db')
    this.ensureDatabaseFile()
    this.db = new Database(this.dbPath)
    this.initSchema()
  }

  private ensureDatabaseFile() {
    try {
      // 额外的安全检查：确保 userDataDir 是有效的目录路径
      if (!this.userDataDir || this.userDataDir.includes('@') || this.userDataDir.includes('472733389qq.com')) {
        this.userDataDir = path.join(process.cwd(), 'DesktopAgentStudio')
        this.dbPath = path.join(this.userDataDir, 'chat-history.db')
      }

      if (!existsSync(this.userDataDir)) {
        mkdirSync(this.userDataDir, { recursive: true })
      }

      if (existsSync(this.dbPath)) {
        return
      }

      const templatePath = path.join(process.cwd(), 'data', 'chat-history.template.db')
      if (!existsSync(path.dirname(templatePath))) {
        mkdirSync(path.dirname(templatePath), { recursive: true })
      }

      if (!existsSync(templatePath)) {
        const templateDb = new Database(templatePath)
        templateDb.exec(`
          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            meta TEXT,
            error INTEGER DEFAULT 0,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
          ON messages(conversation_id, idx);
        `)
        templateDb.close()
      }

      copyFileSync(templatePath, this.dbPath)
    } catch (error) {
      logger.error('[ChatHistory] Ensure database file failed', error)
      // 回退到当前工作目录
      this.userDataDir = path.join(process.cwd(), 'DesktopAgentStudio')
      this.dbPath = path.join(this.userDataDir, 'chat-history.db')
      
      if (!existsSync(this.userDataDir)) {
        mkdirSync(this.userDataDir, { recursive: true })
      }
      
      if (!existsSync(this.dbPath)) {
        const templateDb = new Database(this.dbPath)
        templateDb.exec(`
          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            meta TEXT,
            error INTEGER DEFAULT 0,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
          ON messages(conversation_id, idx);
        `)
        templateDb.close()
      }
    }
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        meta TEXT,
        error INTEGER DEFAULT 0,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id, idx);

      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `)
  }

  getDbPath(): string {
    return this.dbPath
  }

  getRuntimeConfig(): ChatHistoryRuntimeConfig {
    return {
      platform: process.platform,
      defaultUserDataDir: getDefaultUserDataDir(),
      currentUserDataDir: this.userDataDir,
      dbPath: this.dbPath,
      dbExists: existsSync(this.dbPath)
    }
  }

  loadAll(): StoredConversation[] {
    const convRows = this.db
      .query('SELECT id, title FROM conversations ORDER BY updated_at DESC')
      .all() as Array<{ id: string; title: string }>

    const msgStmt = this.db.query(
      'SELECT role, text, meta, error FROM messages WHERE conversation_id = ? ORDER BY idx ASC'
    )

    return convRows.map((row) => {
      const msgRows = msgStmt.all(row.id) as Array<{
        role: string
        text: string
        meta: string | null
        error: number
      }>

      return {
        id: row.id,
        title: row.title,
        messages: msgRows.map((m) => ({
          role: m.role,
          text: m.text,
          meta: m.meta ? JSON.parse(m.meta) : undefined,
          error: Boolean(m.error)
        }))
      }
    })
  }

  saveAll(conversations: StoredConversation[]) {
    const now = Date.now()
    const safeConversations = Array.isArray(conversations) ? conversations : []

    const deleteMessages = this.db.query('DELETE FROM messages')
    const deleteConversations = this.db.query('DELETE FROM conversations')
    const insertConversation = this.db.query(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
    const insertMessage = this.db.query(
      'INSERT INTO messages (conversation_id, idx, role, text, meta, error) VALUES (?, ?, ?, ?, ?, ?)'
    )

    const transaction = this.db.transaction(() => {
      deleteMessages.run()
      deleteConversations.run()

      for (const conversation of safeConversations) {
        const id = String(conversation.id || '')
        if (!id) continue

        const title = String(conversation.title || '新对话')
        insertConversation.run(id, title, now, now)

        const messages = Array.isArray(conversation.messages) ? conversation.messages : []
        messages.forEach((msg, index) => {
          insertMessage.run(
            id,
            index,
            String(msg.role || 'assistant'),
            String(msg.text || ''),
            msg.meta !== undefined ? JSON.stringify(msg.meta) : null,
            msg.error ? 1 : 0
          )
        })
      }
    })

    transaction()
  }

  recordTokenUsage(model: string, promptTokens: number, completionTokens: number, totalTokens: number) {
    const now = Date.now()
    const stmt = this.db.query(
      'INSERT INTO token_usage (model, prompt_tokens, completion_tokens, total_tokens, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(model, promptTokens, completionTokens, totalTokens, now)
  }

  getTokenStats(): { totalPrompt: number; totalCompletion: number; totalTokens: number; byModel: Record<string, { prompt: number; completion: number; total: number }> } {
    const rows = this.db.query('SELECT model, prompt_tokens, completion_tokens, total_tokens FROM token_usage').all() as Array<{
      model: string
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }>

    let totalPrompt = 0
    let totalCompletion = 0
    let totalTokens = 0
    const byModel: Record<string, { prompt: number; completion: number; total: number }> = {}

    for (const row of rows) {
      totalPrompt += row.prompt_tokens
      totalCompletion += row.completion_tokens
      totalTokens += row.total_tokens

      if (!byModel[row.model]) {
        byModel[row.model] = { prompt: 0, completion: 0, total: 0 }
      }
      byModel[row.model].prompt += row.prompt_tokens
      byModel[row.model].completion += row.completion_tokens
      byModel[row.model].total += row.total_tokens
    }

    return { totalPrompt, totalCompletion, totalTokens, byModel }
  }

  close() {
    this.db.close()
  }
}

let chatHistoryService: ChatHistoryService | null = null
let currentUserDataDir: string | null = null

export function getChatHistoryService(userDataDir?: string): ChatHistoryService {
  const resolvedDir = path.resolve(userDataDir || getDefaultUserDataDir())

  if (!chatHistoryService || currentUserDataDir !== resolvedDir) {
    if (chatHistoryService) {
      chatHistoryService.close()
    }
    chatHistoryService = new ChatHistoryService(resolvedDir)
    currentUserDataDir = resolvedDir
    logger.info('[ChatHistory] SQLite initialized', { path: chatHistoryService.getDbPath() })
  }
  return chatHistoryService
}
