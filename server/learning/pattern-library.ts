/**
 * 模式库
 * 从经验中自动提取和匹配可复用的执行模式
 */

import { logger } from '../services/logger.service'
import { createId } from '../shared/utils'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { PATHS } from '../shared/constants'
import type {
  SuccessPattern,
  FailurePattern,
  PatternStep,
  Fallback,
  DeepReflection,
  RootCause,
  Solution
} from './types'

export class PatternLibrary {
  private static instance: PatternLibrary
  private successPatterns: Map<string, SuccessPattern> = new Map()
  private failurePatterns: Map<string, FailurePattern> = new Map()
  private storagePath: string
  private initialized: boolean = false

  private constructor() {
    this.storagePath = join(PATHS.DATA_DIR, 'pattern-library.json')
  }

  static getInstance(): PatternLibrary {
    if (!PatternLibrary.instance) {
      PatternLibrary.instance = new PatternLibrary()
    }
    return PatternLibrary.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      const dir = dirname(this.storagePath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      if (existsSync(this.storagePath)) {
        const data = JSON.parse(await readFile(this.storagePath, 'utf-8'))
        if (data.successPatterns) {
          for (const p of data.successPatterns) {
            this.successPatterns.set(p.id, p)
          }
        }
        if (data.failurePatterns) {
          for (const p of data.failurePatterns) {
            this.failurePatterns.set(p.id, p)
          }
        }
        logger.info('[PatternLibrary] Loaded patterns', {
          success: this.successPatterns.size,
          failure: this.failurePatterns.size
        })
      }

      this.initialized = true
      logger.info('[PatternLibrary] Initialized successfully')
    } catch (error) {
      logger.error('[PatternLibrary] Initialize failed', error)
      this.initialized = true
    }
  }

  /**
   * 从反思结果提取模式
   */
  async extractPatterns(reflection: DeepReflection): Promise<{
    newPatterns: SuccessPattern[]
    updatedPatterns: SuccessPattern[]
  }> {
    const { record, failurePoints } = reflection
    const newPatterns: SuccessPattern[] = []
    const updatedPatterns: SuccessPattern[] = []

    if (record.overallSuccess) {
      const pattern = await this.extractSuccessPattern(reflection)
      if (pattern) {
        const existing = this.findSimilarPattern(pattern)
        if (existing) {
          this.updatePattern(existing, pattern)
          updatedPatterns.push(existing)
        } else {
          this.successPatterns.set(pattern.id, pattern)
          newPatterns.push(pattern)
        }
      }
    }

    if (failurePoints.length > 0) {
      const failurePattern = this.extractFailurePattern(reflection)
      const existingFailure = this.findSimilarFailurePattern(failurePattern)
      if (existingFailure) {
        this.updateFailurePattern(existingFailure, failurePattern)
        updatedPatterns.push(existingFailure as any)
      } else {
        this.failurePatterns.set(failurePattern.id, failurePattern)
      }
    }

    await this.save()

    logger.info('[PatternLibrary] Patterns extracted', {
      newPatterns: newPatterns.length,
      updatedPatterns: updatedPatterns.length
    })

    return { newPatterns, updatedPatterns }
  }

  /**
   * 提取成功模式
   */
  private async extractSuccessPattern(reflection: DeepReflection): Promise<SuccessPattern | null> {
    const { record } = reflection

    if (record.steps.length === 0) {
      return null
    }

    const taskType = this.inferTaskType(record.goal)

    const steps: PatternStep[] = record.steps.map((step, index) => ({
      sequence: index + 1,
      action: `${step.server}/${step.tool}`,
      expectedResult: step.success ? '成功' : '失败',
      timeout: Math.max(step.duration * 2, 5000),
      critical: index === 0 || index === record.steps.length - 1,
      retryable: this.isRetryable(step)
    }))

    const pattern: SuccessPattern = {
      id: createId('pat'),
      name: `${taskType}_pattern_${Date.now()}`,
      description: this.generatePatternDescription(record.goal, taskType, steps),
      trigger: {
        taskTypes: [taskType],
        keywords: this.extractKeywords(record.goal),
        contextPreconditions: this.extractPreconditions(reflection)
      },
      structure: {
        steps,
        fallbacks: this.generateFallbacks(reflection)
      },
      effectiveness: {
        successRate: 1.0,
        avgDuration: record.duration,
        sampleSize: 1,
        lastValidated: Date.now(),
        trend: 'stable'
      },
      applicability: {
        domains: this.extractDomains(record.goal),
        limitations: this.extractLimitations(reflection),
        confidence: 0.5
      }
    }

    return pattern
  }

