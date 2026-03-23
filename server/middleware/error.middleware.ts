/**
 * 统一错误处理
 */

/**
 * 应用错误基类
 */
export class AppError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details?: any

  constructor(
    message: string,
    options: {
      code?: string
      status?: number
      details?: any
    } = {}
  ) {
    super(message)
    this.name = 'AppError'
    this.code = options.code || 'INTERNAL_ERROR'
    this.status = options.status || 500
    this.details = options.details
    
    // 捕获堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  toJSON() {
    return {
      ok: false,
      error: this.message,
      code: this.code,
      status: this.status,
      details: this.details
    }
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, {
      code: 'VALIDATION_ERROR',
      status: 400,
      details
    })
    this.name = 'ValidationError'
  }
}

/**
 * 未找到错误
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, {
      code: 'NOT_FOUND',
      status: 404
    })
    this.name = 'NotFoundError'
  }
}

/**
 * 未授权错误
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, {
      code: 'UNAUTHORIZED',
      status: 401
    })
    this.name = 'UnauthorizedError'
  }
}

/**
 * 禁止访问错误
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, {
      code: 'FORBIDDEN',
      status: 403
    })
    this.name = 'ForbiddenError'
  }
}

/**
 * 冲突错误
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, {
      code: 'CONFLICT',
      status: 409,
      details
    })
    this.name = 'ConflictError'
  }
}

/**
 * 限流错误
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, {
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429
    })
    this.name = 'RateLimitError'
  }
}

/**
 * 服务不可用错误
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable') {
    super(message, {
      code: 'SERVICE_UNAVAILABLE',
      status: 503
    })
    this.name = 'ServiceUnavailableError'
  }
}

/**
 * MCP 相关错误
 */
export class McpError extends AppError {
  constructor(message: string, public readonly serverId?: string) {
    super(message, {
      code: 'MCP_ERROR',
      status: 502,
      details: { serverId }
    })
    this.name = 'McpError'
  }
}

/**
 * 技能执行错误
 */
export class SkillExecutionError extends AppError {
  constructor(
    message: string,
    public readonly skillId?: string,
    public readonly step?: any
  ) {
    super(message, {
      code: 'SKILL_EXECUTION_ERROR',
      status: 500,
      details: { skillId, step }
    })
    this.name = 'SkillExecutionError'
  }
}

/**
 * 错误处理工具函数
 */

/**
 * 判断是否为 AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * 将错误转换为 ApiResponse
 */
export function errorToResponse(error: unknown) {
  if (isAppError(error)) {
    return error.toJSON()
  }
  
  if (error instanceof Error) {
    return {
      ok: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
      status: 500
    }
  }
  
  return {
    ok: false,
    error: String(error),
    code: 'UNKNOWN_ERROR',
    status: 500
  }
}

/**
 * 安全的异步操作包装器
 * 返回 [error, data] 元组
 */
export async function safeAsync<T>(
  promise: Promise<T>
): Promise<[null, T] | [Error, null]> {
  try {
    const data = await promise
    return [null, data]
  } catch (error) {
    return [error instanceof Error ? error : new Error(String(error)), null]
  }
}

/**
 * 创建错误工厂
 */
export function createErrorFactory(
  baseCode: string,
  baseStatus: number
) {
  return function createError(
    message: string,
    details?: any
  ): AppError {
    return new AppError(message, {
      code: baseCode,
      status: baseStatus,
      details
    })
  }
}
