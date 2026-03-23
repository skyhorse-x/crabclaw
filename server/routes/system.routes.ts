/**
 * 系统路由
 * 处理所有系统相关的 API 请求
 */

import * as systemHandler from '../handlers/system.handler'

/**
 * 处理系统路由请求
 */
export async function handleSystemRoute(pathname: string, request: Request) {
  const method = request.method

  // GET /api/system/state - 获取系统状态
  if (pathname === '/api/system/state' && method === 'GET') {
    return await systemHandler.getState()
  }

  // 不是系统路由
  return null
}