  /**
   * 提取失败模式
   */
  private extractFailurePattern(reflection: DeepReflection): FailurePattern {
    const { failurePoints } = reflection

    const rootCauses: RootCause[] = failurePoints.map(fp => ({
      category: this.categorizeRootCause(fp.rootCause),
      description: fp.rootCause,
      frequency: 1
    }))

    const solutions: Solution[] = failurePoints
      .filter(fp => fp.recoverable)
      .map(fp => ({
        action: `考虑替代方案：${fp.errorType}`,
        successRate: 0,
        attempts: 0
      }))

    return {
      id: createId('fail'),
      errorType: failurePoints[0]?.errorType || 'unknown',
      symptoms: failurePoints.map(fp => fp.errorMessage.substring(0, 100)),
      rootCauses,
      solutions,
      prevention: this.generatePrevention(failurePoints)
    }
  }

  /**
   * 匹配适用模式
   */
  async match(task: string): Promise<{
    patterns: SuccessPattern[]
    failureWarnings: FailurePattern[]
  }> {
    const taskType = this.inferTaskType(task)
    const keywords = this.extractKeywords(task)

    const matchedPatterns: SuccessPattern[] = []
    const failureWarnings: FailurePattern[] = []

    for (const pattern of this.successPatterns.values()) {
      const score = this.calculatePatternMatchScore(pattern, taskType, keywords, task)
      if (score > 0.6) {
        matchedPatterns.push({ ...pattern, applicability: { ...pattern.applicability, confidence: score } })
      }
    }

    for (const failure of this.failurePatterns.values()) {
      if (this.shouldWarnFailure(failure, taskType, task)) {
        failureWarnings.push(failure)
      }
    }

    matchedPatterns.sort((a, b) =>
      (b.applicability.confidence || 0) - (a.applicability.confidence || 0)
    )

    logger.debug('[PatternLibrary] Pattern matching completed', {
      taskType,
      matchedPatterns: matchedPatterns.length,
      failureWarnings: failureWarnings.length
    })

    return { patterns: matchedPatterns.slice(0, 3), failureWarnings }
  }

  /**
   * 获取所有成功模式
   */
  getAllPatterns(): SuccessPattern[] {
    return Array.from(this.successPatterns.values())
  }

  /**
   * 获取特定类型的模式
   */
  getPatternsByType(taskType: string): SuccessPattern[] {
    return Array.from(this.successPatterns.values())
      .filter(p => p.trigger.taskTypes.includes(taskType))
  }

  /**
   * 获取模式统计
   */
  getStats(): {
    totalPatterns: number
    byType: Record<string, number>
    bySuccessRate: { high: number; medium: number; low: number }
    totalFailures: number
  } {
    const patterns = Array.from(this.successPatterns.values())

    const byType: Record<string, number> = {}
    let high = 0, medium = 0, low = 0

    for (const p of patterns) {
      const type = p.trigger.taskTypes[0] || 'unknown'
      byType[type] = (byType[type] || 0) + 1

      if (p.effectiveness.successRate >= 0.8) high++
      else if (p.effectiveness.successRate >= 0.5) medium++
      else low++
    }

    return {
      totalPatterns: patterns.length,
      byType,
      bySuccessRate: { high, medium, low },
      totalFailures: this.failurePatterns.size
    }
  }

  /**
   * 删除低质量模式
   */
  async pruneLowQualityPatterns(minSuccessRate: number = 0.3): Promise<number> {
    let pruned = 0

    for (const [id, pattern] of this.successPatterns.entries()) {
      if (pattern.effectiveness.successRate < minSuccessRate &&
          pattern.effectiveness.sampleSize >= 3) {
        this.successPatterns.delete(id)
        pruned++
      }
    }

    if (pruned > 0) {
      await this.save()
      logger.info('[PatternLibrary] Pruned low quality patterns', { pruned })
    }

    return pruned
  }

