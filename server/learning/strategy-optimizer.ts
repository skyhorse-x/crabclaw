/**
 * 策略优化器
 * 基于历史表现自动调整和优化执行策略
 * 使用 UCB (Upper Confidence Bound) 算法平衡利用与探索
 */

import { logger } from '../services/logger.service'
import { createId } from '../shared/utils'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type {
  Strategy,
  StrategyRule,
  StrategyPerformance,
  DeepReflection,
  ConditionalRule
} from './types'

interface TaskContext {
  taskType: string
  goal: string
  constraints?: string[]
  previousAttempts?: number
}

export class StrategyOptimizer {
  private static instance: StrategyOptimizer
  private strategies: Map<string, Strategy> = new Map()
  private storagePath: string
  private initialized: boolean = false
  private maxRecentResults: number = 10

  private constructor() {
    this.storagePath = join(process.cwd(), 'data', 'strategy-optimizer.json')
  }

  static getInstance(): StrategyOptimizer {
    if (!StrategyOptimizer.instance) {
      StrategyOptimizer.instance = new StrategyOptimizer()
    }
    return StrategyOptimizer.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      const dir = this.storagePath.substring(0, this.storagePath.lastIndexOf('/'))
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      if (existsSync(this.storagePath)) {
        const data = JSON.parse(await readFile(this.storagePath, 'utf-8'))
        if (data.strategies) {
          for (const s of data.strategies) {
            this.strategies.set(s.id, s)
          }
        }
        logger.info('[StrategyOptimizer] Loaded strategies', { count: this.strategies.size })
      } else {
        await this.initializeDefaultStrategies()
      }

      this.initialized = true
      logger.info('[StrategyOptimizer] Initialized successfully')
    } catch (error) {
      logger.error('[StrategyOptimizer] Initialize failed', error)
      this.initialized = true
    }
  }

  /**
   * 初始化默认策略
   */
  private async initializeDefaultStrategies(): Promise<void> {
    const defaultStrategies: Strategy[] = [
      {
        id: 'default_planning',
        name: '默认规划策略',
        type: 'planning',
        rules: [
          { id: 'rule1', condition: '简单任务', action: '直接执行', priority: 1, confidence: 0.9, source: 'manual' },
          { id: 'rule2', condition: '复杂任务', action: '分解步骤', priority: 2, confidence: 0.8, source: 'manual' }
        ],
        performance: {
          totalAttempts: 0,
          successCount: 0,
          avgDuration: 0,
          recentResults: [],
          maxRecentResults: this.maxRecentResults,
          trend: 'stable',
          lastUpdated: Date.now()
        },
        conditions: ['planning'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'default_execution',
        name: '默认执行策略',
        type: 'execution',
        rules: [
          { id: 'rule1', condition: '单步执行', action: '顺序执行', priority: 1, confidence: 0.9, source: 'manual' },
          { id: 'rule2', condition: '多步执行', action: '逐步验证', priority: 2, confidence: 0.8, source: 'manual' }
        ],
        performance: {
          totalAttempts: 0,
          successCount: 0,
          avgDuration: 0,
          recentResults: [],
          maxRecentResults: this.maxRecentResults,
          trend: 'stable',
          lastUpdated: Date.now()
        },
        conditions: ['execution'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'default_recovery',
        name: '默认恢复策略',
        type: 'recovery',
        rules: [
          { id: 'rule1', condition: '可恢复错误', action: '自动重试', priority: 1, confidence: 0.7, source: 'manual' },
          { id: 'rule2', condition: '不可恢复错误', action: '回退方案', priority: 2, confidence: 0.8, source: 'manual' }
        ],
        performance: {
          totalAttempts: 0,
          successCount: 0,
          avgDuration: 0,
          recentResults: [],
          maxRecentResults: this.maxRecentResults,
          trend: 'stable',
          lastUpdated: Date.now()
        },
        conditions: ['recovery'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ]

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.id, strategy)
    }

    await this.save()
  }

  /**
   * 选择最佳策略
   * 使用 UCB 算法平衡利用(exploitation)和探索(exploration)
   */
  selectStrategy(context: TaskContext): Strategy | null {
    const applicableStrategies = this.getApplicableStrategies(context)

    if (applicableStrategies.length === 0) {
      return this.getDefaultStrategy(context)
    }

    let bestStrategy: Strategy | null = null
    let bestScore = -Infinity

    for (const strategy of applicableStrategies) {
      const score = this.calculateUCBScore(strategy)

      if (score > bestScore) {
        bestScore = score
        bestStrategy = strategy
      }
    }

    logger.debug('[StrategyOptimizer] Strategy selected', {
      selected: bestStrategy?.name,
      score: bestScore.toFixed(3)
    })

    return bestStrategy
  }

  /**
   * 使用 UCB1 算法计算策略分数
   * UCB1 = average_reward + c * sqrt(ln(total_attempts) / attempts)
   */
  private calculateUCBScore(strategy: Strategy): number {
    const { performance } = strategy
    const c = Math.sqrt(2)

    if (performance.totalAttempts === 0) {
      return Infinity
    }

    const avgReward = performance.successCount / performance.totalAttempts
    const explorationBonus = c * Math.sqrt(
      Math.log(performance.totalAttempts + 1) / performance.totalAttempts
    )

    let trendBonus = 0
    if (performance.trend === 'improving') {
      trendBonus = 0.1
    } else if (performance.trend === 'declining') {
      trendBonus = -0.1
    }

    return avgReward + explorationBonus + trendBonus
  }

  /**
   * 获取适用的策略
   */
  private getApplicableStrategies(context: TaskContext): Strategy[] {
    const { taskType } = context

    const applicable: Strategy[] = []

    for (const strategy of this.strategies.values()) {
      if (strategy.type === 'planning' && context.goal.length > 50) {
        applicable.push(strategy)
      } else if (strategy.conditions.some(c => taskType.includes(c))) {
        applicable.push(strategy)
      }
    }

    if (applicable.length === 0) {
      for (const strategy of this.strategies.values()) {
        if (strategy.type === 'execution') {
          applicable.push(strategy)
        }
      }
    }

    return applicable.sort((a, b) => {
      const scoreA = this.calculateUCBScore(a)
      const scoreB = this.calculateUCBScore(b)
      return scoreB - scoreA
    })
  }

  /**
   * 获取默认策略
   */
  private getDefaultStrategy(context: TaskContext): Strategy | null {
    const type = context.taskType || 'execution'
    for (const strategy of this.strategies.values()) {
      if (strategy.type === type || strategy.type === 'execution') {
        return strategy
      }
    }
    return null
  }

  /**
   * 更新策略表现
   */
  async updateStrategyPerformance(
    strategyId: string,
    success: boolean,
    duration: number
  ): Promise<void> {
    const strategy = this.strategies.get(strategyId)
    if (!strategy) {
      logger.warn('[StrategyOptimizer] Strategy not found', { strategyId })
      return
    }

    const { performance } = strategy

    performance.totalAttempts++
    if (success) {
      performance.successCount++
    }

    performance.avgDuration =
      (performance.avgDuration * (performance.totalAttempts - 1) + duration) /
      performance.totalAttempts

    performance.recentResults.push(success)
    if (performance.recentResults.length > performance.maxRecentResults) {
      performance.recentResults.shift()
    }

    performance.trend = this.calculateTrend(performance.recentResults)
    performance.lastUpdated = Date.now()

    strategy.updatedAt = Date.now()

    await this.save()

    logger.debug('[StrategyOptimizer] Strategy performance updated', {
      strategyId,
      success,
      totalAttempts: performance.totalAttempts,
      successRate: (performance.successCount / performance.totalAttempts).toFixed(3)
    })
  }

  /**
   * 从反思结果学习并更新策略
   */
  async learnFromReflection(reflection: DeepReflection): Promise<void> {
    const { conditionalRules, failurePoints, record } = reflection

    for (const rule of conditionalRules) {
      await this.addLearnedRule(rule)
    }

    const recoveryStrategy = this.findOrCreateRecoveryStrategy()

    for (const fp of failurePoints) {
      if (fp.recoverable) {
        const rule: StrategyRule = {
          id: createId('rule'),
          condition: `错误类型:${fp.errorType}`,
          action: `自动重试或使用替代方案`,
          priority: fp.severity === 'critical' ? 1 : 2,
          confidence: 0.6,
          source: 'learned'
        }

        const existingRule = recoveryStrategy.rules.find(r => r.condition === rule.condition)
        if (!existingRule) {
          recoveryStrategy.rules.push(rule)
        }
      }
    }

    await this.updateStrategyPerformance(
      recoveryStrategy.id,
      record.overallSuccess,
      record.duration
    )

    await this.save()
  }

  /**
   * 添加学习到的规则
   */
  private async addLearnedRule(rule: ConditionalRule): Promise<void> {
    const taskType = this.inferTaskType(rule.condition)

    let strategy = this.findStrategyByType(taskType === 'general' ? 'execution' : taskType)

    if (!strategy) {
      strategy = this.createNewStrategy(taskType)
    }

    const existingRule = strategy.rules.find(r => r.condition === rule.condition)
    if (existingRule) {
      existingRule.confidence =
        (existingRule.confidence * existingRule.confidence + rule.successRate) / 2
    } else {
      strategy.rules.push({
        id: rule.id,
        condition: rule.condition,
        action: rule.action,
        priority: 1,
        confidence: rule.successRate,
        source: 'learned'
      })
    }

    strategy.rules.sort((a, b) => b.priority - a.priority || b.confidence - a.confidence)

    if (strategy.rules.length > 20) {
      strategy.rules = strategy.rules.slice(0, 20)
    }

    strategy.updatedAt = Date.now()
  }

  /**
   * 查找或创建恢复策略
   */
  private findOrCreateRecoveryStrategy(): Strategy {
    let strategy = this.strategies.get('default_recovery')

    if (!strategy) {
      strategy = this.createNewStrategy('recovery')
      strategy.id = 'default_recovery'
      this.strategies.set(strategy.id, strategy)
    }

    return strategy
  }

  /**
   * 根据类型查找策略
   */
  private findStrategyByType(type: string): Strategy | null {
    for (const strategy of this.strategies.values()) {
      if (strategy.type === type || strategy.conditions.includes(type)) {
        return strategy
      }
    }
    return null
  }

  /**
   * 创建新策略
   */
  private createNewStrategy(type: string): Strategy {
    const strategy: Strategy = {
      id: createId('strat'),
      name: `自动学习_${type}_策略`,
      type: type as 'planning' | 'execution' | 'recovery',
      rules: [],
      performance: {
        totalAttempts: 0,
        successCount: 0,
        avgDuration: 0,
        recentResults: [],
        maxRecentResults: this.maxRecentResults,
        trend: 'stable',
        lastUpdated: Date.now()
      },
      conditions: [type],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.strategies.set(strategy.id, strategy)
    return strategy
  }

  /**
   * 计算趋势
   */
  private calculateTrend(recentResults: boolean[]): 'improving' | 'stable' | 'declining' {
    if (recentResults.length < 3) {
      return 'stable'
    }

    const n = recentResults.length
    const half = Math.floor(n / 2)

    const firstHalfSuccess = recentResults.slice(0, half).filter(r => r).length / half
    const secondHalfSuccess = recentResults.slice(half).filter(r => r).length / (n - half)

    const diff = secondHalfSuccess - firstHalfSuccess

    if (diff > 0.1) return 'improving'
    if (diff < -0.1) return 'declining'
    return 'stable'
  }

  /**
   * 自动优化策略
   */
  async autoOptimize(): Promise<{
    optimized: number
    suggestions: string[]
  }> {
    const suggestions: string[] = []
    let optimized = 0

    for (const strategy of this.strategies.values()) {
      if (strategy.performance.trend === 'declining') {
        const declineRate = this.calculateDeclineRate(strategy.performance)

        if (declineRate > 0.3 && strategy.performance.totalAttempts >= 10) {
          suggestions.push(`策略 "${strategy.name}" 成功率下降${(declineRate * 100).toFixed(0)}%，建议人工审核`)

          const newRules = await this.suggestRuleImprovements(strategy)
          if (newRules.length > 0) {
            strategy.rules.push(...newRules)
            optimized++
          }
        }
      }

      if (strategy.performance.totalAttempts < 5) {
        const lowConfidenceRules = strategy.rules.filter(r => r.confidence < 0.5)
        for (const rule of lowConfidenceRules) {
          rule.confidence = Math.min(rule.confidence + 0.05, 0.5)
        }
      }
    }

    if (optimized > 0) {
      await this.save()
      logger.info('[StrategyOptimizer] Auto optimization completed', { optimized })
    }

    return { optimized, suggestions }
  }

  /**
   * 计算下降率
   */
  private calculateDeclineRate(performance: StrategyPerformance): number {
    if (performance.recentResults.length < 6) return 0

    const recent = performance.recentResults.slice(-6)
    const older = performance.recentResults.slice(-12, -6)

    if (older.length === 0) return 0

    const recentSuccess = recent.filter(r => r).length / recent.length
    const olderSuccess = older.filter(r => r).length / older.length

    return olderSuccess - recentSuccess
  }

  /**
   * 建议规则改进
   */
  private async suggestRuleImprovements(strategy: Strategy): Promise<StrategyRule[]> {
    const improvements: StrategyRule[] = []

    const failedRules = strategy.rules.filter(r =>
      strategy.performance.recentResults.slice(-5).every(r => !r)
    )

    for (const failedRule of failedRules) {
      improvements.push({
        id: createId('imp'),
        condition: `${failedRule.condition}_备选`,
        action: failedRule.action,
        priority: failedRule.priority + 1,
        confidence: 0.3,
        source: 'derived'
      })
    }

    return improvements
  }

  /**
   * 获取所有策略
   */
  getAllStrategies(): Strategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * 获取策略统计
   */
  getStats(): {
    total: number
    byType: Record<string, number>
    avgSuccessRate: number
    improving: number
    declining: number
  } {
    const strategies = Array.from(this.strategies.values())

    const byType: Record<string, number> = {}
    let totalSuccess = 0
    let totalAttempts = 0
    let improving = 0
    let declining = 0

    for (const s of strategies) {
      const type = s.type
      byType[type] = (byType[type] || 0) + 1

      totalSuccess += s.performance.successCount
      totalAttempts += s.performance.totalAttempts

      if (s.performance.trend === 'improving') improving++
      if (s.performance.trend === 'declining') declining++
    }

    return {
      total: strategies.length,
      byType,
      avgSuccessRate: totalAttempts > 0 ? totalSuccess / totalAttempts : 0,
      improving,
      declining
    }
  }

  /**
   * 删除低质量策略
   */
  async pruneLowQualityStrategies(): Promise<number> {
    let pruned = 0

    for (const [id, strategy] of this.strategies.entries()) {
      if (strategy.performance.totalAttempts >= 10) {
        const successRate = strategy.performance.successCount / strategy.performance.totalAttempts
        if (successRate < 0.2 && strategy.performance.trend === 'declining') {
          this.strategies.delete(id)
          pruned++
        }
      }
    }

    if (pruned > 0) {
      await this.save()
      logger.info('[StrategyOptimizer] Pruned low quality strategies', { pruned })
    }

    return pruned
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(text: string): string {
    const textLower = text.toLowerCase()
    if (/planning|plan|规划/i.test(textLower)) return 'planning'
    if (/recovery|恢复|重试/i.test(textLower)) return 'recovery'
    if (/execution|执行/i.test(textLower)) return 'execution'
    return 'execution'
  }

  /**
   * 保存到磁盘
   */
  private async save(): Promise<void> {
    try {
      const data = {
        strategies: Array.from(this.strategies.values())
      }
      await writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      logger.error('[StrategyOptimizer] Save failed', error)
    }
  }
}

export const strategyOptimizer = StrategyOptimizer.getInstance()
