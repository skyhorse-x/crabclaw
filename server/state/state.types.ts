/**
 * Agent 状态管理类型定义
 */

/**
 * Agent 状态
 */
export type AgentState = 
  | 'idle'          // 空闲
  | 'initializing'  // 初始化中
  | 'thinking'      // 思考中
  | 'planning'      // 规划中
  | 'running'       // 执行中
  | 'tool_call'     // 工具调用中
  | 'skill_call'    // 技能调用中
  | 'waiting'       // 等待中
  | 'paused'        // 已暂停
  | 'error'         // 错误
  | 'cleanup'       // 清理中
  | 'stopped'       // 已停止

/**
 * Agent 活动信息
 */
export interface AgentActivity {
  /**
   * 活动类型
   */
  type: string

  /**
   * 活动描述
   */
  description: string

  /**
   * 开始时间
   */
  startedAt: number

  /**
   * 结束时间
   */
  endedAt?: number

  /**
   * 元数据
   */
  metadata?: Record<string, any>
}

/**
 * Agent 状态信息
 */
export interface AgentStatus {
  /**
   * Agent ID
   */
  agentId: string

  /**
   * 当前状态
   */
  state: AgentState

  /**
   * 当前活动
   */
  currentActivity?: AgentActivity

  /**
   * 历史活动
   */
  activities: AgentActivity[]

  /**
   * 错误信息
   */
  error?: string

  /**
   * 进度（0-100）
   */
  progress: number

  /**
   * 已执行的任务数
   */
  tasksExecuted: number

  /**
   * 启动时间
   */
  startedAt?: number

  /**
   * 最后活动时间
   */
  lastActivityAt: number
}

/**
 * Agent 状态变化事件
 */
export interface StateChangeEvent {
  /**
   * Agent ID
   */
  agentId: string

  /**
   * 旧状态
   */
  oldState: AgentState

  /**
   * 新状态
   */
  newState: AgentState

  /**
   * 变化时间
   */
  timestamp: number

  /**
   * 变化原因
   */
  reason?: string
}

/**
 * Agent 状态管理器接口
 */
export interface IAgentStateManager {
  /**
   * 设置状态
   */
  setState(agentId: string, state: AgentState, reason?: string): void

  /**
   * 获取状态
   */
  getState(agentId: string): AgentStatus | null

  /**
   * 获取所有 Agent 状态
   */
  getAllStates(): Map<string, AgentStatus>

  /**
   * 设置当前活动
   */
  setActivity(agentId: string, activity: AgentActivity): void

  /**
   * 清除活动
   */
  clearActivity(agentId: string): void

  /**
   * 设置错误
   */
  setError(agentId: string, error: string): void

  /**
   * 清除错误
   */
  clearError(agentId: string): void

  /**
   * 更新进度
   */
  updateProgress(agentId: string, progress: number): void

  /**
   * 增加任务计数
   */
  incrementTaskCount(agentId: string): void

  /**
   * 重置状态
   */
  reset(agentId: string): void

  /**
   * 订阅状态变化
   */
  subscribe(callback: (event: StateChangeEvent) => void): () => void
}
