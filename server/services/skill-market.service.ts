import { Database } from 'bun:sqlite'
import { logger } from './logger.service'
import { ENV } from '../shared/constants'
import { getUnifiedDbPath } from './unified-db-path'

export interface SkillMarketItem {
  id: string
  name: string
  description: string
  author: string
  downloads: number
  rating: number
  tags: string[]
  category?: string
  url?: string
  steps: Record<string, unknown>[]
}

interface SkillMarketRow {
  id: string
  name: string
  description: string
  author: string
  downloads: number
  rating: number
  tags_json: string
  steps_json: string
  category: string | null
  url: string | null
  updated_at: number
}

interface SkillMarketMeta {
  sourceUrl: string
  lastSyncAt: number
  total: number
}

function toNumber(input: unknown, fallback = 0): number {
  const value = Number(input)
  return Number.isFinite(value) ? value : fallback
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return []
}

function sanitizeId(raw: any, fallback: string): string {
  const base = String(raw || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `skill-${Date.now()}`
}

function pickArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const directKeys = ['skills', 'items', 'data', 'list', 'results']
  for (const key of directKeys) {
    const value = (payload as any)[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      if (Array.isArray(value.items)) return value.items
      if (Array.isArray(value.list)) return value.list
      if (Array.isArray(value.skills)) return value.skills
    }
  }

  return []
}

function normalizeClawhubUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const isClawhub = /(^|\.)clawhub\.ai$/i.test(url.hostname)
    if (!isClawhub) return rawUrl

    if (url.pathname.startsWith('/skills')) {
      url.pathname = '/api/v1/skills'
      return url.toString()
    }

    return rawUrl
  } catch {
    return rawUrl
  }
}

function normalizeRemoteSkill(raw: any, index: number): SkillMarketItem {
  const id = sanitizeId(raw?.id || raw?.skillId || raw?.slug || raw?.name || raw?.title, `skill-${index + 1}`)
  const name = String(raw?.name || raw?.title || id)

  return {
    id,
    name,
    description: String(raw?.description || raw?.desc || ''),
    author: String(raw?.author || raw?.creator || raw?.publisher || ''),
    downloads: toNumber(raw?.downloads ?? raw?.downloadCount ?? raw?.usedCount, 0),
    rating: toNumber(raw?.rating ?? raw?.score, 0),
    tags: parseTags(raw?.tags),
    category: String(raw?.category || raw?.type || '通用'),
    url: String(raw?.url || raw?.link || raw?.repoUrl || ''),
    steps: Array.isArray(raw?.steps) ? raw.steps : []
  }
}

export class SkillMarketService {
  private db: Database
  private dbPath: string
  private sourceUrl: string
  private refreshIntervalMs: number

