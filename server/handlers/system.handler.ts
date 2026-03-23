/**
 * 系统处理器
 * 处理系统相关的 HTTP 请求
 */

import { getBridgeService } from '../services/bridge.service'

/**
 * 创建 JSON 响应
 */
function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  })
}

/**
 * 创建成功响应
 */
function successResponse<T>(data: T, message?: string): Response {
  return json({
    ok: true,
    message: message || 'success',
    data
  })
}

/**
 * 创建错误响应
 */
function errorResponse(error: string, status: number = 400): Response {
  return json({
    ok: false,
    error
  }, status)
}

/**
 * 获取系统状态
 */
export async function getState() {
  try {
    const bridge = getBridgeService()
    if (!bridge.isConnected()) {
      await bridge.testConnection()
    }
    const result = await bridge.call('state', {})
    return successResponse(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return errorResponse(`获取系统状态失败：${errorMessage}`, 500)
  }
}
