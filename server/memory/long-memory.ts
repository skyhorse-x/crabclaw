/**
 * 长期记忆实现
 * 用于存储用户偏好、配置和历史操作等持久化信息
 */

import { createId } from '../shared/utils'
import { logger } from '../services/logger.service'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { MemoryEntry, IMemory, LongMemoryConfig } from './memory.types'
import { PATHS } from '../shared/constants'

/**
 * 长期记忆类
 */
export class LongMemory implements IMemory {
  private entries: Map<string, MemoryEntry> = new Map()
  private config: Required<LongMemoryConfig>
  private initialized: boolean = false

  constructor(config: LongMemoryConfig = {}) {
    this.config = {
      storagePath: config.storagePath || join(PATHS.DATA_DIR, 'long-memory.json'),
      persist: config.persist ?? true,
      ...config
    }
  }

  /**
   * 初始化（加载持久化数据）
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    if (this.config.persist) {
      try {
        await this.load()
      } catch (error: any) {
        logger.warn('[LongMemory] Failed to load persisted data', error)
      }
    }

    this.initialized = true
    logger.info('[LongMemory] Initialized')
  }

  /**
   * 添加记忆
   */
  async add(content: string, metadata?: Record<string, any>): Promise<string> {
    const id = createId('lmem')
    const now = Date.now()

    const entry: MemoryEntry = {
      id,
      content,
      type: 'long',
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      metadata
    }

    this.entries.set(id, entry)
    logger.debug('[LongMemory] Memory added', { id, contentLength: content.length })

    if (this.config.persist) {
      await this.save()
    }

    return id
  }

  /**
   * 获取记忆
   */
  async get(id: string): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id)

    if (!entry) {
      return null
    }

    // 更新访问信息
    entry.lastAccessedAt = Date.now()
    entry.accessCount = (entry.accessCount || 0) + 1

    if (this.config.persist) {
      await this.save()
    }

    return entry
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.entries.delete(id)
    logger.debug('[LongMemory] Memory deleted', { id, deleted })

    if (this.config.persist) {
      await this.save()
    }

    return deleted
  }

  /**
   * 搜索记忆（按元数据或内容）
   */
  async search(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    const queryLower = query.toLowerCase()
    
    const results = Array.from(this.entries.values())
      .filter(entry => {
        // 搜索内容
        if (entry.content.toLowerCase().includes(queryLower)) {
          return true
        }
        
        // 搜索元数据
        if (entry.metadata) {
          const metadataStr = JSON.stringify(entry.metadata).toLowerCase()
          if (metadataStr.includes(queryLower)) {
            return true
          }
        }
        
        return false
      })
      .sort((a, b) => {
        // 按访问频率和时间排序
        const scoreA = (a.accessCount || 0) * 10 + (a.lastAccessedAt || 0)
        const scoreB = (b.accessCount || 0) * 10 + (b.lastAccessedAt || 0)
        return scoreB - scoreA
      })
      .slice(0, limit)

    logger.debug('[LongMemory] Search completed', { query, resultsCount: results.length })

    return results
  }

  /**
   * 获取所有记忆
   */
  async getAll(limit: number = 1000): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values()).slice(0, limit)
  }

  /**
   * 清空记忆
   */
  async clear(): Promise<void> {
    this.entries.clear()
    logger.info('[LongMemory] Memory cleared')

    if (this.config.persist) {
      await this.save()
    }
  }

  /**
   * 获取记忆数量
   */
  async count(): Promise<number> {
    return this.entries.size
  }

  /**
   * 保存记忆到文件
   */
  private async save(): Promise<void> {
    try {
      const data = Array.from(this.entries.values())
      const json = JSON.stringify(data, null, 2)
      
      const dir = this.config.storagePath.substring(0, this.config.storagePath.lastIndexOf('/'))
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }
      
      await writeFile(this.config.storagePath, json, 'utf8')
      logger.debug('[LongMemory] Data saved', { path: this.config.storagePath, count: data.length })
    } catch (error: any) {
      logger.error('[LongMemory] Save failed', error)
    }
  }

  /**
   * 从文件加载记忆
   */
  private async load(): Promise<void> {
    try {
      if (!existsSync(this.config.storagePath)) {
        logger.debug('[LongMemory] No existing data file found')
        return
      }

      const json = await readFile(this.config.storagePath, 'utf8')
      const data: MemoryEntry[] = JSON.parse(json)
      
      this.entries.clear()
      for (const entry of data) {
        this.entries.set(entry.id, entry)
      }
      
      logger.info('[LongMemory] Data loaded', { path: this.config.storagePath, count: data.length })
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('[LongMemory] Load failed', error)
      }
    }
  }

  /**
   * 按类型获取记忆
   */
  async getByType(type: string, limit: number = 100): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values())
      .filter(entry => entry.metadata?.type === type)
      .slice(0, limit)
  }

  /**
   * 获取用户的记忆
   */
  async getByUser(userId: string, limit: number = 100): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values())
      .filter(entry => entry.metadata?.userId === userId)
      .slice(0, limit)
  }
}
