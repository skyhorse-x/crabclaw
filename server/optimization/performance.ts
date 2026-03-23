/**
 * MiniMonkey 性能优化模块
 * @description 实现启动速度、内存占用和响应延迟的极致优化
 */

// ==================== 懒加载系统 ====================

/**
 * 懒加载器
 */
export class LazyLoader {
  private cache: Map<string, any> = new Map()
  private loadingPromises: Map<string, Promise<any>> = new Map()
  
  /**
   * 懒加载模块
   */
  async load<T>(moduleId: string, loader: () => Promise<T>): Promise<T> {
    // 检查缓存
    if (this.cache.has(moduleId)) {
      return this.cache.get(moduleId)
    }
    
    // 检查是否正在加载
    if (this.loadingPromises.has(moduleId)) {
      return this.loadingPromises.get(moduleId)!
    }
    
    // 开始加载
    const promise = loader().then(module => {
      this.cache.set(moduleId, module)
      this.loadingPromises.delete(moduleId)
      return module
    })
    
    this.loadingPromises.set(moduleId, promise)
    return promise
  }
  
  /**
   * 预加载模块（不阻塞）
   */
  preload(moduleId: string, loader: () => Promise<any>): void {
    // 后台静默加载
    this.load(moduleId, loader).catch(err => {
      console.warn(`[LazyLoader] 预加载失败 ${moduleId}:`, err.message)
    })
  }
  
  /**
   * 清除缓存
   */
  clear(moduleId?: string): void {
    if (moduleId) {
      this.cache.delete(moduleId)
    } else {
      this.cache.clear()
      this.loadingPromises.clear()
    }
  }
}

// ==================== 虚拟列表 ====================

/**
 * 虚拟列表实现（大数据量优化）
 */
export class VirtualList<T> {
  private items: T[]
  private itemHeight: number
  private containerHeight: number
  private scrollTop: number = 0
  
  constructor(items: T[], itemHeight: number, containerHeight: number) {
    this.items = items
    this.itemHeight = itemHeight
    this.containerHeight = containerHeight
  }
  
  /**
   * 获取可见区域的项目
   */
  getVisibleItems(): { items: T[], startIndex: number, endIndex: number } {
    const visibleCount = Math.ceil(this.containerHeight / this.itemHeight)
    const startIndex = Math.floor(this.scrollTop / this.itemHeight)
    const endIndex = Math.min(startIndex + visibleCount, this.items.length)
    
    return {
      items: this.items.slice(startIndex, endIndex),
      startIndex,
      endIndex
    }
  }
  
  /**
   * 滚动到指定位置
   */
  scrollTo(position: number): void {
    this.scrollTop = Math.max(0, Math.min(
      position,
      this.items.length * this.itemHeight - this.containerHeight
    ))
  }
  
  /**
   * 滚动到指定索引
   */
  scrollToIndex(index: number): void {
    this.scrollTo(index * this.itemHeight)
  }
  
  /**
   * 更新滚动位置
   */
  updateScroll(delta: number): void {
    this.scrollTop += delta
  }
  
  /**
   * 获取总高度
   */
  getTotalHeight(): number {
    return this.items.length * this.itemHeight
  }
  
  /**
   * 获取可见范围百分比
   */
  getVisiblePercentage(): number {
    return (this.getVisibleItems().endIndex - this.getVisibleItems().startIndex) / this.items.length * 100
  }
}

// ==================== 对象池模式 ====================

/**
 * 对象池
 */
export class ObjectPool<T> {
  private pool: T[] = []
  private createFn: () => T
  private resetFn: (obj: T) => void
  private maxSize: number
  private activeCount: number = 0
  
  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 100
  ) {
    this.createFn = createFn
    this.resetFn = resetFn
    this.maxSize = maxSize
  }
  
  /**
   * 获取对象
   */
  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.createFn()
    this.activeCount++
    return obj
  }
  
  /**
   * 归还对象
   */
  release(obj: T): void {
    this.resetFn(obj)
    
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj)
    }
    
    this.activeCount--
  }
  
  /**
   * 获取统计信息
   */
  getStats(): ObjectPoolStats {
    return {
      poolSize: this.pool.length,
      activeCount: this.activeCount,
      maxSize: this.maxSize,
      utilization: this.activeCount / (this.activeCount + this.pool.length)
    }
  }
  
  /**
   * 清空池
   */
  clear(): void {
    this.pool = []
    this.activeCount = 0
  }
}

interface ObjectPoolStats {
  poolSize: number
  activeCount: number
  maxSize: number
  utilization: number
}

// ==================== 请求批处理 ====================

