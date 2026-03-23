/**
 * 反思服务
 * 负责执行后复盘、错误分析和经验提取
 */

import { logger } from './logger.service'
import { getCacheService } from './cache.service'

export interface ExecutionRecord {
  taskId: string
  goal: string
  steps: {
    tool: string
    server: string
    success: boolean
    error?: string
    duration?: number
  }[]
  overallSuccess: boolean
  duration: number
  timestamp: number
}

export interface ReflectionResult {
  taskId: string
  summary: string
  errorPatterns: string[]
  suggestions: string[]
  learnedLessons: string[]
  shouldRetry: boolean
  improvedApproach?: string
}

const cache = getCacheService()

export class ReflectionService {
  private static instance: ReflectionService

  private constructor() {}

  static getInstance(): ReflectionService {
    if (!ReflectionService.instance) {
      ReflectionService.instance = new ReflectionService()
    }
    return ReflectionService.instance
  }

  /**
   * 反思执行记录
   */
  async reflect(record: ExecutionRecord): Promise<ReflectionResult> {
    const cacheKey = `reflection:${record.taskId}`

    const cached = await cache.get<ReflectionResult>(cacheKey)
    if (cached) {
      return cached
    }

    const errorPatterns = this.extractErrorPatterns(record)
    const suggestions = this.generateSuggestions(record, errorPatterns)
    const learnedLessons = this.extractLessons(record, errorPatterns)

    const result: ReflectionResult = {
      taskId: record.taskId,
      summary: this.generateSummary(record),
      errorPatterns,
      suggestions,
      learnedLessons,
      shouldRetry: this.shouldRetry(record),
      improvedApproach: suggestions.length > 0 ? suggestions[0] : undefined
    }

    await cache.set(cacheKey, result, { ttl: 24 * 60 * 60 * 1000 })

    logger.info('[Reflection] Task reflection completed', {
      taskId: record.taskId,
      success: record.overallSuccess,
      errorPatterns: errorPatterns.length,
      suggestions: suggestions.length
    })

    return result
  }

  /**
   * 提取错误模式
   */
  private extractErrorPatterns(record: ExecutionRecord): string[] {
    const patterns: string[] = []
    const failedSteps = record.steps.filter(s => !s.success)

    for (const step of failedSteps) {
      if (step.error) {
        if (step.error.includes('timeout')) {
          patterns.push('timeout_error')
        }
        if (step.error.includes('permission') || step.error.includes('denied')) {
          patterns.push('permission_error')
        }
        if (step.error.includes('not found') || step.error.includes('ENOENT')) {
          patterns.push('resource_not_found')
        }
        if (step.error.includes('network') || step.error.includes('fetch')) {
          patterns.push('network_error')
        }
        if (step.error.includes('invalid') || step.error.includes('schema')) {
          patterns.push('invalid_input')
        }
        if (step.error.includes('Access denied') || step.error.includes('outside allowed')) {
          patterns.push('path_access_error')
        }
      }
    }

    return [...new Set(patterns)]
  }

  /**
   * 生成建议
   */
  private generateSuggestions(record: ExecutionRecord, patterns: string[]): string[] {
    const suggestions: string[] = []

    for (const pattern of patterns) {
      switch (pattern) {
        case 'timeout_error':
          suggestions.push('增加操作延迟或超时时间')
          break
        case 'permission_error':
          suggestions.push('检查文件权限设置，使用 shell 命令替代 filesystem')
          break
        case 'resource_not_found':
          suggestions.push('先确认资源路径是否正确，再执行操作')
          break
        case 'network_error':
          suggestions.push('检查网络连接，或使用本地资源替代')
          break
        case 'path_access_error':
          suggestions.push('使用 $HOME/Desktop 获取桌面路径，避免绝对路径')
          break
        case 'invalid_input':
          suggestions.push('检查输入参数格式是否符合工具要求')
          break
      }
    }

    if (record.steps.length > 10) {
      suggestions.push('任务步骤过多，考虑简化流程或拆分任务')
    }

    return suggestions
  }

  /**
   * 提取经验教训
   */
  private extractLessons(record: ExecutionRecord, patterns: string[]): string[] {
    const lessons: string[] = []

    if (record.overallSuccess) {
      lessons.push(`成功完成：${record.goal.substring(0, 50)}`)
    } else {
      lessons.push(`失败任务：${record.goal.substring(0, 50)}`)
      for (const pattern of patterns) {
        lessons.push(`错误模式：${pattern}`)
      }
    }

    if (record.duration > 60000) {
      lessons.push('执行时间过长，可能需要优化步骤')
    }

    return lessons
  }

  /**
   * 生成总结
   */
  private generateSummary(record: ExecutionRecord): string {
    const successCount = record.steps.filter(s => s.success).length
    const totalCount = record.steps.length
    const successRate = Math.round((successCount / totalCount) * 100)

    return `执行${record.overallSuccess ? '成功' : '失败'}：` +
      `${successCount}/${totalCount}步骤成功` +
      `(${successRate}%)，` +
      `耗时${Math.round(record.duration / 1000)}秒`
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(record: ExecutionRecord): boolean {
    if (record.overallSuccess) {
      return false
    }

    const hasRetryableErrors = record.steps.some(s =>
      !s.success && (
        s.error?.includes('timeout') ||
        s.error?.includes('network') ||
        s.error?.includes('temporary')
      )
    )

    return hasRetryableErrors && record.steps.length < 5
  }

  /**
   * 获取历史反思
   */
  async getPastReflections(goal: string, limit: number = 5): Promise<ReflectionResult[]> {
    const stats = cache.getStats()
    const reflectionKeys = stats.keys
      .filter(k => k.startsWith('reflection:'))
      .slice(0, limit * 2)

    const results: ReflectionResult[] = []
    for (const key of reflectionKeys) {
      const result = await cache.get<ReflectionResult>(key)
      if (result && this.isRelevant(goal, result)) {
        results.push(result)
        if (results.length >= limit) {
          break
        }
      }
    }

    return results
  }

  /**
   * 判断是否相关
   */
  private isRelevant(goal: string, reflection: ReflectionResult): boolean {
    const goalLower = goal.toLowerCase()
    const summaryLower = reflection.summary.toLowerCase()
    const lessonsLower = reflection.learnedLessons.join(' ').toLowerCase()

    return goalLower.includes('web') && (summaryLower.includes('web') || lessonsLower.includes('web')) ||
      goalLower.includes('file') && (summaryLower.includes('file') || lessonsLower.includes('file')) ||
      goalLower.includes('search') && (summaryLower.includes('search') || lessonsLower.includes('search'))
  }
}

export const reflectionService = ReflectionService.getInstance()
