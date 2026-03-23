/**
 * 健康检查路由
 * 提供应用健康检查端点
 */

import { version } from '../../package.json'

const startTime = Date.now()

/**
 * 创建成功响应
 */
function successResponse<T>(data: T, message?: string): Response {
  return new Response(JSON.stringify({
    ok: true,
    message: message || 'success',
    data
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  })
}

/**
 * 处理健康检查请求
 */
export async function handleHealthCheck(pathname: string, request: Request): Promise<Response | null> {
  if ((pathname === '/health' || pathname === '/api/health') && request.method === 'GET') {
    const uptime = Date.now() - startTime
    
    return successResponse({
      status: 'ok',
      uptime,
      version,
      timestamp: new Date().toISOString()
    })
  }
  return null
}

/**
 * 处理状态检查请求
 */
export async function handleStatusCheck(pathname: string, request: Request): Promise<Response | null> {
  if ((pathname === '/status' || pathname === '/api/status') && request.method === 'GET') {
    return successResponse({
      status: 'healthy',
      uptime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    })
  }
  return null
}
