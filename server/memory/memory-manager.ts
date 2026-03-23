/**
 * 记忆管理器
 * 统一管理短期记忆和长期记忆
 */

import { logger } from '../services/logger.service'
import { ShortMemory } from './short-memory'
import { LongMemory } from './long-memory'
import type { MemoryEntry, MemoryContext, ShortMemoryConfig, LongMemoryConfig } from './memory.types'

/**
 * 记忆管理器配置
 */
export interface MemoryManagerConfig {
  /**
   * 短期记忆配置
   */
  short?: ShortMemoryConfig

  /**
   * 长期记忆配置
   */
  long?: LongMemoryConfig

  /**
   * 是否启用长期记忆持久化
   */
  persist?: boolean
}

/**
 * 记忆管理器类
 */
export class MemoryManager {
  private shortMemory: ShortMemory
  private longMemory: LongMemory
  private initialized: boolean = false

  constructor(config: MemoryManagerConfig = {}) {
    this.shortMemory = new ShortMemory(config.short)
    this.longMemory = new LongMemory({
      persist: config.persist ?? true,
      ...config.long
    })
  }

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.longMemory.initialize()
    this.initialized = true
    logger.info('[MemoryManager] Memory system initialized')
  }

  /**
   * 添加短期记忆
   */
  async addShort(content: string, metadata?: Record<string, any>): Promise<string> {
    return await this.shortMemory.add(content, metadata)
  }

  /**
   * 添加长期记忆
   */
  async addLong(content: string, metadata?: Record<string, any>): Promise<string> {
    return await this.longMemory.add(content, metadata)
  }

  /**
   * 获取短期记忆
   */
  async getShort(id: string): Promise<MemoryEntry | null> {
    return await this.shortMemory.get(id)
  }

  /**
   * 获取长期记忆
   */
  async getLong(id: string): Promise<MemoryEntry | null> {
    return await this.longMemory.get(id)
  }

  /**
   * 删除短期记忆
   */
  async deleteShort(id: string): Promise<boolean> {
    return await this.shortMemory.delete(id)
  }

  /**
   * 删除长期记忆
   */
  async deleteLong(id: string): Promise<boolean> {
    return await this.longMemory.delete(id)
  }

  /**
   * 搜索短期记忆
   */
  async searchShort(query: string, limit?: number): Promise<MemoryEntry[]> {
    return await this.shortMemory.search(query, limit)
  }

  /**
   * 搜索长期记忆
   */
  async searchLong(query: string, limit?: number): Promise<MemoryEntry[]> {
    return await this.longMemory.search(query, limit)
  }

  /**
   * 获取记忆上下文
   */
  async getContext(query?: string, limit: number = 10): Promise<MemoryContext> {
    let relevant: MemoryEntry[] = []

    if (query) {
      // 同时搜索短期和长期记忆
      const [shortResults, longResults] = await Promise.all([
        this.shortMemory.search(query, limit),
        this.longMemory.search(query, limit)
      ])
      
      relevant = [...shortResults, ...longResults]
        .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
        .slice(0, limit)
    }

    const [short, long] = await Promise.all([
      this.shortMemory.getRecent(limit),
      this.longMemory.getAll(limit)
    ])

    return {
      short,
      long,
      relevant
    }
  }

  /**
   * 清空短期记忆
   */
  async clearShort(): Promise<void> {
    await this.shortMemory.clear()
  }

  /**
   * 清空长期记忆
   */
  async clearLong(): Promise<void> {
    await this.longMemory.clear()
  }

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<{
    short: number
    long: number
    total: number
  }> {
    const [shortCount, longCount] = await Promise.all([
      this.shortMemory.count(),
      this.longMemory.count()
    ])

    return {
      short: shortCount,
      long: longCount,
      total: shortCount + longCount
    }
  }

  /**
   * 导出所有记忆
   */
  async export(): Promise<MemoryEntry[]> {
    const [short, long] = await Promise.all([
      this.shortMemory.getAll(),
      this.longMemory.getAll()
    ])

    return [...short, ...long]
  }

  /**
   * 导入记忆
   */
  async import(entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.type === 'short') {
        await this.shortMemory.add(entry.content, entry.metadata)
      } else if (entry.type === 'long') {
        await this.longMemory.add(entry.content, entry.metadata)
      }
    }

    logger.info('[MemoryManager] Memory imported', { count: entries.length })
  }
}

/**
 * 创建记忆管理器单例
 */
export const memoryManager = new MemoryManager()
