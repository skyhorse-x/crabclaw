/**
 * 任务队列实现
 * 负责任务的排队、调度和执行
 */

import { createId } from '../shared/utils'
import { logger } from '../services/logger.service'
import type { 
  Task, 
  TaskStatus, 
  TaskPriority, 
  TaskHandler, 
  TaskContext,
  TaskQueueConfig,
  TaskQueueStats 
} from './task.types'

/**
 * 任务队列类
 */
export class TaskQueue {
  private tasks: Map<string, Task> = new Map()
  private handlers: Map<string, TaskHandler> = new Map()
  private queue: string[] = []
  private running: Set<string> = new Set()
  private config: Required<TaskQueueConfig>
  private activeWorkers: number = 0
  private processing: boolean = false

  constructor(config: TaskQueueConfig = {}) {
    this.config = {
      concurrency: config.concurrency || 5,
      timeout: config.timeout || 300000, // 5 分钟
      maxRetries: config.maxRetries || 3,
      interval: config.interval || 0,
      persist: config.persist ?? false,
      persistPath: config.persistPath || './data/task-queue.json',
      ...config
    }
  }

  /**
   * 注册任务处理器
   */
  registerHandler(type: string, handler: TaskHandler): void {
    this.handlers.set(type, handler)
    logger.debug('[TaskQueue] Handler registered', { type })
  }

  /**
   * 添加任务
   */
  async add(task: Omit<Task, 'id' | 'status' | 'createdAt' | 'retries'>): Promise<string> {
    const taskId = createId('task')
    
    const newTask: Task = {
      ...task,
      id: taskId,
      status: 'pending',
      createdAt: Date.now(),
      retries: 0,
      maxRetries: task.maxRetries || this.config.maxRetries,
      timeout: task.timeout || this.config.timeout
    }

    this.tasks.set(taskId, newTask)
    this.queue.push(taskId)

    logger.info('[TaskQueue] Task added', { 
      taskId, 
      name: task.name, 
      priority: task.priority 
    })

    // 触发处理
    this.processQueue()

    return taskId
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | null {
    return this.tasks.get(taskId) || null
  }

  /**
   * 取消任务
   */
  async cancel(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)

    if (!task) {
      return false
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      return false
    }

    task.status = 'cancelled'
    
    // 如果正在运行，调用处理器的取消方法
    if (this.running.has(taskId)) {
      const handler = this.handlers.get(task.type)
      if (handler?.cancel) {
        await handler.cancel(taskId)
      }
    }

    // 从队列中移除
    const queueIndex = this.queue.indexOf(taskId)
    if (queueIndex > -1) {
      this.queue.splice(queueIndex, 1)
    }

    logger.info('[TaskQueue] Task cancelled', { taskId })

    return true
  }

  /**
   * 暂停任务
   */
  async pause(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)

    if (!task || task.status !== 'running') {
      return false
    }

    task.status = 'paused'
    
    const handler = this.handlers.get(task.type)
    if (handler?.pause) {
      await handler.pause(taskId)
    }

    logger.info('[TaskQueue] Task paused', { taskId })

