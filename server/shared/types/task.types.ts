/**
 * 任务相关类型定义
 */

/**
 * 任务配置
 */
export interface TaskConfig {
  id: string
  name: string
  skillId: string
  enabled: boolean
  intervalMinutes: number
  runOnStartup: boolean
  description: string
}

/**
 * 任务执行模式
 */
export type JobMode = 'skill' | 'task'

/**
 * 任务状态
 */
export type JobStatus = 'running' | 'completed' | 'failed'

/**
 * 任务执行信息
 */
export interface JobInfo {
  id: string
  goal: string
  mode: JobMode
  status: JobStatus
  startedAt: string
  finishedAt?: string
  logs: string[]
  exitCode?: number
  skillId?: string
  taskId?: string
}
