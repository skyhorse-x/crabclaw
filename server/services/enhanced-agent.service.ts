/**
 * 增强型智能Agent服务
 * 集成自主学习闭环系统
 */

import { logger } from './logger.service'
import { reflectionService, type ExecutionRecord, type ReflectionResult } from './reflection.service'
import { experienceStore, type Experience } from './experience-store'
import { enhancedLearningService, LearningInsights } from './enhanced-learning.service'
import type { ExecutionRecord as LearningExecutionRecord } from '../learning/types'

export interface EnhancedTaskContext {
  taskId: string
  goal: string
  startTime: number
  steps: EnhancedStep[]
  reflection?: ReflectionResult
  relevantExperience?: Experience[]
  learningInsights?: LearningInsights
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
  learningOutcome?: {
    newPatterns: number
    rulesLearned: number
    strategyUpdates: number
  }
  executionTime: number
}

export class EnhancedAgentService {
  private static instance: EnhancedAgentService
  private activeContexts: Map<string, EnhancedTaskContext> = new Map()
  private initialized: boolean = false

  private constructor() {}

  static getInstance(): EnhancedAgentService {
    if (!EnhancedAgentService.instance) {
      EnhancedAgentService.instance = new EnhancedAgentService()
    }
    return EnhancedAgentService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await experienceStore.initialize()
      await enhancedLearningService.initialize()
      this.initialized = true
      logger.info('[EnhancedAgent] Service initialized with learning system')
    } catch (error) {
      logger.error('[EnhancedAgent] Initialize failed', error)
    }
  }

  /**
   * 开始任务上下文 - 增强版，带学习洞察
   */
  async startTask(goal: string): Promise<EnhancedTaskContext> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const relevantExperience = await experienceStore.search(goal, 3)

    let learningInsights: LearningInsights | undefined
    try {
      learningInsights = await enhancedLearningService.getInsightsForTask(goal)
    } catch (error) {
      logger.warn('[EnhancedAgent] Failed to get learning insights', error)
    }

    const context: EnhancedTaskContext = {
      taskId,
      goal,
      startTime: Date.now(),
      steps: [],
      relevantExperience,
      learningInsights
    }

    this.activeContexts.set(taskId, context)

    logger.info('[EnhancedAgent] Task started', {
      taskId,
      goal: goal.substring(0, 50),
      relevantExperienceCount: relevantExperience.length,
      learningConfidence: learningInsights?.confidence || 0,
      hasPatterns: !!learningInsights?.appliedPatterns?.length
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

    logger.debug('[EnhancedAgent] Step recorded', {
      taskId,
      stepId: step.id,
      tool,
      server,
      success
    })
  }

  /**
   * 结束任务并生成反思 - 增强版，带深度学习
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

    await this.learnFromExecution(record, context)

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

    logger.info('[EnhancedAgent] Task finished', {
      taskId,
      overallSuccess,
      stepsCount: context.steps.length,
      duration: `${Math.round(duration / 1000)}s`
    })

    return result
  }

  /**
   * 执行深度学习
   */
  private async learnFromExecution(
    record: ExecutionRecord,
    _context: EnhancedTaskContext
  ): Promise<void> {
    try {
      const learningRecord: LearningExecutionRecord = {
        taskId: record.taskId,
        goal: record.goal,
        steps: record.steps.map((s, i) => ({
          id: `step_${i}`,
          tool: s.tool,
          server: s.server,
          args: {},
          success: s.success,
          error: s.error,
          duration: s.duration || 0,
          timestamp: Date.now()
        })),
        overallSuccess: record.overallSuccess,
        duration: record.duration,
        timestamp: record.timestamp
      }

      const result = await enhancedLearningService.learnFromExecution(learningRecord)

      if (result.success && result.outcome) {
        logger.info('[EnhancedAgent] Learning completed', {
          taskId: record.taskId,
          newPatterns: result.outcome.newPatterns?.length || 0,
          rulesLearned: result.outcome.appliedRules?.length || 0
        })
      }
    } catch (error) {
      logger.error('[EnhancedAgent] Learning failed', error)
    }
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
      ? `✅ 任务成功完成`
      : `⚠️ 任务部分完成 (${successCount}/${totalCount} 步骤)`

    if (context.learningInsights) {
      if (context.learningInsights.confidence > 0.6) {
        summary += `\n🧠 学习置信度: ${Math.round(context.learningInsights.confidence * 100)}%`
      }
      if (context.learningInsights.appliedPatterns.length > 0) {
        summary += `\n📋 应用模式: ${context.learningInsights.appliedPatterns[0].name}`
      }
    }

    if (context.relevantExperience && context.relevantExperience.length > 0) {
      summary += `\n📚 参考历史经验：${context.relevantExperience[0].approach.substring(0, 30)}...`
    }

    if (reflection.learnedLessons.length > 0) {
      summary += `\n💡 经验：${reflection.learnedLessons[0]}`
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
   * 获取学习系统状态
   */
  async getLearningStatus() {
    return await enhancedLearningService.getStatus()
  }

  /**
   * 获取学习洞察
   */
  async getLearningInsights(task: string) {
    return await enhancedLearningService.getInsightsForTask(task)
  }

  /**
   * 清理过期任务
   */
  cleanup(timeoutMs: number = 30 * 60 * 1000): void {
    const now = Date.now()
    for (const [taskId, context] of this.activeContexts.entries()) {
      if (now - context.startTime > timeoutMs) {
        this.activeContexts.delete(taskId)
        logger.warn('[EnhancedAgent] Task timed out', { taskId })
      }
    }
  }
}

export const enhancedAgentService = EnhancedAgentService.getInstance()
