/**
 * MiniMonkey 协程调度器实现
 * @description 轻量级并发系统，支持 20+ 并发任务，提供优秀的可控性
 */

// ==================== 类型定义 ====================

/**
 * 协程状态
 */
export enum CoroutineState {
  RUNNING = 'running',
  PAUSED = 'paused',
  WAITING = 'waiting',
  DONE = 'done',
  ERROR = 'error'
}

/**
 * Yield 结果
 */
export interface YieldResult<T = any> {
  isYield: boolean
  value?: T
  type: YieldType
}

export enum YieldType {
  PROMISE = 'promise',      // yield Promise
  DELAY = 'delay',          // yield delay(ms)
  PARALLEL = 'parallel',    // yield [Promise1, Promise2]
  RACE = 'race',            // yield race(Promise1, Promise2)
  FORK = 'fork',            // yield fork(task)
  CALL = 'call'             // yield call(fn, args)
}

// ==================== 协程实现 ====================

/**
 * 协程类
 */
export class Coroutine<T = any> {
  private generator: Generator<YieldResult, T, any>
  private state: CoroutineState = CoroutineState.RUNNING
  private result: T | null = null
  private error: Error | null = null
  
  constructor(generator: Generator<YieldResult, T, any>) {
    this.generator = generator
  }
  
  /**
   * 执行下一步
   */
  next(value?: any): IteratorResult<YieldResult, T> {
    try {
      const result = this.generator.next(value)
      
      if (result.done) {
        this.state = CoroutineState.DONE
        this.result = result.value
      }
      
      return result
    } catch (error) {
      this.state = CoroutineState.ERROR
      this.error = error as Error
      throw error
    }
  }
  
  /**
   * 抛出错误到协程内部
   */
  throw(error: Error): void {
    this.generator.throw(error)
  }
  
  /**
   * 获取状态
   */
  getState(): CoroutineState {
    return this.state
  }
  
  /**
   * 是否完成
   */
  get isDone(): boolean {
    return this.state === CoroutineState.DONE || this.state === CoroutineState.ERROR
  }
  
  /**
   * 获取结果
   */
  getResult(): T | null {
    return this.result
  }
  
  /**
   * 获取错误
   */
  getError(): Error | null {
    return this.error
  }
}

// ==================== 协程调度器 ====================

/**
 * 协程调度器
 */
export class CoroutineScheduler {
  private tasks: Map<number, ScheduledTask> = new Map()
  private taskIdCounter = 0
  private running = false
  
  /**
   * 创建并启动协程
   */
  spawn<T>(generatorFn: () => Generator<YieldResult, T, any>, priority: number = 0): number {
    const taskId = this.taskIdCounter++
    const generator = generatorFn()
    const coroutine = new Coroutine(generator)
    
    const task: ScheduledTask = {
      id: taskId,
      coroutine,
      priority,
      createdAt: Date.now(),
      state: CoroutineState.RUNNING
    }
    
    this.tasks.set(taskId, task)
    
    // 立即开始执行
    this.resume(taskId)
    
    return taskId
  }
  
