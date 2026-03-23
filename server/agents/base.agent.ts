/**
 * Agent 基础接口和抽象类
 */

import type { SkillConfig, JobInfo } from '../shared/types'

/**
 * Agent 执行上下文
 */
export interface AgentContext {
  skill?: SkillConfig
  job?: JobInfo
  variables: Record<string, any>
  metadata: {
    startedAt: string
    agentType: string
  }
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  ok: boolean
  data?: any
  error?: string
  nextStep?: string
  shouldContinue?: boolean
}

/**
 * Agent 接口
 */
export interface IAgent {
  /**
   * Agent 类型
   */
  readonly type: string

  /**
   * 初始化 Agent
   */
  initialize(): Promise<void>

  /**
   * 执行 Agent
   */
  execute(context: AgentContext): Promise<AgentResult>

  /**
   * 清理资源
   */
  cleanup(): Promise<void>
}

/**
 * Agent 基类
 */
export abstract class BaseAgent implements IAgent {
  abstract readonly type: string

  protected context?: AgentContext

  async initialize(): Promise<void> {
    // 默认空实现
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    this.context = context
    return this.doExecute(context)
  }

  protected abstract doExecute(context: AgentContext): Promise<AgentResult>

  async cleanup(): Promise<void> {
    this.context = undefined
  }

  /**
   * 更新上下文变量
   */
  protected setVariable(key: string, value: any): void {
    if (this.context) {
      this.context.variables[key] = value
    }
  }

  /**
   * 获取上下文变量
   */
  protected getVariable<T = any>(key: string): T | undefined {
    return this.context?.variables[key] as T | undefined
  }

  /**
   * 创建成功结果
   */
  protected success(data?: any, nextStep?: string): AgentResult {
    return {
      ok: true,
      data,
      nextStep,
      shouldContinue: !!nextStep
    }
  }

  /**
   * 创建失败结果
   */
  protected error(message: string): AgentResult {
    return {
      ok: false,
      error: message,
      shouldContinue: false
    }
  }
}
