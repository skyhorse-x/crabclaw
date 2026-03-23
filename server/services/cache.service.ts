/**
 * 缓存服务
 * 提供内存缓存功能，支持 TTL 过期
 */

import { logger } from './logger.service'

/**
 * 缓存项
 */
interface CacheItem<T> {
  value: T
  expiresAt: number | null
  createdAt: number
}

/**
 * 缓存配置
 */
interface CacheOptions {
  defaultTTL?: number // 默认 TTL（毫秒）
  maxSize?: number    // 最大缓存项数量
}

/**
 * 缓存服务类
 */
export class CacheService {
  private cache: Map<string, CacheItem<any>>
  private defaultTTL: number
  private maxSize: number
  private cleanupInterval: NodeJS.Timeout | null

  constructor(options: CacheOptions = {}) {
    this.cache = new Map()
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000 // 5 分钟
    this.maxSize = options.maxSize || 1000
    this.cleanupInterval = null
    
    // 启动定期清理
    this.startCleanup()
  }

  /**
   * 启动定期清理过期项
   */
  private startCleanup(): void {
    // 每分钟清理一次
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60 * 1000)
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * 清理过期项
   */
  private cleanup(): void {
    const now = Date.now()
    let deletedCount = 0

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      logger.debug('Cache cleanup', { deletedCount, totalSize: this.cache.size })
    }

    // 如果缓存超出最大大小，删除最旧的项
    if (this.cache.size > this.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)
      
      const toDelete = this.cache.size - this.maxSize
      for (let i = 0; i < toDelete; i++) {
        this.cache.delete(entries[i][0])
      }

      logger.debug('Cache size limit exceeded', { 
        deleted: toDelete, 
        remaining: this.cache.size 
      })
    }
  }

  /**
   * 设置缓存
   */
  async set<T>(
    key: string,
    value: T,
    options: { ttl?: number } = {}
  ): Promise<void> {
    const now = Date.now()
    const ttl = options.ttl ?? this.defaultTTL

    // 检查是否需要清理
    if (this.cache.size >= this.maxSize) {
      this.cleanup()
    }

    const item: CacheItem<T> = {
      value,
      expiresAt: ttl > 0 ? now + ttl : null,
      createdAt: now
    }

    this.cache.set(key, item)
    logger.debug('Cache set', { key, ttl, size: this.cache.size })
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key)

    if (!item) {
      logger.debug('Cache miss', { key })
      return null
    }

    // 检查是否过期
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key)
      logger.debug('Cache expired', { key })
      return null
    }

    logger.debug('Cache hit', { key, age: Date.now() - item.createdAt })
    return item.value as T
  }

  /**
   * 获取或设置缓存
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: { ttl?: number } = {}
  ): Promise<T> {
    const cached = await this.get<T>(key)
    
    if (cached !== null) {
      return cached
    }

    const value = await factory()
    await this.set(key, value, options)
    
    return value
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key)
    logger.debug('Cache delete', { key, deleted })
    return deleted
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear()
    logger.info('Cache cleared')
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    const item = this.cache.get(key)

    if (!item) {
      return false
    }

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number
    maxSize: number
    defaultTTL: number
    keys: string[]
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
      keys: Array.from(this.cache.keys())
    }
  }

  /**
   * 批量设置缓存
   */
  async setMany<T>(
    entries: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, { ttl: entry.ttl })
    }
  }

  /**
   * 批量获取缓存
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>()
    
    for (const key of keys) {
      const value = await this.get<T>(key)
      result.set(key, value)
    }
    
    return result
  }

  /**
   * 删除匹配前缀的键
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    let deletedCount = 0

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    logger.debug('Cache delete by prefix', { prefix, deleted: deletedCount })
    return deletedCount
  }

  /**
   * 刷新缓存项的过期时间
   */
  async refresh(key: string, ttl?: number): Promise<boolean> {
    const item = this.cache.get(key)
    
    if (!item) {
      return false
    }

    const newTTL = ttl ?? this.defaultTTL
    item.expiresAt = newTTL > 0 ? Date.now() + newTTL : null
    item.createdAt = Date.now()

    logger.debug('Cache refreshed', { key, ttl: newTTL })
    return true
  }
}

/**
 * 缓存服务单例
 */
let cacheServiceInstance: CacheService | null = null

/**
 * 获取缓存服务单例
 */
export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService({
      defaultTTL: 5 * 60 * 1000, // 5 分钟
      maxSize: 1000
    })
  }
  return cacheServiceInstance
}

/**
 * 创建带前缀的缓存实例
 */
export function createNamespacedCache(namespace: string): CacheService {
  const cache = getCacheService()
  
  return new Proxy(cache, {
    get(target, prop: keyof CacheService) {
      const original = target[prop]
      
      if (typeof original === 'function') {
        return (...args: any[]) => {
          // 对第一个参数（key）添加命名空间前缀
          if (typeof args[0] === 'string') {
            args[0] = `${namespace}:${args[0]}`
          }
          return (original as any).apply(target, args)
        }
      }
      
      return original
    }
  })
}
