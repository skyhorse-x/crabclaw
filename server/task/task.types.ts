/**
 * 任务队列系统类型定义
 */

/**
 * 任务状态
 */
export type TaskStatus = 
  | 'pending'       // 等待中
  | 'queued'        // 已入队
  | 'running'       // 执行中
  | 'paused'        // 已暂停
  | 'completed'     // 已完成
  | 'failed'        // 失败
  | 'cancelled'     // 已取消

/**
 * 任务优先级
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'

/**
 * 任务定义
 */
export interface Task {
  /**
   * 任务 ID
   */
  id: string

  /**
   * 任务名称
   */
  name: string

  /**
   * 任务描述
   */
  description?: string

  /**
   * 任务类型
   */
  type: string

  /**
   * 任务数据
   */
  data: Record<string, any>

  /**
   * 优先级
   */
  priority: TaskPriority

  /**
   * 状态
   */
  status: TaskStatus

  /**
   * 创建时间
   */
  createdAt: number

  /**
   * 开始执行时间
   */
  startedAt?: number

  /**
   * 完成时间
   */
  completedAt?: number

  /**
   * 超时时间（毫秒）
   */
  timeout?: number

  /**
   * 重试次数
   */
  retries: number

  /**
   * 最大重试次数
   */
  maxRetries: number

  /**
   * 错误信息
   */
  error?: string

  /**
   * 任务结果
   */
  result?: any

  /**
   * 任务元数据
   */
  metadata?: Record<string, any>

  /**
   * 依赖的任务 ID
   */
  dependencies?: string[]

  /**
   * 任务组 ID
   */
  groupId?: string
}

/**
 * 任务执行上下文
 */
export interface TaskContext {
  /**
   * 任务 ID
   */
  taskId: string

  /**
   * 任务数据
   */
  data: Record<string, any>

  /**
   * 取消信号
   */
  cancelled: boolean

  /**
   * 进度（0-100）
   */
  progress: number

  /**
   * 日志
   */
  logs: string[]
}

/**
 * 任务处理器
 */
export interface TaskHandler {
  /**
   * 处理任务
   */
  execute(context: TaskContext): Promise<any>

  /**
   * 取消任务
   */
  cancel?(taskId: string): Promise<void>

  /**
   * 暂停任务
   */
  pause?(taskId: string): Promise<void>

  /**
   * 恢复任务
   */
  resume?(taskId: string): Promise<void>
}

/**
 * 任务队列配置
 */
export interface TaskQueueConfig {
  /**
   * 并发任务数
   */
  concurrency?: number

  /**
   * 任务超时时间（毫秒）
   */
  timeout?: number

  /**
   * 最大重试次数
   */
  maxRetries?: number

  /**
   * 任务间隔（毫秒）
   */
  interval?: number

  /**
   * 是否持久化
   */
  persist?: boolean

  /**
   * 持久化路径
   */
  persistPath?: string
}

/**
 * 任务队列统计
 */
export interface TaskQueueStats {
  /**
   * 总任务数
   */
  total: number

  /**
   * 等待中任务数
   */
  pending: number

  /**
   * 执行中任务数
   */
  running: number

  /**
   * 已完成任务数
   */
  completed: number

  /**
   * 失败任务数
   */
  failed: number

  /**
   * 取消任务数
   */
  cancelled: number

  /**
   * 平均执行时间（毫秒）
   */
  avgDuration?: number
}
