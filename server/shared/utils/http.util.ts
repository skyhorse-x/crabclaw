/**
 * HTTP 响应工具
 */

/**
 * 创建成功响应
 */
export function successResponse<T>(data: T, message?: string): Response {
  return json({
    ok: true,
    message: message || 'success',
    data
  })
}

/**
 * 创建错误响应
 */
export function errorResponse(
  error: string,
  status: number = 400,
  data?: any
): Response {
  return json(
    {
      ok: false,
      error
    },
    status,
    data
  )
}

/**
 * 创建 JSON 响应
 */
export function json(data: any, status: number = 200, extraData?: any): Response {
  const body = extraData ? { ...data, ...extraData } : data
  
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  })
}

/**
 * 读取 JSON 请求体
 */
export async function readJsonBody(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * 创建 CORS 预检响应
 */
export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}

/**
 * 添加 CORS 头到响应
 */
export function withCors(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  newHeaders.set('Access-Control-Allow-Origin', '*')
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  })
}