  constructor(_userDataDir?: string) {
    this.dbPath = getUnifiedDbPath()
    this.db = new Database(this.dbPath)
    this.sourceUrl = normalizeClawhubUrl(String(ENV.SKILL_MARKET_API || '').trim())
    this.refreshIntervalMs = toNumber(process.env.SKILL_MARKET_REFRESH_MS, 10 * 60 * 1000)

    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT NOT NULL,
        downloads INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        category TEXT,
        url TEXT,
        raw_json TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  private getMetaNumber(key: string): number {
    const row = this.db.query('SELECT value FROM market_meta WHERE key = ?').get(key) as { value: string } | null
    return row ? toNumber(row.value, 0) : 0
  }

  private getMetaString(key: string): string {
    const row = this.db.query('SELECT value FROM market_meta WHERE key = ?').get(key) as { value: string } | null
    return row ? String(row.value || '') : ''
  }

  private setMeta(key: string, value: string | number) {
    this.db
      .query(`
        INSERT INTO market_meta (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(key, String(value))
  }

  private fetchCount(): number {
    const row = this.db.query('SELECT COUNT(1) as count FROM market_skills').get() as { count: number } | null
    return row?.count || 0
  }

  private fetchRemoteUrl(): string {
    return this.sourceUrl || ''
  }

  private async fetchRemoteSkills(): Promise<SkillMarketItem[]> {
    const url = this.fetchRemoteUrl()
    if (!url) {
      logger.warn('[SkillMarket] SKILL_MARKET_API not configured, returning empty list')
      return []
    }
    logger.info('[SkillMarket] Fetching remote market', { url })

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'DesktopAgentStudio/2.0 SkillMarketFetcher'
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`远程市场请求失败(${response.status})：${text.slice(0, 300)}`)
    }

    const payload = await response.json()
    const sourceItems = pickArray(payload)
    const normalized = sourceItems.map((item, idx) => normalizeRemoteSkill(item, idx))

    return normalized
  }

  private replaceAllSkills(skills: SkillMarketItem[]) {
    const now = Date.now()
    const clearStmt = this.db.query('DELETE FROM market_skills')
    const insertStmt = this.db.query(`
      INSERT INTO market_skills (
        id, name, description, author, downloads, rating, tags_json, steps_json, category, url, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const tx = this.db.transaction(() => {
      clearStmt.run()
      for (const skill of skills) {
        insertStmt.run(
          skill.id,
          skill.name,
          skill.description,
          skill.author,
          skill.downloads,
          skill.rating,
          JSON.stringify(skill.tags || []),
          JSON.stringify(skill.steps || []),
          skill.category || null,
          skill.url || null,
          JSON.stringify(skill),
          now
        )
      }
      this.setMeta('last_sync_at', now)
      this.setMeta('source_url', this.sourceUrl)
      this.setMeta('total', skills.length)
    })

    tx()
  }

  async refreshIfNeeded(force = false): Promise<void> {
    const url = this.fetchRemoteUrl()
    if (!url) {
      logger.debug('[SkillMarket] No remote URL configured, skipping sync')
      return
    }

    const count = this.fetchCount()
    const lastSyncAt = this.getMetaNumber('last_sync_at')
    const stale = Date.now() - lastSyncAt > this.refreshIntervalMs
    const shouldRefresh = force || lastSyncAt === 0 || stale

    if (!shouldRefresh) return

    try {
      const skills = await this.fetchRemoteSkills()
      this.replaceAllSkills(skills)
      logger.info('[SkillMarket] Remote market synced', { total: skills.length, dbPath: this.dbPath })
    } catch (error) {
      if (count > 0) {
        logger.warn('[SkillMarket] Remote sync failed, using cached data', { error })
        return
      }
      logger.error('[SkillMarket] Remote sync failed', { error })
    }
  }

  listSkills(page = 1, pageSize = 10): { skills: SkillMarketItem[]; total: number; page: number; pageSize: number } {
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 10))
    const offset = (safePage - 1) * safePageSize

    const total = this.fetchCount()
    const rows = this.db
      .query(
        `
          SELECT id, name, description, author, downloads, rating, tags_json, steps_json, category, url, updated_at
          FROM market_skills
          ORDER BY downloads DESC, updated_at DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(safePageSize, offset) as SkillMarketRow[]

    return {
      skills: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        author: row.author,
        downloads: row.downloads,
        rating: row.rating,
        tags: JSON.parse(row.tags_json || '[]'),
        steps: JSON.parse(row.steps_json || '[]'),
        category: row.category || '通用',
        url: row.url || ''
      })),
      total,
      page: safePage,
      pageSize: safePageSize
    }
  }

  getSkill(id: string): SkillMarketItem | null {
    const row = this.db
      .query(
        `
          SELECT id, name, description, author, downloads, rating, tags_json, steps_json, category, url, updated_at
          FROM market_skills
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(id) as SkillMarketRow | null

    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      author: row.author,
      downloads: row.downloads,
      rating: row.rating,
      tags: JSON.parse(row.tags_json || '[]'),
      steps: JSON.parse(row.steps_json || '[]'),
      category: row.category || '通用',
      url: row.url || ''
    }
  }

  getMeta(): SkillMarketMeta {
    return {
      sourceUrl: this.getMetaString('source_url') || this.sourceUrl,
      lastSyncAt: this.getMetaNumber('last_sync_at'),
      total: this.fetchCount()
    }
  }

  close() {
    this.db.close()
  }
}

let skillMarketService: SkillMarketService | null = null

export function getSkillMarketService(_userDataDir?: string): SkillMarketService {
  if (!skillMarketService) {
    skillMarketService = new SkillMarketService()
  }

  return skillMarketService
}
