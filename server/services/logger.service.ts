/**
 * 日志服务
 * 提供统一的日志记录功能
 */

import { appendFile, mkdir } from 'node:fs/promises'
import * as path from 'node:path'
import { PATHS } from '../shared/constants'

/**
 * 日志级别
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: any
  context?: {
    module?: string
    function?: string
    [key: string]: any
  }
}

/**
 * 日志服务类
 */
export class Logger {
  private logFilePath: string
  private enableConsole: boolean
  private minLevel: LogLevel
  private levelPriority: Record<LogLevel, number>

  constructor(options: {
    logFilePath?: string
    enableConsole?: boolean
    minLevel?: LogLevel
  } = {}) {
    this.logFilePath = options.logFilePath || PATHS.SERVER_LOG
    this.enableConsole = options.enableConsole ?? true
    this.minLevel = options.minLevel || 'INFO'
    
    this.levelPriority = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    }
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDir(): Promise<void> {
    const logDir = path.dirname(this.logFilePath)
    try {
      await mkdir(logDir, { recursive: true })
    } catch {
      // 忽略目录创建错误
    }
  }

  /**
   * 检查日志级别是否应该记录
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel]
  }

  /**
   * 格式化日志消息
   */
  private formatLog(entry: LogEntry): string {
    const { timestamp, level, message, data, context } = entry
    
    let logLine = `[${timestamp}] [${level}] ${message}`
    
    if (context) {
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
      if (contextStr) {
        logLine += ` ${contextStr}`
      }
    }
    
    if (data !== undefined) {
      try {
        const dataStr = typeof data === 'object' 
          ? JSON.stringify(data) 
          : String(data)
        logLine += ` ${dataStr}`
      } catch {
        logLine += ` [Circular or unserializable data]`
      }
    }
    
    return logLine
  }

  /**
   * 写入日志
   */
  private async writeLog(entry: LogEntry): Promise<void> {
    if (!this.shouldLog(entry.level)) {
      return
    }

    const logLine = this.formatLog(entry) + '\n'

    // 写入文件
    try {
      await this.ensureLogDir()
      await appendFile(this.logFilePath, logLine, 'utf8')
    } catch (error) {
      // 文件写入失败时，至少输出到控制台
      if (this.enableConsole) {
        console.error('[Logger] Failed to write log file:', error)
      }
    }

    // 输出到控制台
    if (this.enableConsole) {
      switch (entry.level) {
        case 'ERROR':
          console.error(logLine.trim())
          break
        case 'WARN':
          console.warn(logLine.trim())
          break
        default:
          console.log(logLine.trim())
      }
    }
  }

  /**
   * 创建日志条目
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: any,
    context?: LogEntry['context']
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context
    }
  }

  /**
   * 调试日志
   */
  async debug(message: string, data?: any, context?: LogEntry['context']): Promise<void> {
    await this.writeLog(this.createLogEntry('DEBUG', message, data, context))
  }

  /**
   * 信息日志
   */
  async info(message: string, data?: any, context?: LogEntry['context']): Promise<void> {
    await this.writeLog(this.createLogEntry('INFO', message, data, context))
  }

  /**
   * 警告日志
   */
  async warn(message: string, data?: any, context?: LogEntry['context']): Promise<void> {
    await this.writeLog(this.createLogEntry('WARN', message, data, context))
  }

  /**
   * 错误日志
   */
  async error(message: string, error?: Error | any, context?: LogEntry['context']): Promise<void> {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error
    
    await this.writeLog(this.createLogEntry('ERROR', message, errorData, context))
  }

  /**
   * HTTP 请求日志
   */
  async http(
    method: string,
    url: string,
    status: number,
    duration: number,
    context?: LogEntry['context']
  ): Promise<void> {
    const message = `${method} ${url} ${status} ${duration}ms`
    await this.info(message, undefined, {
      ...context,
      method,
      url,
      status,
      duration
    })
  }

  /**
   * 性能日志
   */
  async performance(
    operation: string,
    duration: number,
    threshold: number = 1000
  ): Promise<void> {
    const level = duration > threshold ? 'WARN' : 'DEBUG'
    const message = `${operation} completed in ${duration}ms`
    
    await this.writeLog(this.createLogEntry(
      level,
      message,
      undefined,
      { operation, duration, threshold }
    ))
  }

  /**
   * 开始性能追踪
   * 返回结束函数
   */
  startPerformance(operation: string): () => Promise<void> {
    const startTime = Date.now()
    
    return async () => {
      const duration = Date.now() - startTime
      await this.performance(operation, duration)
    }
  }
}

/**
 * 创建默认日志实例
 */
export const logger = new Logger({
  enableConsole: true,
  minLevel: process.env.LOG_LEVEL as LogLevel || 'INFO'
})

/**
 * 创建带上下文的日志器
 */
export function createLogger(context: LogEntry['context']): Logger {
  return new Proxy(logger, {
    get(target, prop: keyof Logger) {
      const original = target[prop]
      
      if (typeof original === 'function') {
        return async (...args: any[]) => {
          const lastArg = args[args.length - 1]
          if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
            lastArg.context = { ...context, ...lastArg.context }
          } else {
            args.push({ context })
          }
          
          return (original as any).apply(target, args)
        }
      }
      
      return original
    }
  })
}