  /**
   * 计算模式匹配分数
   */
  private calculatePatternMatchScore(
    pattern: SuccessPattern,
    taskType: string,
    keywords: string[],
    task: string
  ): number {
    let score = 0

    if (pattern.trigger.taskTypes.includes(taskType)) {
      score += 0.4
    }

    const keywordMatches = keywords.filter(k =>
      pattern.trigger.keywords.some(pk => pk.toLowerCase().includes(k.toLowerCase()))
    )
    score += (keywordMatches.length / Math.max(keywords.length, 1)) * 0.3

    const taskLower = task.toLowerCase()
    for (const keyword of pattern.trigger.keywords) {
      if (taskLower.includes(keyword.toLowerCase())) {
        score += 0.1
      }
    }

    score += pattern.effectiveness.successRate * 0.2

    return Math.min(score, 1.0)
  }

  /**
   * 查找相似模式
   */
  private findSimilarPattern(pattern: SuccessPattern): SuccessPattern | null {
    for (const existing of this.successPatterns.values()) {
      if (existing.trigger.taskTypes[0] === pattern.trigger.taskTypes[0]) {
        const stepsMatch = existing.structure.steps.length === pattern.structure.steps.length &&
          existing.structure.steps.every((s, i) => s.action === pattern.structure.steps[i].action)

        if (stepsMatch) {
          return existing
        }
      }
    }
    return null
  }

  /**
   * 更新已有模式
   */
  private updatePattern(existing: SuccessPattern, newPattern: SuccessPattern): void {
    const totalSamples = existing.effectiveness.sampleSize + 1
    existing.effectiveness.successRate =
      (existing.effectiveness.successRate * existing.effectiveness.sampleSize +
       newPattern.effectiveness.successRate) / totalSamples
    existing.effectiveness.sampleSize = totalSamples
    existing.effectiveness.lastValidated = Date.now()

    if (existing.effectiveness.trend === 'stable') {
      if (newPattern.effectiveness.successRate > existing.effectiveness.successRate) {
        existing.effectiveness.trend = 'improving'
      } else if (newPattern.effectiveness.successRate < existing.effectiveness.successRate) {
        existing.effectiveness.trend = 'declining'
      }
    }

    existing.structure.fallbacks = [
      ...(existing.structure.fallbacks || []),
      ...(newPattern.structure.fallbacks || [])
    ].slice(0, 5)
  }

  /**
   * 查找相似失败模式
   */
  private findSimilarFailurePattern(pattern: FailurePattern): FailurePattern | null {
    for (const existing of this.failurePatterns.values()) {
      if (existing.errorType === pattern.errorType) {
        return existing
      }
    }
    return null
  }

  /**
   * 更新失败模式
   */
  private updateFailurePattern(existing: FailurePattern, newPattern: FailurePattern): void {
    for (const newCause of newPattern.rootCauses) {
      const existingCause = existing.rootCauses.find(c => c.description === newCause.description)
      if (existingCause) {
        existingCause.frequency++
      } else {
        existing.rootCauses.push(newCause)
      }
    }

    existing.symptoms = [...new Set([...existing.symptoms, ...newPattern.symptoms])].slice(0, 10)
  }

  /**
   * 判断是否应该警告此失败
   */
  private shouldWarnFailure(failure: FailurePattern, _taskType: string, task: string): boolean {
    const taskLower = task.toLowerCase()

    for (const symptom of failure.symptoms) {
      if (taskLower.includes(symptom.toLowerCase())) {
        return true
      }
    }

    if (failure.rootCauses.some(c => c.category === 'permission' && task.includes('file'))) {
      return true
    }

    return false
  }

  /**
   * 生成模式描述
   */
  private generatePatternDescription(goal: string, taskType: string, steps: PatternStep[]): string {
    const actionCount = steps.length
    return `用于${taskType}任务的模式：${goal.substring(0, 50)}...，包含${actionCount}个步骤`
  }

