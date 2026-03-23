/**
 * 全局错误处理服务
 * 负责捕获、记录和显示应用中的错误
 */

// 错误级别枚举
export const ErrorLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal'
} as const;

// 错误类型枚举
export const ErrorType = {
  NETWORK: 'network',
  API: 'api',
  VALIDATION: 'validation',
  AUTH: 'auth',
  RUNTIME: 'runtime',
  UNKNOWN: 'unknown'
} as const;

export type ErrorLevelType = typeof ErrorLevel[keyof typeof ErrorLevel];
export type ErrorTypeType = typeof ErrorType[keyof typeof ErrorType];

/**
 * 错误信息接口
 */
export class AppError {
  message: string;
  type: ErrorTypeType;
  level: ErrorLevelType;
  code?: string;
  stack?: string;
  timestamp: string;
  context?: Record<string, unknown>;

  constructor(message: string, options: { type?: ErrorTypeType; level?: ErrorLevelType; code?: string; stack?: string; context?: Record<string, unknown> } = {}) {
    this.message = message;
    this.type = options.type || ErrorType.UNKNOWN;
    this.level = options.level || ErrorLevel.ERROR;
    this.code = options.code;
    this.stack = options.stack;
    this.timestamp = new Date().toISOString();
    this.context = options.context;
  }
}

/**
 * 全局错误处理器类
 */
export class ErrorHandler {
  private listeners: Array<(error: AppError) => void>;
  private maxErrors: number;
  private errors: AppError[];

  constructor() {
    this.listeners = [];
    this.maxErrors = 50;
    this.errors = [];
    
    // 自动注册全局错误监听
    if (typeof window !== 'undefined') {
      this.registerGlobalListeners();
    }
  }

  /**
   * 注册全局错误监听器
   */
  registerGlobalListeners(): void {
    // 捕获未处理的 JavaScript 错误
    window.addEventListener('error', (event) => {
      event.preventDefault();
      this.handleError(new AppError(
        event.message || '未知错误',
        {
          type: ErrorType.RUNTIME,
          level: ErrorLevel.FATAL,
          stack: event.error?.stack,
          context: {
            file: event.filename,
            line: event.lineno,
            column: event.colno
          }
        }
      ));
    });

    // 捕获未处理的 Promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      this.handleError(new AppError(
        event.reason?.message || 'Promise 被拒绝',
        {
          type: ErrorType.RUNTIME,
          level: ErrorLevel.ERROR,
          stack: event.reason?.stack,
          context: { reason: event.reason }
        }
      ));
    });
  }

  /**
   * 添加错误监听器
   */
  addListener(callback: (error: AppError) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * 处理错误
   */
  handleError(error: unknown): AppError {
    const appError = error instanceof AppError ? error : new AppError(
      String((error as Error)?.message || error),
      {
        type: ErrorType.RUNTIME,
        stack: (error as Error)?.stack
      }
    );

    // 存储错误（限制数量）
    this.errors.unshift(appError);
    if (this.errors.length > this.maxErrors) {
      this.errors.pop();
    }

    // 通知所有监听器
    this.listeners.forEach(listener => {
      try {
        listener(appError);
      } catch (e) {
        console.error('Error listener failed:', e);
      }
    });

    // 打印到控制台（开发环境）
    if (process.env.NODE_ENV === 'development') {
      this.logToConsole(appError);
    }

    return appError;
  }

  /**
   * 创建特定类型的错误
   */
  createNetworkError(message: string, statusCode?: number): AppError {
    return new AppError(message || '网络请求失败', {
      type: ErrorType.NETWORK,
      code: statusCode?.toString()
    });
  }

  createAPIError(message: string, endpoint: string): AppError {
    return new AppError(message || 'API 调用失败', {
      type: ErrorType.API,
      context: { endpoint }
    });
  }

  createAuthError(message: string): AppError {
    return new AppError(message || '认证失败', {
      type: ErrorType.AUTH,
      level: ErrorLevel.WARN
    });
  }

  createValidationError(message: string, field?: string): AppError {
    return new AppError(message || '验证失败', {
      type: ErrorType.VALIDATION,
      context: { field }
    });
  }

  /**
   * 获取最近的错误
   */
  getRecentErrors(limit: number = 10): AppError[] {
    return this.errors.slice(0, limit);
  }

  /**
   * 清除错误历史
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * 打印错误到控制台
   */
  logToConsole(error: AppError): void {
    const color = this.getLogLevelColor(error.level);
    console.log(`%c[${error.level.toUpperCase()}] ${error.type}: ${error.message}`, `color: ${color}`);
    
    if (error.stack) {
      console.log('%c' + error.stack, 'color: #999');
    }
    
    if (error.context) {
      console.log('%cContext:', 'color: #666', error.context);
    }
  }

  private getLogLevelColor(level: ErrorLevelType): string {
    const colors: Record<ErrorLevelType, string> = {
      [ErrorLevel.DEBUG]: '#666',
      [ErrorLevel.INFO]: '#3498db',
      [ErrorLevel.WARN]: '#f39c12',
      [ErrorLevel.ERROR]: '#e74c3c',
      [ErrorLevel.FATAL]: '#c0392b'
    };
    return colors[level] || '#666';
  }
}

// 创建单例实例
export const errorHandler = new ErrorHandler();
