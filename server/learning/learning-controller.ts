/**
 * 学习控制器
 * 协调整个自主学习闭环的运转
 */

import { logger } from '../services/logger.service'
import { deepReflector } from './reflector'
import { experienceGraph } from './experience-graph'
import { patternLibrary } from './pattern-library'
import { strategyOptimizer } from './strategy-optimizer'
import type {
  ExecutionRecord,
  LearningOutcome,
  AppliedKnowledge,
  OptimizationReport,
  DeepReflection,
  SuccessPattern,
  Strategy,
  ExperienceSearchResult,
  LearningConfig
} from './types'
import { DEFAULT_LEARNING_CONFIG } from './types'

export class LearningController {
  private static instance: LearningController
  private initialized: boolean = false
  private config: LearningConfig
  private autoOptimizationTimer?: NodeJS.Timeout

  private constructor() {
    this.config = { ...DEFAULT_LEARNING_CONFIG }
  }

  static getInstance(): LearningController {
    if (!LearningController.instance) {
      LearningController.instance = new LearningController()
    }
    return LearningController.instance
  }

  async initialize(config?: Partial<LearningConfig>): Promise<void> {
    if (this.initialized) {
      return
    }

    this.config = { ...DEFAULT_LEARNING_CONFIG, ...config }

    logger.info('[LearningController] Initializing learning system...')

    await experienceGraph.initialize()
    await patternLibrary.initialize()
    await strategyOptimizer.initialize()

    if (this.config.enableAutoOptimization) {
      this.startAutoOptimization()
    }

    this.initialized = true
    logger.info('[LearningController] Learning system initialized successfully')
  }

  /**
   * 完整学习闭环 - 从执行记录到知识更新
   */
  async learnFromExecution(record: ExecutionRecord): Promise<LearningOutcome> {
    logger.info('[LearningController] Learning from execution', {
      taskId: record.taskId,
      goal: record.goal.substring(0, 50),
      success: record.overallSuccess
    })

    const startTime = Date.now()

    let deepReflection: DeepReflection | null = null
    if (this.config.enableDeepReflection) {
      deepReflection = await deepReflector.analyze(record)
    }

    await experienceGraph.addFromReflection(deepReflection!)

    let newPatterns: SuccessPattern[] = []
    let updatedPatterns: SuccessPattern[] = []
    if (this.config.enablePatternExtraction && deepReflection) {
      const patternResult = await patternLibrary.extractPatterns(deepReflection)
      newPatterns = patternResult.newPatterns
      updatedPatterns = patternResult.updatedPatterns
    }

    let updatedStrategies: Strategy[] = []
    if (this.config.enableStrategyOptimization && deepReflection) {
      await strategyOptimizer.learnFromReflection(deepReflection)
      updatedStrategies = strategyOptimizer.getAllStrategies()
    }

    const outcome: LearningOutcome = {
      reflection: deepReflection!,
      newPatterns,
      updatedStrategies,
      appliedRules: deepReflection?.conditionalRules || [],
      timestamp: Date.now()
    }

    logger.info('[LearningController] Learning cycle completed', {
      taskId: record.taskId,
      duration: Date.now() - startTime,
      newPatterns: newPatterns.length,
      updatedPatterns: updatedPatterns.length,
      updatedStrategies: updatedStrategies.length
    })

    return outcome
  }

  /**
   * 应用历史经验到新任务
   */
  async applyToNewTask(task: string): Promise<AppliedKnowledge> {
    logger.debug('[LearningController] Applying knowledge to new task', {
      task: task.substring(0, 50)
    })

    const experiences = await experienceGraph.search(task, 5)

    const patternResult = await patternLibrary.match(task)

    const context = {
      taskType: this.inferTaskType(task),
      goal: task
    }
    const selectedStrategy = strategyOptimizer.selectStrategy(context)

    const plan = this.buildExecutionPlan(task, {
      experiences,
      patterns: patternResult.patterns,
      strategy: selectedStrategy
    })

    const confidence = this.calculateKnowledgeConfidence(experiences, patternResult.patterns)

    return {
      plan,
      knowledgeSources: {
        experiences,
        patterns: patternResult.patterns,
        strategies: selectedStrategy ? [selectedStrategy] : []
      },
      confidence
    }
  }