/**
 * 批处理器
 */
export class BatchProcessor<T, R> {
  private queue: Array<{ item: T, resolve: (result: R) => void, reject: (error: Error) => void }> = []
  private timer: NodeJS.Timeout | null = null
  private batchSize: number
  private batchDelay: number
  private processor: (items: T[]) => Promise<R[]>
  private processing = false
  
  constructor(
    processor: (items: T[]) => Promise<R[]>,
    batchSize: number = 10,
    batchDelay: number = 10 // 10ms
  ) {
    this.processor = processor
    this.batchSize = batchSize
    this.batchDelay = batchDelay
  }
  
  /**
   * 添加项目到队列
   */
  add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject })
      
      // 达到批次大小立即处理
      if (this.queue.length >= this.batchSize) {
        this.flush()
      } else if (!this.timer && !this.processing) {
        // 否则等待批次窗口
        this.timer = setTimeout(() => this.flush(), this.batchDelay)
      }
    })
  }
  
  /**
   * 刷新队列
   */
  private async flush(): Promise<void> {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    
    const batch = this.queue.splice(0, this.batchSize)
    const items = batch.map(b => b.item)
    const callbacks = batch.map(b => ({ resolve: b.resolve, reject: b.reject }))
    
    try {
      const results = await this.processor(items)
      
      callbacks.forEach((cb, i) => {
        cb.resolve(results[i])
      })
    } catch (error) {
      callbacks.forEach(cb => {
        cb.reject(error)
      })
    } finally {
      this.processing = false
      
      // 如果还有剩余项目，继续处理
      if (this.queue.length > 0) {
        this.flush()
      }
    }
  }
  
  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length
  }
  
  /**
   * 销毁
   */
  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.queue = []
  }
}

// ==================== 多级缓存 ====================

/**
 * 多级缓存管理器
 */
export class MultiLevelCache<K, V> {
  private l1: Map<K, CacheEntry<V>> = new Map() // L1: 内存缓存
  private l2: LocalStorageCache<K, V> // L2: 本地存储
  private l1MaxSize: number
  private hitRate: CacheHitRate = { l1: 0, l2: 0, miss: 0, total: 0 }
  
  constructor(l1MaxSize: number = 1000) {
    this.l1MaxSize = l1MaxSize
    this.l2 = new LocalStorageCache()
  }
  
  /**
   * 获取缓存
   */
  async get(key: K): Promise<V | null> {
    this.hitRate.total++
    
    // L1 命中
    if (this.l1.has(key)) {
      const entry = this.l1.get(key)!
      
      // 检查过期
      if (!this.isExpired(entry)) {
        this.hitRate.l1++
        return entry.value
      }
      
      // 已过期，删除
      this.l1.delete(key)
    }
    
    // L2 命中
    const l2Value = await this.l2.get(key)
    if (l2Value !== null) {
      this.hitRate.l2++
      
      // 回填 L1
      this.set(key, l2Value)
      return l2Value
    }
    
    // Miss
    this.hitRate.miss++
    return null
  }
  
  /**
   * 设置缓存
   */
  set(key: K, value: V, ttl?: number): void {
    // LRU 淘汰策略
    if (this.l1.size >= this.l1MaxSize) {
      const firstKey = this.l1.keys().next().value
      if (firstKey !== undefined) {
        this.l1.delete(firstKey)
      }
    }
    
    this.l1.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || 5 * 60 * 1000 // 默认 5 分钟
    })
  }
  
  /**
   * 删除缓存
   */
  async delete(key: K): Promise<void> {
    this.l1.delete(key)
    await this.l2.delete(key)
  }
  
  /**
   * 清空缓存
   */
  clear(): void {
    this.l1.clear()
    this.l2.clear()
  }
  
  /**
   * 获取命中率统计
   */
  getHitRate(): CacheHitRateStats {
    const total = this.hitRate.total || 1
    return {
      l1HitRate: this.hitRate.l1 / total,
      l2HitRate: this.hitRate.l2 / total,
      missRate: this.hitRate.miss / total,
      totalRequests: this.hitRate.total
    }
  }
  
  private isExpired(entry: CacheEntry<V>): boolean {
    return Date.now() - entry.timestamp > entry.ttl
  }
}

interface CacheEntry<V> {
  value: V
  timestamp: number
  ttl: number
}

interface CacheHitRate {
  l1: number
  l2: number
  miss: number
  total: number
}

interface CacheHitRateStats {
  l1HitRate: number
  l2HitRate: number
  missRate: number
  totalRequests: number
}

/**
 * 本地存储缓存（L2）
 */
