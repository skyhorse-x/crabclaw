/**
 * 错误恢复机制
 * 自动重试、降级策略、替代方案执行
 */

import { logger } from '../services/logger.service'
import '../shared/utils'

export enum ErrorSeverity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor'
}

export enum RecoveryAction {
  RETRY = 'retry',
  RETRY_WITH_DELAY = 'retry_with_delay',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  ABORT = 'abort',
  ESCALATE = 'escalate'
}

export interface RecoverableError {
  type: string
  message: string
  recoverable: boolean
  retryable: boolean
  severity: ErrorSeverity
  alternatives?: string[]
}

export interface RecoveryStrategy {
  id: string
  errorType: string
  maxRetries: number
  baseDelay: number
  maxDelay: number
  exponentialBackoff: boolean
  fallbackAction?: string
  onFailure?: RecoveryAction
}

export interface RecoveryResult {
  success: boolean
  action: RecoveryAction
  attempts: number
  totalDuration: number
  error?: string
  fallbackUsed?: boolean
  alternativeResult?: any
}

export interface RetryConfig {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  jitter: boolean
  exponentialBackoff: boolean
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  exponentialBackoff: true
}

export class ErrorRecoveryService {
  private static instance: ErrorRecoveryService
  private strategies: Map<string, RecoveryStrategy> = new Map()
  private retryHistory: Map<string, number> = new Map()

