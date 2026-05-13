/**
 * 智能Agent服务
 * 整合反思、长期记忆和多Agent协作能力
 */

import { logger } from './logger.service'
import { reflectionService, type ExecutionRecord, type ReflectionResult } from './reflection.service'
import { experienceStore, type Experience } from './experience-store'
import { multiAgentCoordinator, type SubTask, type TaskResult } from './multi-agent-coordinator'

export interface EnhancedTaskContext {
  taskId: string
  goal: string
  startTime: number
  steps: EnhancedStep[]
  reflection?: ReflectionResult
  relevantExperience?: Experience[]
}

export interface EnhancedStep {
  id: string
  tool: string
  server: string
  args: Record<string, any>
  success: boolean
  result?: any
  error?: string
  duration: number
  timestamp: number
}

export interface EnhancedTaskResult {
  taskId: string
  goal: string
  overallSuccess: boolean
  steps: EnhancedStep[]
  summary: string
  reflection: ReflectionResult
  suggestions: string[]
  learnedFromPast: Experience[]
  executionTime: number
}

export class IntelligentAgentService {
  private static instance: IntelligentAgentService
  private activeContexts: Map<string, EnhancedTaskContext> = new Map()
  private initialized: boolean = false

  private constructor() {}

  static getInstance(): IntelligentAgentService {
    if (!IntelligentAgentService.instance) {
      IntelligentAgentService.instance = new IntelligentAgentService()
    }
    return IntelligentAgentService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await experienceStore.initialize()
      this.initialized = true
      logger.info('[IntelligentAgent] Service initialized')
    } catch (error) {
      logger.error('[IntelligentAgent] Initialize failed', error)
    }
  }

  /**
   * 开始任务上下文
   */
  async startTask(goal: string): Promise<EnhancedTaskContext> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const relevantExperience = await experienceStore.search(goal, 3)

    const context: EnhancedTaskContext = {
      taskId,
      goal,
      startTime: Date.now(),
      steps: [],
      relevantExperience
    }

    this.activeContexts.set(taskId, context)

    logger.info('[IntelligentAgent] Task started', {
      taskId,
      goal: goal.substring(0, 50),
      relevantExperienceCount: relevantExperience.length
    })

    return context
  }

  /**
   * 记录执行步骤
   */
  recordStep(
    taskId: string,
    tool: string,
    server: string,
    args: Record<string, any>,
    success: boolean,
    result?: any,
    error?: string
  ): void {
    const context = this.activeContexts.get(taskId)
    if (!context) {
      return
    }

    const step: EnhancedStep = {
      id: `step_${context.steps.length + 1}`,
      tool,
      server,
      args,
      success,
      result,
      error,
      duration: 0,
      timestamp: Date.now()
    }

    context.steps.push(step)

    logger.debug('[IntelligentAgent] Step recorded', {
      taskId,
      stepId: step.id,
      tool,
      server,
      success
    })
  }

  /**
   * 结束任务并生成反思
   */
  async finishTask(taskId: string): Promise<EnhancedTaskResult> {
    const context = this.activeContexts.get(taskId)
    if (!context) {
      throw new Error(`Task not found: ${taskId}`)
    }

    const duration = Date.now() - context.startTime
    const successCount = context.steps.filter(s => s.success).length
    const overallSuccess = context.steps.length > 0 && successCount === context.steps.length

    const record: ExecutionRecord = {
      taskId,
      goal: context.goal,
      steps: context.steps.map(s => ({
        tool: s.tool,
        server: s.server,
        success: s.success,
        error: s.error,
        duration: s.duration
      })),
      overallSuccess,
      duration,
      timestamp: Date.now()
    }

    const reflection = await reflectionService.reflect(record)

    if (!overallSuccess && reflection.errorPatterns.length > 0) {
      await experienceStore.add(
        this.categorizeGoal(context.goal),
        context.goal,
        reflection.improvedApproach || '',
        false,
        reflection.errorPatterns,
        reflection.suggestions
      )
    } else if (overallSuccess) {
      await experienceStore.add(
        this.categorizeGoal(context.goal),
        context.goal,
        '成功完成任务',
        true,
        [],
        reflection.learnedLessons
      )
    }

    const result: EnhancedTaskResult = {
      taskId,
      goal: context.goal,
      overallSuccess,
      steps: context.steps,
      summary: this.generateSummary(context, overallSuccess, reflection),
      reflection,
      suggestions: reflection.suggestions,
      learnedFromPast: context.relevantExperience || [],
      executionTime: duration
    }

    this.activeContexts.delete(taskId)

    logger.info('[IntelligentAgent] Task finished', {
      taskId,
      overallSuccess,
      stepsCount: context.steps.length,
      duration: `${Math.round(duration / 1000)}s`
    })

    return result
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): EnhancedTaskContext | null {
    return this.activeContexts.get(taskId) || null
  }

  /**
   * 生成总结
   */
  private generateSummary(
    context: EnhancedTaskContext,
    overallSuccess: boolean,
    reflection: ReflectionResult
  ): string {
    const successCount = context.steps.filter(s => s.success).length
    const totalCount = context.steps.length

    let summary = overallSuccess
      ? `任务成功完成`
      : `任务部分完成 (${successCount}/${totalCount} 步骤)`

    if (context.relevantExperience && context.relevantExperience.length > 0) {
      summary += `\n参考历史经验：${context.relevantExperience[0].approach.substring(0, 30)}...`
    }

    if (reflection.learnedLessons.length > 0) {
      summary += `\n经验：${reflection.learnedLessons[0]}`
    }

    return summary
  }

  /**
   * 分类目标
   */
  private categorizeGoal(goal: string): string {
    if (goal.includes('文件') || goal.includes('创建') || goal.includes('写入')) return 'file_operation'
    if (goal.includes('浏览器') || goal.includes('网页') || goal.includes('打开')) return 'browser_automation'
    if (goal.includes('搜索')) return 'search'
    if (goal.includes('命令') || goal.includes('终端') || goal.includes('执行')) return 'shell'
    if (goal.includes('网站') || goal.includes('静态')) return 'web_development'
    return 'general'
  }

  /**
   * 获取经验统计
   */
  async getExperienceStats() {
    return await experienceStore.getStats()
  }

  /**
   * 清理过期任务
   */
  cleanup(timeoutMs: number = 30 * 60 * 1000): void {
    const now = Date.now()
    for (const [taskId, context] of this.activeContexts.entries()) {
      if (now - context.startTime > timeoutMs) {
        this.activeContexts.delete(taskId)
        logger.warn('[IntelligentAgent] Task timed out', { taskId })
      }
    }
  }
}

export const intelligentAgentService = IntelligentAgentService.getInstance()
