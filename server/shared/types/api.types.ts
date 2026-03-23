/**
 * API 响应类型定义
 */

/**
 * API 响应
 */
export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  error?: string
  message?: string
  details?: any
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  ok: boolean
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}
