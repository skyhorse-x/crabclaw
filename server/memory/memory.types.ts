/**
 * 记忆系统类型定义
 */

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /**
   * 记忆 ID
   */
  id: string

  /**
   * 记忆内容
   */
  content: string

  /**
   * 记忆类型
   */
  type: 'short' | 'long' | 'vector'

  /**
   * 创建时间戳
   */
  createdAt: number

  /**
   * 最后访问时间戳
   */
  lastAccessedAt?: number

  /**
   * 访问次数
   */
  accessCount?: number

  /**
   * 元数据
   */
  metadata?: Record<string, any>

  /**
   * 过期时间（可选）
   */
  expiresAt?: number
}

/**
 * 短期记忆配置
 */
export interface ShortMemoryConfig {
  /**
   * 最大记忆数量
   */
  maxEntries?: number

  /**
   * 过期时间（毫秒）
   */
  ttl?: number
}

/**
 * 长期记忆配置
 */
export interface LongMemoryConfig {
  /**
   * 存储路径
   */
  storagePath?: string

  /**
   * 是否启用持久化
   */
  persist?: boolean
}

/**
 * 向量记忆配置
 */
export interface VectorMemoryConfig {
  /**
   * 向量维度
   */
  dimensions?: number

  /**
   * 相似度阈值
   */
  similarityThreshold?: number

  /**
   * 存储路径
   */
  storagePath?: string
}

/**
 * 记忆接口
 */
export interface IMemory {
  /**
   * 添加记忆
   */
  add(content: string, metadata?: Record<string, any>): Promise<string>

  /**
   * 获取记忆
   */
  get(id: string): Promise<MemoryEntry | null>

  /**
   * 删除记忆
   */
  delete(id: string): Promise<boolean>

  /**
   * 搜索记忆
   */
  search(query: string, limit?: number): Promise<MemoryEntry[]>

  /**
   * 获取所有记忆
   */
  getAll(limit?: number): Promise<MemoryEntry[]>

  /**
   * 清空记忆
   */
  clear(): Promise<void>

  /**
   * 获取记忆数量
   */
  count(): Promise<number>
}

/**
 * 记忆上下文
 */
export interface MemoryContext {
  /**
   * 短期记忆
   */
  short: MemoryEntry[]

  /**
   * 长期记忆
   */
  long: MemoryEntry[]

  /**
   * 相关记忆（向量搜索）
   */
  relevant: MemoryEntry[]
}
