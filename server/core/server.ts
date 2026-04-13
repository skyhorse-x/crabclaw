/**
 * 服务器主入口
 * 负责启动应用和处理请求路由
 */

import { logger } from '../services/logger.service'
import { createHttpServer } from './http'
import { bootstrap, gracefulShutdown } from './bootstrap'
import { handleApiRequest } from '../api/routes'

const isDev = process.env.NODE_ENV !== 'production'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

if (isDev) {
  CORS_HEADERS['Access-Control-Allow-Origin'] = '*'
} else {
  CORS_HEADERS['Access-Control-Allow-Origin'] = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/**
 * 创建 JSON 响应
 */
export function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  })
}

/**
 * 创建成功响应
 */
export function successResponse<T>(data: T, message = 'success'): Response {
  return json({ ok: true, message, data }, 200)
}

/**
 * 创建错误响应
 */
export function apiErrorResponse(error: string, status = 400): Response {
  return json({ ok: false, error }, status)
}

/**
 * 主请求处理器
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname
  const method = request.method

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    })
  }

  try {
    logger.debug('Request received', { method, pathname })

    // 尝试使用 API 路由处理器
    const apiResponse = await handleApiRequest(pathname, request)
    if (apiResponse) {
      return withCors(apiResponse)
    }

    // 404
    logger.debug('Route not found', { method, pathname })
    return withCors(apiErrorResponse('Not found', 404))
  } catch (error) {
    logger.error('Request handler error', error, { method, pathname })
    return withCors(apiErrorResponse(error instanceof Error ? error.message : 'Internal error', 500))
  }
}

/**
 * 启动服务器
 */
let serverStarted = false

export async function startServer() {
  if (serverStarted) {
    logger.warn('startServer called more than once, skipping duplicate startup')
    return
  }

  serverStarted = true

  try {
    // 引导启动
    const { config } = await bootstrap()

    // 创建 HTTP 服务器
    const server = createHttpServer(config.settings.backendPort, handleRequest)

    // 优雅关闭
    if (typeof process !== 'undefined') {
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...')
        await gracefulShutdown()
        server.stop()
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...')
        await gracefulShutdown()
        server.stop()
        process.exit(0)
      })
    }

    logger.info('Server started successfully', {
      url: `http://localhost:${config.settings.backendPort}`
    })
    console.log(`🚀 Desktop Agent Studio running at http://localhost:${config.settings.backendPort}`) // 保留这个用于启动提示
  } catch (error) {
    serverStarted = false
    logger.error('Failed to start server', error)
    process.exit(1)
  }
}
