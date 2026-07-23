import { existsSync } from 'node:fs'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { logger } from './logger.service'
import { getUnifiedDbPath } from './unified-db-path'

type StoredMessage = {
  role: string
  text: string
  meta?: any
  error?: boolean
  typing?: boolean
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
  return path.dirname(getUnifiedDbPath())
}

export class ChatHistoryService {
  private db: Database
  private dbPath: string

  constructor(_userDataDir?: string) {
    this.dbPath = getUnifiedDbPath()
    this.db = new Database(this.dbPath)
    this.initSchema()
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
        typing INTEGER DEFAULT 0,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_id
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
    this.ensureTypingColumn()
  }

  private ensureTypingColumn() {
    try {
      const columns = this.db.query('PRAGMA table_info(messages)').all() as Array<{ name?: string }>
      const hasTyping = columns.some((column) => String(column?.name || '') === 'typing')
      if (!hasTyping) {
        this.db.exec(`ALTER TABLE messages ADD COLUMN typing INTEGER DEFAULT 0`)
      }
    } catch (error) {
      logger.warn('[ChatHistory] Ensure typing column failed', { error })
    }
  }

  getDbPath(): string {
    return this.dbPath
  }

  getRuntimeConfig(): ChatHistoryRuntimeConfig {
    return {
      platform: process.platform,
      defaultUserDataDir: getDefaultUserDataDir(),
      currentUserDataDir: path.dirname(this.dbPath),
      dbPath: this.dbPath,
      dbExists: existsSync(this.dbPath)
    }
  }

  loadAll(): StoredConversation[] {
    const convRows = this.db
      .query('SELECT id, title FROM conversations ORDER BY updated_at DESC')
      .all() as Array<{ id: string; title: string }>

    const msgStmt = this.db.query(
      'SELECT role, text, meta, error, typing FROM messages WHERE conversation_id = ? ORDER BY idx ASC'
    )

    return convRows.map((row) => {
      const msgRows = msgStmt.all(row.id) as Array<{
        role: string
        text: string
        meta: string | null
        error: number
        typing: number
      }>

      return {
        id: row.id,
        title: row.title,
        messages: msgRows.map((m) => ({
          role: m.role,
          text: m.text,
          meta: m.meta ? JSON.parse(m.meta) : undefined,
          error: Boolean(m.error),
          typing: Boolean(m.typing)
        }))
      }
    })
  }

  saveAll(conversations: StoredConversation[]) {
    const now = Date.now()
    const safeConversations = Array.isArray(conversations) ? conversations : []
    const incomingIds = new Set<string>()

    for (const conversation of safeConversations) {
      const id = String(conversation?.id || '').trim()
      if (id) incomingIds.add(id)
    }

    const upsertConversation = this.db.query(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at'
    )
    const upsertMessage = this.db.query(
      'INSERT INTO messages (conversation_id, idx, role, text, meta, error, typing) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(conversation_id, idx) DO UPDATE SET ' +
      'role = excluded.role, text = excluded.text, meta = excluded.meta, error = excluded.error, typing = excluded.typing'
    )
    const existingConvIds = this.db
      .query('SELECT id FROM conversations')
      .all() as Array<{ id: string }>
    const removedConvIds = existingConvIds
      .map((row) => String(row.id || ''))
      .filter((id) => id && !incomingIds.has(id))
    const deleteMessagesByConvFromIdx = this.db.query(
      'DELETE FROM messages WHERE conversation_id = ? AND idx >= ?'
    )
    const deleteStaleMessage = this.db.query(
      'DELETE FROM messages WHERE conversation_id = ? AND idx = ?'
    )
    const deleteRemovedConv = this.db.query('DELETE FROM conversations WHERE id = ?')
    const selectConvMsgIdxs = this.db.query(
      'SELECT idx FROM messages WHERE conversation_id = ?'
    )
    const maxIdxForConv = this.db.query(
      'SELECT COALESCE(MAX(idx), -1) AS max_idx FROM messages WHERE conversation_id = ?'
    )

    const transaction = this.db.transaction(() => {
      for (const conversation of safeConversations) {
        const id = String(conversation.id || '').trim()
        if (!id) continue

        const title = String(conversation.title || '新对话')
        const existingTitle = this.db
          .query('SELECT created_at FROM conversations WHERE id = ?')
          .get(id) as { created_at?: number } | undefined
        const createdAt = Number(existingTitle?.created_at) || now
        upsertConversation.run(id, title, createdAt, now)

        const messages = Array.isArray(conversation.messages) ? conversation.messages : []
        const maxIdxRow = maxIdxForConv.get(id) as { max_idx?: number } | undefined
        const maxIdx = Number(maxIdxRow?.max_idx ?? -1)
        const incomingMaxIdx = messages.length - 1

        const existingIdxRows = selectConvMsgIdxs.all(id) as Array<{ idx: number }>
        const existingIdxs = new Set(existingIdxRows.map((row) => Number(row.idx)))
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i]
          upsertMessage.run(
            id,
            i,
            String(msg.role || 'assistant'),
            String(msg.text || ''),
            msg.meta !== undefined ? JSON.stringify(msg.meta) : null,
            msg.error ? 1 : 0,
            msg.typing ? 1 : 0
          )
          existingIdxs.delete(i)
        }

        for (const staleIdx of existingIdxs) {
          deleteStaleMessage.run(id, Number(staleIdx))
        }

        if (incomingMaxIdx < maxIdx) {
          deleteMessagesByConvFromIdx.run(id, incomingMaxIdx + 1)
        }
      }

      for (const removedId of removedConvIds) {
        deleteRemovedConv.run(removedId)
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