  /**
   * 执行自动优化
   */
  async autoOptimize(): Promise<OptimizationReport> {
    logger.info('[LearningController] Running auto optimization...')

    const { optimized, suggestions } = await strategyOptimizer.autoOptimize()

    await patternLibrary.pruneLowQualityPatterns()
    await experienceGraph.pruneOldExperiences(
      this.config.retentionPeriod
    )

    const report: OptimizationReport = {
      analyzedStrategies: strategyOptimizer.getStats().total,
      problematicStrategies: strategyOptimizer.getStats().declining > 0
        ? strategyOptimizer.getAllStrategies().filter(s => s.performance.trend === 'declining')
        : [],
      suggestedImprovements: suggestions,
      autoOptimized: optimized,
      pendingReview: suggestions.filter(s => s.includes('人工审核')).length,
      timestamp: Date.now()
    }

    logger.info('[LearningController] Auto optimization completed', {
      optimized,
      suggestions: suggestions.length,
      pendingReview: report.pendingReview
    })

    return report
  }

  /**
   * 获取学习系统状态
   */
  async getStatus(): Promise<{
    initialized: boolean
    config: LearningConfig
    experienceStats: any
    patternStats: any
    strategyStats: any
  }> {
    return {
      initialized: this.initialized,
      config: this.config,
      experienceStats: await experienceGraph.getStats(),
      patternStats: patternLibrary.getStats(),
      strategyStats: strategyOptimizer.getStats()
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.autoOptimizationTimer) {
      clearInterval(this.autoOptimizationTimer)
      this.autoOptimizationTimer = undefined
    }
    logger.info('[LearningController] Cleanup completed')
  }

  /**
   * 启动自动优化定时器
   */
  private startAutoOptimization(): void {
    if (this.autoOptimizationTimer) {
      clearInterval(this.autoOptimizationTimer)
    }

    this.autoOptimizationTimer = setInterval(async () => {
      try {
        await this.autoOptimize()
      } catch (error) {
        logger.error('[LearningController] Auto optimization failed', error)
      }
    }, this.config.autoOptimizationInterval)

    logger.info('[LearningController] Auto optimization scheduled', {
      interval: this.config.autoOptimizationInterval / 1000 / 60 + ' minutes'
    })
  }

  /**
   * 构建执行计划
   */
  private buildExecutionPlan(
    task: string,
    knowledge: {
      experiences: ExperienceSearchResult[]
      patterns: SuccessPattern[]
      strategy: Strategy | null
    }
  ): any {
    const { experiences, patterns, strategy } = knowledge

    const steps: any[] = []

    if (experiences.length > 0 && experiences[0].similarity > 0.6) {
      const bestExp = experiences[0].experience
      steps.push({
        type: 'experience_based',
        source: bestExp.id,
        description: `参考经验: ${bestExp.taskDescription.substring(0, 50)}...`,
        successRate: bestExp.successRate
      })
    }

    if (patterns.length > 0) {
      const bestPattern = patterns[0]
      steps.push({
        type: 'pattern_based',
        source: bestPattern.id,
        description: bestPattern.description,
        steps: bestPattern.structure.steps.map(s => ({
          action: s.action,
          timeout: s.timeout
        }))
      })
    }

    if (strategy) {
      steps.push({
        type: 'strategy',
        source: strategy.id,
        description: `使用策略: ${strategy.name}`,
        rules: strategy.rules.slice(0, 3).map(r => ({
          condition: r.condition,
          action: r.action
        }))
      })
    }

    return {
      task,
      steps,
      confidence: this.calculateKnowledgeConfidence(experiences, patterns),
      knowledgeCount: {
        experiences: experiences.length,
        patterns: patterns.length,
        strategies: strategy ? 1 : 0
      }
    }
  }

  /**
   * 计算知识置信度
   */
  private calculateKnowledgeConfidence(
    experiences: ExperienceSearchResult[],
    patterns: SuccessPattern[]
  ): number {
    let confidence = 0.3

    if (experiences.length > 0) {
      const avgSimilarity = experiences.reduce((sum, e) => sum + e.similarity, 0) / experiences.length
      const avgSuccessRate = experiences.reduce((sum, e) => sum + e.experience.successRate, 0) / experiences.length
      confidence += avgSimilarity * 0.3 + avgSuccessRate * 0.2
    }

    if (patterns.length > 0) {
      const avgPatternConfidence = patterns.reduce((sum, p) => sum + (p.applicability.confidence || 0), 0) / patterns.length
      confidence += avgPatternConfidence * 0.2
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(task: string): string {
    const taskLower = task.toLowerCase()
    if (/打开|访问|navigate|open|visit/i.test(taskLower)) return 'navigation'
    if (/搜索|search|query/i.test(taskLower)) return 'search'
    if (/创建|新建|create/i.test(taskLower)) return 'file_operation'
    if (/删除|remove|delete/i.test(taskLower)) return 'deletion'
    if (/读取|查看|read|view/i.test(taskLower)) return 'reading'
    if (/执行|运行|run|execute/i.test(taskLower)) return 'execution'
    return 'general'
  }
}

export const learningController = LearningController.getInstance()