  private constructor() {
    this.initializeDefaultStrategies()
  }

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService()
    }
    return ErrorRecoveryService.instance
  }

  private initializeDefaultStrategies(): void {
    const defaultStrategies: RecoveryStrategy[] = [
      {
        id: 'timeout_strategy',
        errorType: 'timeout_error',
        maxRetries: 3,
        baseDelay: 2000,
        maxDelay: 30000,
        exponentialBackoff: true,
        fallbackAction: 'use_alternative_tool'
      },
      {
        id: 'network_strategy',
        errorType: 'network_error',
        maxRetries: 5,
        baseDelay: 1000,
        maxDelay: 60000,
        exponentialBackoff: true,
        fallbackAction: 'check_network_then_retry'
      },
      {
        id: 'permission_strategy',
        errorType: 'permission_error',
        maxRetries: 1,
        baseDelay: 500,
        maxDelay: 5000,
        exponentialBackoff: false,
        fallbackAction: 'use_shell_alternative'
      },
      {
        id: 'resource_not_found_strategy',
        errorType: 'resource_not_found',
        maxRetries: 2,
        baseDelay: 500,
        maxDelay: 5000,
        exponentialBackoff: false,
        fallbackAction: 'create_resource_first'
      },
      {
        id: 'browser_strategy',
        errorType: 'browser_error',
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 10000,
        exponentialBackoff: true,
        fallbackAction: 'restart_browser'
      },
      {
        id: 'path_access_strategy',
        errorType: 'path_access_error',
        maxRetries: 1,
        baseDelay: 500,
        maxDelay: 2000,
        exponentialBackoff: false,
        fallbackAction: 'use_relative_path'
      }
    ]

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.errorType, strategy)
    }
  }

  /**
   * 分类错误
   */
  classifyError(error: string | Error): RecoverableError {
    const message = error instanceof Error ? error.message : error
    const messageLower = message.toLowerCase()

    if (/timeout|timed?out/i.test(messageLower)) {
      return {
        type: 'timeout_error',
        message,
        recoverable: true,
        retryable: true,
        severity: ErrorSeverity.MAJOR,
        alternatives: ['增加超时时间', '使用更快的工具', '优化网络']
      }
    }

    if (/network|connection|refused|econnrefused/i.test(messageLower)) {
      return {
        type: 'network_error',
        message,
        recoverable: true,
        retryable: true,
        severity: ErrorSeverity.MAJOR,
        alternatives: ['检查网络连接', '使用本地资源', '添加重试']
      }
    }

    if (/permission|denied|unauthorized|eacces/i.test(messageLower)) {
      return {
        type: 'permission_error',
        message,
        recoverable: false,
        retryable: false,
        severity: ErrorSeverity.CRITICAL,
        alternatives: ['使用shell命令', '修改文件权限', '切换目录']
      }
    }

    if (/not found|enoent|no such file/i.test(messageLower)) {
      return {
        type: 'resource_not_found',
        message,
        recoverable: true,
        retryable: true,
        severity: ErrorSeverity.MAJOR,
        alternatives: ['创建资源', '使用相对路径', '检查路径']
      }
    }

    if (/chrome|browser|headless|already running/i.test(messageLower)) {
      return {
        type: 'browser_error',
        message,
        recoverable: true,
        retryable: true,
        severity: ErrorSeverity.MAJOR,
        alternatives: ['重启浏览器', '使用不同配置', '等待后重试']
      }
    }

    if (/access denied|outside allowed|sandbox/i.test(messageLower)) {
      return {
        type: 'path_access_error',
        message,
        recoverable: false,
        retryable: false,
        severity: ErrorSeverity.CRITICAL,
        alternatives: ['使用$HOME路径', '使用相对路径', '请求用户确认']
      }
    }

    if (/invalid|schema|type error/i.test(messageLower)) {
      return {
        type: 'invalid_input',
        message,
        recoverable: false,
        retryable: false,
        severity: ErrorSeverity.MAJOR,
        alternatives: ['检查参数格式', '查看工具文档', '简化输入']
      }
    }

    if (/rate limit|429|too many requests/i.test(messageLower)) {
      return {
        type: 'rate_limit',
        message,
        recoverable: true,
        retryable: true,
        severity: ErrorSeverity.MINOR,
        alternatives: ['等待后重试', '减少请求频率', '使用缓存']
      }
    }

    return {
      type: 'unknown_error',
      message,
      recoverable: false,
      retryable: false,
      severity: ErrorSeverity.MINOR,
      alternatives: ['查看详细错误', '尝试简化任务']
    }
  }

  /**
   * 获取恢复策略
   */
  getStrategy(errorType: string): RecoveryStrategy | null {
    return this.strategies.get(errorType) || null
  }

  /**
   * 注册自定义策略
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.errorType, strategy)
    logger.debug('[ErrorRecovery] Strategy registered', { errorType: strategy.errorType })
  }

  /**
   * 执行带恢复的操作
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    errorHandler?: (error: RecoverableError, attempt: number) => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<RecoveryResult & { result?: T }> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
    const startTime = Date.now()
    let attempts = 0
    let currentDelay = retryConfig.initialDelay

    while (attempts < retryConfig.maxAttempts) {
      attempts++

      try {
        const result = await operation()
        return {
          success: true,
          action: RecoveryAction.RETRY,
          attempts,
          totalDuration: Date.now() - startTime,
          result
        }
      } catch (error: any) {
        const classified = this.classifyError(error.message || String(error))

        if (!classified.retryable || attempts >= retryConfig.maxAttempts) {
          if (errorHandler) {
            try {
              const fallbackResult = await errorHandler(classified, attempts)
              return {
                success: true,
                action: RecoveryAction.FALLBACK,
                attempts,
                totalDuration: Date.now() - startTime,
                fallbackUsed: true,
                alternativeResult: fallbackResult
              }
            } catch (fallbackError: any) {
              return {
                success: false,
                action: RecoveryAction.ABORT,
                attempts,
                totalDuration: Date.now() - startTime,
                error: fallbackError.message
              }
            }
          }

          return {
            success: false,
            action: RecoveryAction.ABORT,
            attempts,
            totalDuration: Date.now() - startTime,
            error: classified.message
          }
        }

        const strategy = this.getStrategy(classified.type)
        if (strategy && attempts < strategy.maxRetries) {
          const delay = strategy.exponentialBackoff
            ? Math.min(currentDelay, strategy.maxDelay)
            : strategy.baseDelay

          logger.info('[ErrorRecovery] Retrying after error', {
            attempt: attempts,
            delay,
            errorType: classified.type
          })

          await this.sleep(delay)

          if (retryConfig.exponentialBackoff) {
            currentDelay = Math.min(
              currentDelay * retryConfig.backoffMultiplier,
              retryConfig.maxDelay
            )
          }

          if (retryConfig.jitter) {
            currentDelay += Math.random() * 500
          }
        }
      }
    }

    return {
      success: false,
      action: RecoveryAction.ABORT,
      attempts,
      totalDuration: Date.now() - startTime,
      error: 'Max retries exceeded'
    }
  }

  /**
   * 执行带降级的操作
   */
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    fallbackCondition?: (error: any) => boolean
  ): Promise<{ success: boolean; result?: T; fallbackUsed: boolean; error?: string }> {
    try {
      const result = await primary()
      return { success: true, result, fallbackUsed: false }
    } catch (error: any) {
      if (fallbackCondition && !fallbackCondition(error)) {
        return { success: false, fallbackUsed: false, error: error.message }
      }

      try {
        logger.info('[ErrorRecovery] Falling back to alternative', {
          error: error.message.substring(0, 50)
        })
        const result = await fallback()
        return { success: true, result, fallbackUsed: true }
      } catch (fallbackError: any) {
        return {
          success: false,
          fallbackUsed: true,
          error: fallbackError.message
        }
      }
    }
  }

  /**
   * 批量执行带错误恢复
   */
  async executeBatchWithRecovery<T>(
    operations: Array<{
      id: string
      operation: () => Promise<T>
    }>,
    options: {
      stopOnError?: boolean
      maxConcurrency?: number
      errorHandler?: (error: any, id: string) => Promise<T>
    } = {}
  ): Promise<{
    results: Array<{ id: string; success: boolean; result?: T; error?: string }>
    successCount: number
    failureCount: number
    totalDuration: number
  }> {
    const { stopOnError = false, maxConcurrency: _, errorHandler } = options
    const startTime = Date.now()
    const results: Array<{ id: string; success: boolean; result?: T; error?: string }> = []
    let successCount = 0
    let failureCount = 0

    for (const op of operations) {
      if (stopOnError && failureCount > 0) {
        results.push({ id: op.id, success: false, error: 'Stopped due to previous error' })
        failureCount++
        continue
      }

      try {
        const result = await this.executeWithRecovery(op.operation, errorHandler ? (e) => errorHandler(e, op.id) : undefined)
        results.push({
          id: op.id,
          success: result.success,
          result: result.result,
          error: result.error
        })
        if (result.success) successCount++
        else failureCount++
      } catch (error: any) {
        results.push({ id: op.id, success: false, error: error.message })
        failureCount++
      }
    }

    return {
      results,
      successCount,
      failureCount,
      totalDuration: Date.now() - startTime
    }
  }

  /**
   * 获取错误统计
   */
  getErrorStats(_errorType?: string): {
    totalRetries: number
    retryCountByType: Record<string, number>
    recentErrors: Array<{ type: string; message: string; timestamp: number }>
  } {
    const retryCountByType: Record<string, number> = {}
    let totalRetries = 0

    for (const [type, count] of this.retryHistory.entries()) {
      retryCountByType[type] = count
      totalRetries += count
    }

    return {
      totalRetries,
      retryCountByType,
      recentErrors: []
    }
  }

  /**
   * 重置错误统计
   */
  resetStats(): void {
    this.retryHistory.clear()
    logger.info('[ErrorRecovery] Stats reset')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const errorRecoveryService = ErrorRecoveryService.getInstance()
