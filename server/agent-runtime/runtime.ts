/**
 * Agent Runtime - 多 Agent 运行时主入口
 * 
 * 使用示例：
 * ```ts
 * const runtime = createAgentRuntime()
 * 
 * // 判断是否使用多 Agent
 * if (runtime.shouldUseMultiAgent(message)) {
 *   for await (const event of runtime.execute(message)) {
 *     // 处理实时事件
 *   }
 * }
 * ```
 */

import { ManagerAgent } from './manager-agent'
import type { RuntimeConfig, ExecutionEvent, FinalResult } from './types'

/** 默认配置 */
const DEFAULT_CONFIG: RuntimeConfig = {
  agentConfigPath: './agent-config.json',
  maxParallelism: 3,
  taskTimeoutMs: 120_000,
  enableReview: true
}

/** 运行时实例 */
let _instance: AgentRuntime | null = null

/** 创建运行时（单例） */
export function createAgentRuntime(config?: Partial<RuntimeConfig>): AgentRuntime {
  if (!_instance) {
    _instance = new AgentRuntime({ ...DEFAULT_CONFIG, ...config })
  }
  return _instance
}

/** 获取现有实例 */
export function getAgentRuntime(): AgentRuntime | null {
  return _instance
}

/** Agent Runtime 主类 */
export class AgentRuntime {
  private manager: ManagerAgent

  constructor(config: RuntimeConfig) {
    this.manager = new ManagerAgent(config)
  }

  /** 判断是否应使用多 Agent 模式 */
  shouldUseMultiAgent(message: string, options?: { selectedSkillId?: string; selectedSkillIds?: string[] }): boolean {
    return this.manager.shouldUseMultiAgent(message, options)
  }

  /** 执行多 Agent 任务 */
  async *execute(message: string): AsyncGenerator<ExecutionEvent, FinalResult> {
    return yield* this.manager.execute(message)
  }

  /** 获取统计信息 */
  getStats() {
    return this.manager.getStats()
  }
}

/** 便捷函数：判断是否使用多 Agent */
export function shouldUseMultiAgent(message: string, options?: { selectedSkillId?: string; selectedSkillIds?: string[] }): boolean {
  const runtime = getAgentRuntime()
  if (!runtime) {
    // 运行时未初始化，回退到简单判断
    return false
  }
  return runtime.shouldUseMultiAgent(message, options)
}
