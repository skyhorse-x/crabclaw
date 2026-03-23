/**
 * 任务规划器类型定义
 */

/**
 * 任务步骤
 */
export interface TaskStep {
  /**
   * 步骤 ID
   */
  id: string

  /**
   * 步骤描述
   */
  description: string

  /**
   * 使用的工具
   */
  tool?: string

  /**
   * 工具参数
   */
  toolInput?: Record<string, any>

  /**
   * 前置步骤 ID
   */
  dependsOn?: string[]

  /**
   * 步骤状态
   */
  status?: 'pending' | 'running' | 'completed' | 'failed'

  /**
   * 执行结果
   */
  result?: any

  /**
   * 错误信息
   */
  error?: string
}

/**
 * 任务计划
 */
export interface TaskPlan {
  /**
   * 计划 ID
   */
  id: string

  /**
   * 原始任务描述
   */
  originalTask: string

  /**
   * 任务步骤
   */
  steps: TaskStep[]

  /**
   * 创建时间
   */
  createdAt: string

  /**
   * 状态
   */
  status: 'planning' | 'ready' | 'executing' | 'completed' | 'failed'
}

/**
 * 规划器配置
 */
export interface PlannerConfig {
  /**
   * 是否使用 AI 规划
   */
  useAI?: boolean

  /**
   * 最大步骤数
   */
  maxSteps?: number

  /**
   * 是否允许并行执行
   */
  allowParallel?: boolean

  /**
   * 超时时间
   */
  timeout?: number
}

/**
 * 规划结果
 */
export interface PlanningResult {
  /**
   * 是否成功
   */
  ok: boolean

  /**
   * 任务计划
   */
  plan?: TaskPlan

  /**
   * 错误信息
   */
  error?: string

  /**
   * 规划用时（毫秒）
   */
  duration?: number
}
