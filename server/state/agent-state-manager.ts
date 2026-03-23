/**
 * Agent 状态管理器
 * 管理所有 Agent 的状态和生命周期
 */

import { logger } from '../services/logger.service'
import type { 
  AgentState, 
  AgentStatus, 
  AgentActivity,
  StateChangeEvent,
  IAgentStateManager 
} from './state.types'

/**
 * Agent 状态管理器类
 */
export class AgentStateManager implements IAgentStateManager {
  private states: Map<string, AgentStatus> = new Map()
  private subscribers: Set<(event: StateChangeEvent) => void> = new Set()

  /**
   * 初始化 Agent 状态
   */
  initialize(agentId: string): AgentStatus {
    const status: AgentStatus = {
      agentId,
      state: 'idle',
      activities: [],
      progress: 0,
      tasksExecuted: 0,
      lastActivityAt: Date.now()
    }

    this.states.set(agentId, status)
    logger.debug('[AgentStateManager] Agent initialized', { agentId })

    return status
  }

  /**
   * 设置状态
   */
  setState(agentId: string, state: AgentState, reason?: string): void {
    const status = this.states.get(agentId)

    if (!status) {
      logger.warn('[AgentStateManager] Agent not found', { agentId })
      return
    }

    const oldState = status.state
    status.state = state
    status.lastActivityAt = Date.now()

    // 状态变化时清理错误
    if (state !== 'error') {
      status.error = undefined
    }

    logger.debug('[AgentStateManager] State changed', { 
      agentId, 
      oldState, 
      newState: state,
      reason 
    })

    // 通知订阅者
    this.notifySubscribers({
      agentId,
      oldState,
      newState: state,
      timestamp: Date.now(),
      reason
    })
  }

  /**
   * 获取状态
   */
  getState(agentId: string): AgentStatus | null {
    return this.states.get(agentId) || null
  }

  /**
   * 获取所有 Agent 状态
   */
  getAllStates(): Map<string, AgentStatus> {
    return new Map(this.states)
  }

  /**
   * 设置当前活动
   */
  setActivity(agentId: string, activity: AgentActivity): void {
    const status = this.states.get(agentId)

    if (!status) {
      logger.warn('[AgentStateManager] Agent not found', { agentId })
      return
    }

    // 结束上一个活动
    if (status.currentActivity) {
      status.currentActivity.endedAt = Date.now()
      status.activities.push(status.currentActivity)
    }

    status.currentActivity = activity
    status.lastActivityAt = Date.now()

    logger.debug('[AgentStateManager] Activity set', { 
      agentId, 
      activity: activity.type 
    })
  }

  /**
   * 清除活动
   */
  clearActivity(agentId: string): void {
    const status = this.states.get(agentId)

    if (!status) {
      return
    }

    if (status.currentActivity) {
      status.currentActivity.endedAt = Date.now()
      status.activities.push(status.currentActivity)
      status.currentActivity = undefined
    }

    logger.debug('[AgentStateManager] Activity cleared', { agentId })
  }

  /**
   * 设置错误
   */
  setError(agentId: string, error: string): void {
    const status = this.states.get(agentId)

    if (!status) {
      logger.warn('[AgentStateManager] Agent not found', { agentId })
      return
    }

    status.error = error
    status.state = 'error'
    status.lastActivityAt = Date.now()

    logger.error('[AgentStateManager] Error set', { 
      agentId, 
      error 
    })
  }

  /**
   * 清除错误
   */
  clearError(agentId: string): void {
    const status = this.states.get(agentId)

    if (!status) {
      return
    }

    status.error = undefined
    if (status.state === 'error') {
      status.state = 'idle'
    }

    logger.debug('[AgentStateManager] Error cleared', { agentId })
  }

  /**
   * 更新进度
   */
  updateProgress(agentId: string, progress: number): void {
    const status = this.states.get(agentId)

    if (!status) {
      return
    }

    status.progress = Math.max(0, Math.min(100, progress))
    status.lastActivityAt = Date.now()
  }

  /**
   * 增加任务计数
   */
  incrementTaskCount(agentId: string): void {
    const status = this.states.get(agentId)

    if (!status) {
      return
    }

    status.tasksExecuted++
    status.lastActivityAt = Date.now()
  }

  /**
   * 重置状态
   */
  reset(agentId: string): void {
    const status = this.states.get(agentId)

    if (!status) {
      return
    }

    // 保留历史活动，但清除当前状态
    status.state = 'idle'
    status.currentActivity = undefined
    status.error = undefined
    status.progress = 0
    status.startedAt = undefined

    logger.info('[AgentStateManager] Agent reset', { agentId })
  }

  /**
   * 移除 Agent
   */
  remove(agentId: string): void {
    this.states.delete(agentId)
    logger.debug('[AgentStateManager] Agent removed', { agentId })
  }

  /**
   * 获取活跃 Agent 数量
   */
  getActiveCount(): number {
    let count = 0
    
    for (const status of this.states.values()) {
      if (status.state !== 'idle' && status.state !== 'stopped') {
        count++
      }
    }
    
    return count
  }

  /**
   * 获取所有空闲 Agent
   */
  getIdleAgents(): string[] {
    const idle: string[] = []
    
    for (const [agentId, status] of this.states.entries()) {
      if (status.state === 'idle') {
        idle.push(agentId)
      }
    }
    
    return idle
  }

  /**
   * 获取所有忙碌 Agent
   */
  getBusyAgents(): string[] {
    const busy: string[] = []
    
    for (const [agentId, status] of this.states.entries()) {
      if (status.state !== 'idle' && status.state !== 'stopped') {
        busy.push(agentId)
      }
    }
    
    return busy
  }

  /**
   * 获取错误状态的 Agent
   */
  getErrorAgents(): string[] {
    const errors: string[] = []
    
    for (const [agentId, status] of this.states.entries()) {
      if (status.state === 'error') {
        errors.push(agentId)
      }
    }
    
    return errors
  }

  /**
   * 订阅状态变化
   */
  subscribe(callback: (event: StateChangeEvent) => void): () => void {
    this.subscribers.add(callback)

    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * 通知订阅者
   */
  private notifySubscribers(event: StateChangeEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event)
      } catch (error: any) {
        logger.error('[AgentStateManager] Subscriber error', error)
      }
    }
  }

  /**
   * 导出状态历史
   */
  exportHistory(agentId: string, limit: number = 100): AgentActivity[] {
    const status = this.states.get(agentId)
    
    if (!status) {
      return []
    }

    return status.activities.slice(-limit)
  }

  /**
   * 获取 Agent 运行时长
   */
  getUptime(agentId: string): number {
    const status = this.states.get(agentId)
    
    if (!status || !status.startedAt) {
      return 0
    }

    return Date.now() - status.startedAt
  }
}

/**
 * 创建状态管理器单例
 */
export const agentStateManager = new AgentStateManager()
