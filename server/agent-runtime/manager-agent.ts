/**
 * Manager Agent - 多 Agent 调度核心
 * 
 * 负责：
 * 1. 分析任务复杂度
 * 2. 决定是否使用多 Agent 模式
 * 3. 协调 Planner、Executor、Merger 工作
 */

import type { ExecutionEvent, FinalResult, AgentType, RuntimeConfig, TaskResult } from './types'
import { AgentPool } from './agent-pool'
import { TaskPlanner } from './planner'
import { DAGExecutor } from './dag-executor'
import { ResultMerger } from './result-merger'
import { needTool } from '../services/intent-analyzer.service'

/** 复杂度分析结果 */
interface ComplexityAnalysis {
  score: number  // 0-1，越高越复杂
  reasons: string[]
  recommendedMode: 'single' | 'multi'
}

export class ManagerAgent {
  private pool: AgentPool
  private planner: TaskPlanner
  private executor: DAGExecutor
  private merger: ResultMerger
  private config: RuntimeConfig

  constructor(config: RuntimeConfig) {
    this.config = {
      maxParallelism: 3,
      taskTimeoutMs: 120_000,
      enableReview: true,
      ...config
    }

    this.pool = new AgentPool({ configPath: config.agentConfigPath })
    this.planner = new TaskPlanner({
      maxParallelism: this.config.maxParallelism,
      registeredTypes: this.pool.getRegisteredTypes()
    })
    this.executor = new DAGExecutor(this.pool)
    this.merger = new ResultMerger(this.pool, this.config.enableReview)
  }

  /** 判断是否应使用多 Agent 模式 */
  shouldUseMultiAgent(message: string, options?: { selectedSkillId?: string; selectedSkillIds?: string[] }): boolean {
    // 1. 用户选择了 skill → 走单 Agent（已有逻辑）
    if (options?.selectedSkillId || options?.selectedSkillIds?.length) {
      return false
    }

    // 2. 简单问候/知识问答 → 单 Agent
    if (!needTool(message)) {
      return false
    }

    // 3. 分析复杂度
    const complexity = this.analyzeComplexity(message)
    return complexity.recommendedMode === 'multi'
  }

  /** 分析任务复杂度 */
  analyzeComplexity(message: string): ComplexityAnalysis {
    const reasons: string[] = []
    let score = 0

    // 模块关键词
    const moduleKeywords = [
      { keywords: ['前端', '页面', '组件', 'UI', 'vue', 'css', 'html', '样式', '布局'], weight: 0.3, name: '前端' },
      { keywords: ['后端', 'API', '接口', '数据库', 'server', 'service', '路由', '控制器'], weight: 0.3, name: '后端' },
      { keywords: ['测试', 'test', 'playwright', '单元测试', 'e2e', 'vitest'], weight: 0.25, name: '测试' },
      { keywords: ['安全', '漏洞', 'sql 注入', 'xss', '权限', '加密'], weight: 0.25, name: '安全' },
      { keywords: ['优化', '重构', 'review', '审查', '审查代码', '代码质量'], weight: 0.2, name: '重构' }
    ]

    let matchedModules = 0
    for (const module of moduleKeywords) {
      if (module.keywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()))) {
        score += module.weight
        matchedModules++
        reasons.push(`检测到${module.name}相关任务`)
      }
    }

    // 涉及多个模块 → 更适合多 Agent
    if (matchedModules >= 2) {
      score += 0.2
      reasons.push(`涉及 ${matchedModules} 个模块，适合并行处理`)
    }

    // 长任务通常更复杂
    if (message.length > 100) {
      score += 0.1
      reasons.push('任务描述较长，可能包含多个子任务')
    }

    // 包含动作词
    const actionWords = ['修改', '修复', '添加', '删除', '创建', '优化', '重构', '实现', '编写']
    const actionCount = actionWords.filter(w => message.includes(w)).length
    if (actionCount >= 2) {
      score += 0.15
      reasons.push(`包含 ${actionCount} 个动作，可能涉及多个文件`)
    }

    score = Math.min(score, 1)

    return {
      score,
      reasons,
      recommendedMode: score >= 0.5 ? 'multi' : 'single'
    }
  }

  /** 执行多 Agent 任务，返回 AsyncGenerator 以支持实时事件推送 */
  async *execute(userMessage: string): AsyncGenerator<ExecutionEvent, FinalResult> {
    const startTime = Date.now()

    try {
      // 1. 规划阶段
      yield { type: 'planning_start' }
      const dag = await this.planner.plan(userMessage)
      yield { type: 'planning_complete', dag }

      // 2. 执行阶段
      const results = new Map<string, TaskResult>()
      for await (const event of this.executor.execute(dag)) {
        yield event
        // 收集结果
        if (event.type === 'agent_complete') {
          results.set(event.taskId, event.result)
        }
      }

      // 3. 合并结果
      yield { type: 'merge_start' }
      const mergerGenerator = this.merger.mergeWithEvents(results)
      let finalResult: FinalResult | null = null

      for await (const event of mergerGenerator) {
        yield event
        if (event.type === 'merge_complete') {
          finalResult = event.result
        }
      }

      if (!finalResult) {
        throw new Error('合并结果失败')
      }

      return finalResult
    } finally {
      // 清理空闲 Agent
      await this.pool.cleanupIdle()
      
      // 记录总耗时
      const elapsed = Date.now() - startTime
      console.log(`[ManagerAgent] 执行完成，总耗时: ${elapsed}ms`)
    }
  }

  /** 获取运行时统计信息 */
  getStats(): {
    registeredTypes: string[]
    activeAgents: number
  } {
    return {
      registeredTypes: this.pool.getRegisteredTypes(),
      activeAgents: this.pool.getActiveCount()
    }
  }
}