  /**
   * 恢复协程执行
   */
  async resume(taskId: number, value?: any): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    
    while (!task.coroutine.isDone) {
      const result = task.coroutine.next(value)
      
      if (result.done) {
        task.state = CoroutineState.DONE
        this.tasks.delete(taskId)
        break
      }
      
      // 处理 yield 的值
      if (result.value.isYield) {
        const yieldedValue = await this.handleYield(result.value, taskId)
        
        // 如果是 delay，需要等待
        if (result.value.type === YieldType.DELAY) {
          const ms = result.value.value as number
          await this.sleep(ms)
        }
        
        // 继续执行
        value = yieldedValue
      } else {
        break
      }
    }
  }
  
  /**
   * 暂停协程
   */
  pause(taskId: number): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    
    task.state = CoroutineState.PAUSED
  }
  
  /**
   * 取消协程
   */
  cancel(taskId: number): void {
    this.tasks.delete(taskId)
  }
  
  /**
   * 等待协程完成
   */
  async join(taskId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const task = this.tasks.get(taskId)
        
        if (!task) {
          reject(new Error('Task not found'))
          return
        }
        
        if (task.state === CoroutineState.DONE) {
          resolve(task.coroutine.getResult())
        } else if (task.state === CoroutineState.ERROR) {
          reject(task.coroutine.getError())
        } else {
          setTimeout(check, 10)
        }
      }
      
      check()
    })
  }
  
  /**
   * 获取所有任务
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }
  
  /**
   * 获取活跃任务数
   */
  getActiveTaskCount(): number {
    return this.getTasks().filter(t => t.state === CoroutineState.RUNNING).length
  }
  
  /**
   * 启动调度器
   */
  start(): void {
    this.running = true
    this.runLoop()
  }
  
  /**
   * 停止调度器
   */
  stop(): void {
    this.running = false
    this.tasks.clear()
  }
  
  private async runLoop(): Promise<void> {
    while (this.running) {
      // 按优先级排序
      const sortedTasks = this.getTasks().sort((a, b) => b.priority - a.priority)
      
      for (const task of sortedTasks) {
        if (task.state === CoroutineState.RUNNING) {
          this.resume(task.id).catch(console.error)
        }
      }
      
      // 短暂休眠避免 CPU 占用过高
      await this.sleep(1)
    }
  }
  
  private async handleYield(yieldResult: YieldResult, taskId: number): Promise<any> {
    switch (yieldResult.type) {
      case YieldType.PROMISE:
        return yieldResult.value
      
      case YieldType.DELAY:
        return yieldResult.value
      
      case YieldType.PARALLEL:
        return Promise.all(yieldResult.value)
      
      case YieldType.RACE:
        return Promise.race(yieldResult.value)
      
      case YieldType.FORK:
        // 创建子任务
        return this.spawn(yieldResult.value)
      
      case YieldType.CALL:
        const { fn, args } = yieldResult.value
        return fn(...args)
      
      default:
        return yieldResult.value
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

interface ScheduledTask {
  id: number
  coroutine: Coroutine
  priority: number
  createdAt: number
  state: CoroutineState
}

// ==================== 协程辅助函数 ====================

/**
 * 延迟指定毫秒
 */
export function delay(ms: number): YieldResult<number> {
  return {
    isYield: true,
    value: ms,
    type: YieldType.DELAY
  }
}

/**
 * 并行执行多个 Promise
 */
export function parallel<T>(promises: Promise<T>[]): YieldResult<Promise<T>[]> {
  return {
    isYield: true,
    value: promises,
    type: YieldType.PARALLEL
  }
}

/**
 * 竞赛执行（哪个快用哪个）
 */
export function race<T>(promises: Promise<T>[]): YieldResult<Promise<T>> {
  return {
    isYield: true,
    value: promises,
    type: YieldType.RACE
  }
}

/**
 * 调用函数
 */
export function call<T>(fn: (...args: any[]) => T, ...args: any[]): YieldResult<{ fn: Function, args: any[] }> {
  return {
    isYield: true,
    value: { fn, args },
    type: YieldType.CALL
  }
}

/**
 * 派生子任务
 */
export function fork<T>(generatorFn: () => Generator<YieldResult, T, any>): YieldResult<() => Generator<YieldResult, T, any>> {
  return {
    isYield: true,
    value: generatorFn,
    type: YieldType.FORK
  }
}

// ==================== 使用示例 ====================

/**
 * 示例：使用协程并发执行任务
 */
export async function coroutineExample(): Promise<void> {
  const scheduler = new CoroutineScheduler()
  
  // 示例 1: 简单的顺序执行
  function* sequentialTask() {
    console.log('开始任务')
    
    yield delay(1000) // 等待 1 秒
    console.log('1 秒后')
    
    const data = yield fetch('/api/data') // 发起请求
    console.log('数据:', data)
    
    yield delay(500) // 再等待 0.5 秒
    console.log('完成')
    
    return 'success'
  }
  
  // 示例 2: 并行执行
  function* parallelTask() {
    const [result1, result2, result3] = yield parallel([
      fetch('/api/data1'),
      fetch('/api/data2'),
      fetch('/api/data3')
    ])
    
    return { result1, result2, result3 }
  }
  
  // 示例 3: 带重试的任务
  function* retryableTask(url: string, maxRetries: number = 3) {
    let lastError: Error | null = null
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = yield fetch(url)
        return response
      } catch (error) {
        lastError = error
        console.log(`重试 ${i + 1}/${maxRetries}`)
        yield delay(1000 * (i + 1)) // 指数退避
      }
    }
    
    throw lastError
  }
  
  // 启动任务
  const taskId1 = scheduler.spawn(sequentialTask)
  const taskId2 = scheduler.spawn(parallelTask)
  
  // 等待完成
  await scheduler.join(taskId1)
  await scheduler.join(taskId2)
  
  console.log('所有任务完成')
}

// ==================== 分布式任务队列 ====================

/**
 * 基于 Redis 的分布式任务队列
 */
export class DistributedTaskQueue {
  private redis: Redis
  private queueName: string
  private workers: Set<string> = new Set()
  
  constructor(redis: Redis, queueName: string = 'minimonkey:tasks') {
    this.redis = redis
    this.queueName = queueName
  }
  
  /**
   * 添加任务到队列
   */
  async enqueue(task: TaskDefinition): Promise<string> {
    const taskId = uuid()
    const serialized = JSON.stringify({
      id: taskId,
      ...task,
      createdAt: Date.now(),
      status: 'pending'
    })
    
    await this.redis.lpush(this.queueName, serialized)
    return taskId
  }
  
  /**
   * 从队列获取任务
   */
  async dequeue(workerId: string, timeout: number = 0): Promise<TaskDefinition | null> {
    const result = await this.redis.brpop(this.queueName, timeout)
    
    if (!result) return null
    
    const task = JSON.parse(result[1])
    this.workers.add(workerId)
    
    return task
  }
  
  /**
   * 标记任务完成
   */
  async complete(taskId: string, result: any): Promise<void> {
    await this.redis.set(
      `${this.queueName}:result:${taskId}`,
      JSON.stringify({
        taskId,
        result,
        completedAt: Date.now()
      }),
      'EX', 3600 // 1 小时后过期
    )
  }
  
  /**
   * 获取任务结果
   */
  async getResult(taskId: string): Promise<any> {
    const data = await this.redis.get(`${this.queueName}:result:${taskId}`)
    return data ? JSON.parse(data) : null
  }
  
  /**
   * 获取队列长度
   */
  async getQueueLength(): Promise<number> {
    return await this.redis.llen(this.queueName)
  }
  
  /**
   * 清空队列
   */
  async clear(): Promise<void> {
    await this.redis.del(this.queueName)
  }
}

interface TaskDefinition {
  type: string
  payload: any
  priority?: number
  timeout?: number
  retries?: number
}
