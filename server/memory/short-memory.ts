/**
 * 短期记忆实现
 * 用于存储当前对话上下文和临时信息
 */

import { createId } from '../shared/utils'
import { logger } from '../services/logger.service'
import type { MemoryEntry, IMemory, ShortMemoryConfig } from './memory.types'

/**
 * 短期记忆类
 */
export class ShortMemory implements IMemory {
  private entries: Map<string, MemoryEntry> = new Map()
  private config: Required<ShortMemoryConfig>

  constructor(config: ShortMemoryConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries || 100,
      ttl: config.ttl || 3600000, // 默认 1 小时
      ...config
    }
  }

  /**
   * 添加记忆
   */
  async add(content: string, metadata?: Record<string, any>): Promise<string> {
    // 清理过期记忆
    await this.cleanup()

    const id = createId('mem')
    const now = Date.now()

    const entry: MemoryEntry = {
      id,
      content,
      type: 'short',
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      metadata,
      expiresAt: now + this.config.ttl
    }

    // 检查是否超过最大数量
    if (this.entries.size >= this.config.maxEntries) {
      // 删除最旧的记忆
      const oldestId = Array.from(this.entries.keys())[0]
      await this.delete(oldestId)
    }

    this.entries.set(id, entry)
    logger.debug('[ShortMemory] Memory added', { id, contentLength: content.length })

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

    // 检查是否过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await this.delete(id)
      return null
    }

    // 更新访问信息
    entry.lastAccessedAt = Date.now()
    entry.accessCount = (entry.accessCount || 0) + 1

    return entry
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.entries.delete(id)
    logger.debug('[ShortMemory] Memory deleted', { id, deleted })
    return deleted
  }

  /**
   * 搜索记忆（简单文本匹配）
   */
  async search(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    const queryLower = query.toLowerCase()
    
    const results = Array.from(this.entries.values())
      .filter(entry => {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          return false
        }
        return entry.content.toLowerCase().includes(queryLower)
      })
      .sort((a, b) => {
        // 按相关性和访问时间排序
        const scoreA = (a.accessCount || 0) * 10 + (a.lastAccessedAt || 0)
        const scoreB = (b.accessCount || 0) * 10 + (b.lastAccessedAt || 0)
        return scoreB - scoreA
      })
      .slice(0, limit)

    logger.debug('[ShortMemory] Search completed', { query, resultsCount: results.length })

    return results
  }

  /**
   * 获取所有记忆
   */
  async getAll(limit: number = 100): Promise<MemoryEntry[]> {
    const results = Array.from(this.entries.values())
      .filter(entry => {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          return false
        }
        return true
      })
      .slice(0, limit)

    return results
  }

  /**
   * 清空记忆
   */
  async clear(): Promise<void> {
    this.entries.clear()
    logger.info('[ShortMemory] Memory cleared')
  }

  /**
   * 获取记忆数量
   */
  async count(): Promise<number> {
    return this.entries.size
  }

  /**
   * 清理过期记忆
   */
  private async cleanup(): Promise<void> {
    const now = Date.now()
    const toDelete: string[] = []

    for (const [id, entry] of this.entries.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        toDelete.push(id)
      }
    }

    for (const id of toDelete) {
      this.entries.delete(id)
    }

    if (toDelete.length > 0) {
      logger.debug('[ShortMemory] Cleanup completed', { deletedCount: toDelete.length })
    }
  }

  /**
   * 获取最近 N 条记忆
   */
  async getRecent(limit: number = 10): Promise<MemoryEntry[]> {
    return Array.from(this.entries.values())
      .filter(entry => {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          return false
        }
        return true
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }
}