class LocalStorageCache<K, V> {
  private prefix: string
  
  constructor(prefix: string = 'cache:') {
    this.prefix = prefix
  }
  
  async get(key: K): Promise<V | null> {
    try {
      const stored = localStorage.getItem(this.prefix + String(key))
      if (!stored) return null
      
      const entry: CacheEntry<V> = JSON.parse(stored)
      
      if (Date.now() - entry.timestamp > entry.ttl) {
        await this.delete(key)
        return null
      }
      
      return entry.value
    } catch {
      return null
    }
  }
  
  async set(key: K, value: V, ttl?: number): Promise<void> {
    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || 30 * 60 * 1000 // 默认 30 分钟
    }
    
    localStorage.setItem(this.prefix + String(key), JSON.stringify(entry))
  }
  
  async delete(key: K): Promise<void> {
    localStorage.removeItem(this.prefix + String(key))
  }
  
  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix))
    keys.forEach(k => localStorage.removeItem(k))
  }
}

// ==================== Web Worker 后台处理 ====================

/**
 * Worker 管理器
 */
export class BackgroundWorker {
  private worker: Worker | null = null
  private taskIdCounter = 0
  private pendingTasks: Map<number, { resolve: Function, reject: Function }> = new Map()
  
  constructor(workerScript: string) {
    // 在浏览器环境中创建 Worker
    if (typeof window !== 'undefined') {
      this.worker = new Worker(workerScript)
      this.setupMessageHandler()
    }
  }
  
  /**
   * 发送任务到后台
   */
  process<T, R>(data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      const taskId = this.taskIdCounter++
      
      this.pendingTasks.set(taskId, { resolve, reject })
      
      if (this.worker) {
        this.worker.postMessage({ taskId, data })
      } else {
        // Node.js 环境使用 worker_threads
        this.processInNode(data).then(resolve).catch(reject)
      }
    })
  }
  
  /**
   * Node.js 环境的 Worker 处理
   */
  private async processInNode<T, R>(data: T): Promise<R> {
    // 使用 Bun 的 worker API
    const { Worker } = await import('worker_threads')
    
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort } = require('worker_threads')
        parentPort!.on('message', async (data) => {
          // 执行处理逻辑
          const result = await processData(data)
          parentPort!.postMessage(result)
        })
      `, { eval: true })
      
      worker.on('message', resolve)
      worker.on('error', reject)
      worker.postMessage(data)
    })
  }
  
  private setupMessageHandler(): void {
    if (!this.worker) return
    
    this.worker.onmessage = (event) => {
      const { taskId, result, error } = event.data
      
      const task = this.pendingTasks.get(taskId)
      if (!task) return
      
      this.pendingTasks.delete(taskId)
      
      if (error) {
        task.reject(new Error(error))
      } else {
        task.resolve(result)
      }
    }
    
    this.worker.onerror = (error) => {
      console.error('[BackgroundWorker] Worker error:', error)
    }
  }
  
  /**
   * 终止 Worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pendingTasks.clear()
  }
}

// ==================== 性能监控 ====================

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics: Map<string, Metric[]> = new Map()
  
  /**
   * 记录开始时间
   */
  start(label: string): void {
    performance.mark(`${label}-start`)
  }
  
  /**
   * 记录结束时间并计算耗时
   */
  end(label: string): number {
    performance.mark(`${label}-end`)
    const measure = performance.measure(label, `${label}-start`, `${label}-end`)
    
    const duration = measure.duration
    this.recordMetric(label, duration)
    
    return duration
  }
  
  /**
   * 记录指标
   */
  private recordMetric(label: string, value: number): void {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, [])
    }
    
    const metric: Metric = {
      value,
      timestamp: Date.now()
    }
    
    this.metrics.get(label)!.push(metric)
    
    // 只保留最近 1000 条
    if (this.metrics.get(label)!.length > 1000) {
      this.metrics.get(label)!.shift()
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats(label: string): MetricStats {
    const metrics = this.metrics.get(label) || []
    
    if (metrics.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p95: 0 }
    }
    
    const values = metrics.map(m => m.value).sort((a, b) => a - b)
    const sum = values.reduce((a, b) => a + b, 0)
    
    return {
      count: values.length,
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p95: values[Math.floor(values.length * 0.95)]
    }
  }
  
  /**
   * 重置指标
   */
  reset(label?: string): void {
    if (label) {
      this.metrics.delete(label)
    } else {
      this.metrics.clear()
    }
  }
}

interface Metric {
  value: number
  timestamp: number
}

interface MetricStats {
  count: number
  avg: number
  min: number
  max: number
  p95: number
}
