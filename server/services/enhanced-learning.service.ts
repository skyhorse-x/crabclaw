/**
 * 增强型学习服务
 * 将新的 learning 模块与现有系统集成
 */

import { logger } from './logger.service'
import { learningController, ExperienceSearchResult } from '../learning'
import type { ExecutionRecord as LearningExecutionRecord } from '../learning/types'
import type { ExecutionRecord } from './reflection.service'
import type { EnhancedStep } from './intelligent-agent.service'
// import type { Experience } from './experience-store'

export interface LearningInsights {
  relevantExperiences: ExperienceSearchResult[]
  appliedPatterns: any[]
  selectedStrategy: any
  confidence: number
  suggestions: string[]
}

export class EnhancedLearningService {
  private static instance: EnhancedLearningService
  private initialized: boolean = false

  private constructor() {}

  static getInstance(): EnhancedLearningService {
    if (!EnhancedLearningService.instance) {
      EnhancedLearningService.instance = new EnhancedLearningService()
    }
    return EnhancedLearningService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await learningController.initialize()
      this.initialized = true
      logger.info('[EnhancedLearning] Service initialized')
    } catch (error) {
      logger.error('[EnhancedLearning] Initialize failed', error)
      throw error
    }
  }

  /**
   * 在任务开始前获取学习洞察
   */
  async getInsightsForTask(task: string): Promise<LearningInsights> {
    try {
      const knowledge = await learningController.applyToNewTask(task)

      const suggestions: string[] = []

      if (knowledge.knowledgeSources.patterns.length > 0) {
        const bestPattern = knowledge.knowledgeSources.patterns[0]
        suggestions.push(`建议使用模式: ${bestPattern.name}`)
      }

      if (knowledge.knowledgeSources.experiences.length > 0) {
        const bestExp = knowledge.knowledgeSources.experiences[0]
        if (bestExp.experience.successRate < 0.5) {
          suggestions.push('注意：存在类似失败经验，请谨慎执行')
        }
      }

      return {
        relevantExperiences: knowledge.knowledgeSources.experiences,
        appliedPatterns: knowledge.knowledgeSources.patterns,
        selectedStrategy: knowledge.knowledgeSources.strategies[0] || null,
        confidence: knowledge.confidence,
        suggestions
      }
    } catch (error) {
      logger.error('[EnhancedLearning] Get insights failed', error)
      return {
        relevantExperiences: [],
        appliedPatterns: [],
        selectedStrategy: null,
        confidence: 0,
        suggestions: []
      }
    }
  }

  /**
   * 从执行记录中学习
   */
  async learnFromExecution(record: ExecutionRecord): Promise<{
    success: boolean
    outcome?: any
    error?: string
  }> {
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

      const outcome = await learningController.learnFromExecution(learningRecord)

      logger.info('[EnhancedLearning] Learning completed', {
        taskId: record.taskId,
        success: record.overallSuccess,
        newPatterns: outcome.newPatterns.length,
        rulesLearned: outcome.appliedRules.length
      })

      return { success: true, outcome }
    } catch (error: any) {
      logger.error('[EnhancedLearning] Learning failed', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取学习系统状态
   */
  async getStatus(): Promise<{
    initialized: boolean
    experienceCount: number
    patternCount: number
    strategyCount: number
    overallConfidence: number
  }> {
    try {
      const status = await learningController.getStatus()
      return {
        initialized: status.initialized,
        experienceCount: status.experienceStats.total,
        patternCount: status.patternStats.totalPatterns,
        strategyCount: status.strategyStats.total,
        overallConfidence: status.experienceStats.successRate
      }
    } catch (error) {
      logger.error('[EnhancedLearning] Get status failed', error)
      return {
        initialized: false,
        experienceCount: 0,
        patternCount: 0,
        strategyCount: 0,
        overallConfidence: 0
      }
    }
  }

  /**
   * 执行自动优化
   */
  async runOptimization(): Promise<{
    success: boolean
    report?: any
    error?: string
  }> {
    try {
      const report = await learningController.autoOptimize()
      return { success: true, report }
    } catch (error: any) {
      logger.error('[EnhancedLearning] Auto optimization failed', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 转换步骤格式
   */
  convertStepsToExecutionRecord(
    taskId: string,
    goal: string,
    steps: EnhancedStep[],
    duration: number,
    overallSuccess: boolean
  ): ExecutionRecord {
    return {
      taskId,
      goal,
      steps: steps.map(s => ({
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
  }
}

export const enhancedLearningService = EnhancedLearningService.getInstance()