    return true
  }

  /**
   * 恢复任务
   */
  async resume(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)

    if (!task || task.status !== 'paused') {
      return false
    }

    task.status = 'queued'
    this.queue.push(taskId)

    const handler = this.handlers.get(task.type)
    if (handler?.resume) {
      await handler.resume(taskId)
    }

    logger.info('[TaskQueue] Task resumed', { taskId })

    this.processQueue()

    return true
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | null {
    const task = this.tasks.get(taskId)
    return task?.status || null
  }

  /**
   * 等待任务完成
   */
  async waitForTask(taskId: string, timeout?: number): Promise<Task> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const task = this.tasks.get(taskId)

        if (!task) {
          clearInterval(checkInterval)
          reject(new Error('任务不存在'))
          return
        }

        if (task.status === 'completed') {
          clearInterval(checkInterval)
          resolve(task)
          return
        }

        if (task.status === 'failed') {
          clearInterval(checkInterval)
          reject(new Error(task.error || '任务失败'))
          return
        }

        if (task.status === 'cancelled') {
          clearInterval(checkInterval)
          reject(new Error('任务已取消'))
          return
        }
      }, 100)

      // 超时处理
      if (timeout) {
        setTimeout(() => {
          clearInterval(checkInterval)
          reject(new Error('等待超时'))
        }, timeout)
      }
    })
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return
    }

    this.processing = true

    while (
      this.queue.length > 0 && 
      this.activeWorkers < this.config.concurrency
    ) {
      // 按优先级排序
      this.queue.sort((a, b) => {
        const taskA = this.tasks.get(a)
        const taskB = this.tasks.get(b)
        
        if (!taskA || !taskB) return 0

        const priorityOrder = {
          'critical': 4,
          'high': 3,
          'normal': 2,
          'low': 1
        }

        return priorityOrder[taskB.priority] - priorityOrder[taskA.priority]
      })

      const taskId = this.queue.shift()
      if (!taskId) continue

      const task = this.tasks.get(taskId)
      if (!task) continue

      // 检查依赖
      if (task.dependencies && task.dependencies.length > 0) {
        const depsMet = task.dependencies.every(depId => {
          const depTask = this.tasks.get(depId)
          return depTask && depTask.status === 'completed'
        })

        if (!depsMet) {
          // 依赖未完成，放回队列末尾
          this.queue.push(taskId)
          continue
        }
      }

      // 执行任务
      this.executeTask(task)
    }

    this.processing = false
  }

  /**
   * 执行任务
   */
  private async executeTask(task: Task): Promise<void> {
    const handler = this.handlers.get(task.type)

    if (!handler) {
      logger.error('[TaskQueue] No handler for task type', { type: task.type })
      task.status = 'failed'
      task.error = `未找到任务处理器：${task.type}`
      task.completedAt = Date.now()
      return
    }

    task.status = 'running'
    task.startedAt = Date.now()
    this.running.add(task.id)
    this.activeWorkers++

    const context: TaskContext = {
      taskId: task.id,
      data: task.data,
      cancelled: false,
      progress: 0,
      logs: []
    }

    try {
      // 设置超时
      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`任务超时（${task.timeout}ms）`))
        }, task.timeout)
      })

      const result = await Promise.race([
        handler.execute(context),
        timeoutPromise
      ])

      // 任务完成
      task.status = 'completed'
      task.result = result
      task.completedAt = Date.now()

      logger.info('[TaskQueue] Task completed', { 
        taskId: task.id, 
        duration: Date.now() - task.startedAt! 
      })

    } catch (error: any) {
      logger.error('[TaskQueue] Task execution error', error)

      // 检查是否需要重试
      if (task.retries < task.maxRetries && !context.cancelled) {
        task.retries++
        task.status = 'queued'
        task.error = undefined
        this.queue.push(task.id)
        
        logger.info('[TaskQueue] Task will retry', { 
          taskId: task.id, 
          retry: task.retries,
          maxRetries: task.maxRetries 
        })
      } else {
        task.status = 'failed'
        task.error = error.message
        task.completedAt = Date.now()
        
        logger.error('[TaskQueue] Task failed', { 
          taskId: task.id, 
          error: error.message 
        })
      }
    } finally {
      this.running.delete(task.id)
      this.activeWorkers--
      
      // 继续处理队列
      this.processQueue()
    }
  }

  /**
   * 获取队列统计
   */
  getStats(): TaskQueueStats {
    const tasks = Array.from(this.tasks.values())
    
    const stats: TaskQueueStats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending' || t.status === 'queued').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length
    }

    // 计算平均执行时间
    const completedTasks = tasks.filter(t => 
      t.status === 'completed' && t.startedAt && t.completedAt
    )
    
    if (completedTasks.length > 0) {
      const totalDuration = completedTasks.reduce((sum, t) => 
        sum + (t.completedAt! - t.startedAt!), 0
      )
      stats.avgDuration = totalDuration / completedTasks.length
    }

    return stats
  }

  /**
   * 获取所有任务
   */
  getAllTasks(status?: TaskStatus): Task[] {
    const tasks = Array.from(this.tasks.values())
    
    if (status) {
      return tasks.filter(t => t.status === status)
    }
    
    return tasks
  }

  /**
   * 清空队列
   */
  async clear(): Promise<void> {
    // 取消所有待处理任务
    for (const taskId of this.queue) {
      await this.cancel(taskId)
    }

    // 等待运行中的任务完成
    while (this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.tasks.clear()
    this.queue = []
    this.running.clear()

    logger.info('[TaskQueue] Queue cleared')
  }

  /**
   * 移除已完成的任务
   */
  pruneCompleted(): number {
    let removed = 0
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'cancelled') {
        this.tasks.delete(taskId)
        removed++
      }
    }

    logger.info('[TaskQueue] Pruned completed tasks', { removed })

    return removed
  }
}

/**
 * 创建任务队列单例
 */
export const taskQueue = new TaskQueue()