  /**
   * 提取关键词
   */
  private extractKeywords(goal: string): string[] {
    const stopWords = new Set(['的', '了', '和', '与', '在', '是', '我', '你', '他', '它', '这', '那', 'a', 'an', 'the', 'to', 'and', 'or', 'in', 'on', 'at'])
    const words = goal.toLowerCase().split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))

    return [...new Set(words)].slice(0, 10)
  }

  /**
   * 提取前置条件
   */
  private extractPreconditions(reflection: DeepReflection): string[] {
    const preconditions: string[] = []

    const hasBrowser = reflection.causalChain.some(n => n.action.includes('chrome') || n.action.includes('browser'))
    if (hasBrowser) {
      preconditions.push('浏览器已启动')
    }

    const hasNetwork = reflection.record.steps.some(s => s.tool.includes('fetch') || s.tool.includes('http'))
    if (hasNetwork) {
      preconditions.push('网络连接正常')
    }

    return preconditions
  }

  /**
   * 生成回退策略
   */
  private generateFallbacks(reflection: DeepReflection): Fallback[] {
    const fallbacks: Fallback[] = []

    for (const fp of reflection.failurePoints) {
      if (fp.recoverable) {
        fallbacks.push({
          trigger: fp.errorType,
          recoveryAction: `使用替代${fp.stepId}方案`,
          description: `当遇到${fp.errorType}时的恢复方法`
        })
      }
    }

    return fallbacks
  }

  /**
   * 提取适用领域
   */
  private extractDomains(goal: string): string[] {
    const domains: string[] = ['general']

    const goalLower = goal.toLowerCase()
    if (/web|browser|http|url|网页|浏览器/i.test(goalLower)) domains.push('web')
    if (/file|folder|文档|文件/i.test(goalLower)) domains.push('file')
    if (/code|git|编程|代码/i.test(goalLower)) domains.push('development')
    if (/data|database|db|数据|数据库/i.test(goalLower)) domains.push('data')
    if (/image|photo|图片|图像/i.test(goalLower)) domains.push('media')

    return domains
  }

  /**
   * 提取限制条件
   */
  private extractLimitations(reflection: DeepReflection): string[] {
    const limitations: string[] = []

    if (reflection.record.duration > 60000) {
      limitations.push('执行时间较长')
    }

    if (reflection.record.steps.length > 10) {
      limitations.push('步骤较多，可能失败')
    }

    for (const fp of reflection.failurePoints) {
      if (fp.severity === 'critical') {
        limitations.push(`对${fp.errorType}错误敏感`)
      }
    }

    return limitations
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(goal: string): string {
    const goalLower = goal.toLowerCase()
    if (/打开|访问|navigate|open|visit/i.test(goalLower)) return 'navigation'
    if (/搜索|search|query/i.test(goalLower)) return 'search'
    if (/创建|新建|create/i.test(goalLower)) return 'file_operation'
    if (/删除|remove|delete/i.test(goalLower)) return 'deletion'
    if (/读取|查看|read|view/i.test(goalLower)) return 'reading'
    if (/执行|运行|run|execute/i.test(goalLower)) return 'execution'
    return 'general'
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryable(step: { success: boolean; error?: string }): boolean {
    if (step.success) return true
    if (!step.error) return false

    return /timeout|network|connection/i.test(step.error)
  }

  /**
   * 对根本原因分类
   */
  private categorizeRootCause(rootCause: string): RootCause['category'] {
    if (/权限|permission|denied/i.test(rootCause)) return 'permission'
    if (/网络|network|connection/i.test(rootCause)) return 'network'
    if (/资源|not found|不存在/i.test(rootCause)) return 'resource'
    if (/输入|invalid|input/i.test(rootCause)) return 'input'
    if (/状态|state|status/i.test(rootCause)) return 'state'
    return 'unknown'
  }

  /**
   * 生成预防措施
   */
  private generatePrevention(failurePoints: { errorType: string; recoverable: boolean }[]): string[] {
    const prevention: string[] = []

    for (const fp of failurePoints) {
      switch (fp.errorType) {
        case 'timeout_error':
          prevention.push('增加操作延迟或超时时间')
          prevention.push('检查网络连接稳定性')
          break
        case 'permission_error':
          prevention.push('使用shell命令替代受限工具')
          prevention.push('检查文件权限设置')
          break
        case 'resource_not_found':
          prevention.push('先确认资源路径是否正确')
          prevention.push('使用相对路径避免绝对路径问题')
          break
        case 'network_error':
          prevention.push('添加网络状态检查')
          prevention.push('实现重试机制')
          break
      }
    }

    return [...new Set(prevention)]
  }

  /**
   * 保存到磁盘
   */
  private async save(): Promise<void> {
    try {
      const data = {
        successPatterns: Array.from(this.successPatterns.values()),
        failurePatterns: Array.from(this.failurePatterns.values())
      }
      await writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      logger.error('[PatternLibrary] Save failed', error)
    }
  }
}

export const patternLibrary = PatternLibrary.getInstance()
