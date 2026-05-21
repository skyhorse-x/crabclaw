/**
 * API 请求拦截器
 * 统一处理请求错误、认证失败、重试等
 */

import { errorHandler } from './error-handler'
import { useApiBase } from '../composables/useApiBase'

const TIMEOUT = 30000 // 30 秒超时

const { apiBase } = useApiBase()

interface ApiClientOptions {
  timeout?: number
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: Record<string, unknown> | FormData
  headers?: Record<string, string>
  skipAuthCheck?: boolean
}

/**
 * 创建带超时的 fetch
 */
function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = TIMEOUT): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('请求中断')), timeout)
    )
  ])
}

/**
 * API 请求类
 */
export class ApiClient {
  private token: string | null
  private refreshTokenPromise: Promise<void> | null

  constructor(_options: ApiClientOptions = {}) {
    this.token = null
    this.refreshTokenPromise = null
  }

  /**
   * 设置认证 Token
   */
  setToken(token: string | null): void {
    this.token = token
  }

  /**
   * 清除 Token
   */
  clearToken(): void {
    this.token = null
  }

  /**
   * 构建完整 URL（实时读取 apiBase，与 useApiBase 保持同步）
   */
  buildURL(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint
    }
    return `${apiBase.value}${endpoint}`
  }

  /**
   * 构建请求头
   */
  buildHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    return headers
  }

  /**
   * 处理响应
   */
  async handleResponse(response: Response, endpoint: string): Promise<unknown> {
    // 处理 HTTP 错误状态
    if (!response.ok) {
      let errorData: Record<string, unknown> = {}
      try {
        errorData = await response.json()
      } catch {
        errorData = { error: response.statusText }
      }

      // 特殊处理 401 未授权
      if (response.status === 401) {
        return this.handleAuthError(endpoint)
      }

      // 特殊处理 403 权限不足
      if (response.status === 403) {
        throw errorHandler.handleError(
          errorHandler.createAPIError('权限不足', endpoint)
        )
      }

      // 特殊处理 404 不存在
      if (response.status === 404) {
        throw errorHandler.handleError(
          errorHandler.createAPIError('资源不存在', endpoint)
        )
      }

      // 其他错误
      throw errorHandler.handleError(
        errorHandler.createAPIError(String(errorData.error || '请求失败'), endpoint)
      )
    }

    // 解析 JSON 响应
    try {
      const data = await response.json()
      
      // 检查业务逻辑错误
      if (data.ok === false) {
        throw errorHandler.handleError(
          errorHandler.createAPIError(String(data.error || '请求失败'), endpoint)
        )
      }
      
      return data
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw errorHandler.handleError(
          errorHandler.createAPIError('响应格式错误', endpoint)
        )
      }
      throw error
    }
  }

  /**
   * 处理认证错误
   */
  private async handleAuthError(endpoint: string): Promise<unknown> {
    // 如果已经在刷新 Token，等待
    if (this.refreshTokenPromise) {
      await this.refreshTokenPromise
      // 重试原请求
      return this.request(endpoint, { skipAuthCheck: true })
    }

    // 开始刷新 Token
    this.refreshTokenPromise = this.refreshToken()
    
    try {
      await this.refreshTokenPromise
      // 重试原请求
      return this.request(endpoint, { skipAuthCheck: true })
    } catch (error) {
      // 刷新失败，跳转到登录页
      this.clearToken()
      window.location.href = '/login'
      throw error
    } finally {
      this.refreshTokenPromise = null
    }
  }

  /**
   * 刷新 Token
   */
  private async refreshToken(): Promise<void> {
    try {
      const response = await fetchWithTimeout(
        `${apiBase.value}/api/auth/refresh`,
        {
          method: 'POST',
          headers: this.buildHeaders()
        }
      )

      if (!response.ok) {
        throw new Error('Token 刷新失败')
      }

      const data = await response.json()
      if (data.ok && data.data?.token) {
        this.setToken(String(data.data.token))
        localStorage.setItem('auth_token', String(data.data.token))
      } else {
        throw new Error('Token 刷新失败')
      }
    } catch (error) {
      console.error('Failed to refresh token:', error)
      throw error
    }
  }

  /**
   * 通用请求方法
   */
  async request(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    const {
      method = 'GET',
      body,
      headers = {},
      skipAuthCheck = false
    } = options

    const url = this.buildURL(endpoint)
    const requestHeaders = this.buildHeaders(headers)

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      // 不携带 credentials：本地后端不需要跨域 cookie，且 credentials:'include' 与 CORS 通配符不兼容
    }

    // 设置请求体
    if (body) {
      if (body instanceof FormData) {
        fetchOptions.body = body
        delete (fetchOptions.headers as Record<string, string>)['Content-Type']
      } else {
        fetchOptions.body = JSON.stringify(body)
      }
    }

    try {
      const response = await fetchWithTimeout(url, fetchOptions)
      return await this.handleResponse(response, endpoint)
    } catch (error) {
      // 网络错误处理
      if ((error as Error).message === 'Failed to fetch' || (error as Error).message === '请求中断') {
        throw errorHandler.handleError(
          errorHandler.createAPIError('网络连接失败，请检查您的网络设置', endpoint)
        )
      }
      throw error
    }
  }

  /**
   * GET 请求
   */
  async get<T = unknown>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    return this.request(endpoint, { ...options, method: 'GET' }) as Promise<T>
  }

  /**
   * POST 请求
   */
  async post<T = unknown>(endpoint: string, data?: Record<string, unknown>, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request(endpoint, { ...options, method: 'POST', body: data }) as Promise<T>
  }

  /**
   * PUT 请求
   */
  async put<T = unknown>(endpoint: string, data?: Record<string, unknown>, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request(endpoint, { ...options, method: 'PUT', body: data }) as Promise<T>
  }

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    return this.request(endpoint, { ...options, method: 'DELETE' }) as Promise<T>
  }

  /**
   * PATCH 请求
   */
  async patch<T = unknown>(endpoint: string, data?: Record<string, unknown>, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request(endpoint, { ...options, method: 'PATCH', body: data }) as Promise<T>
  }
}

// 创建单例实例
export const apiClient = new ApiClient()
