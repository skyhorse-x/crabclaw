/**
 * 服务器主入口
 * 负责启动应用和处理请求路由
 */

import { logger } from '../services/logger.service'
import { createHttpServer } from './http'
import { bootstrap, gracefulShutdown } from './bootstrap'
import { handleApiRequest } from '../api/routes'
import { PATHS } from '../shared/constants'
import fs from 'fs'

const CORS_BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
}

// 反射请求的 Origin（不能用通配符 * 同时携带 credentials）
// Neutralino 打包后 webview origin 通常是 null 或 http://localhost
function getAllowOrigin(request: Request): string {
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return 'http://localhost'
  return origin
}

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', getAllowOrigin(request))
  for (const [key, value] of Object.entries(CORS_BASE_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/**
 * 创建 JSON 响应（不含 CORS，由 withCors 统一注入）
 */
export function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
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
      headers: {
        'Access-Control-Allow-Origin': getAllowOrigin(request),
        ...CORS_BASE_HEADERS,
      }
    })
  }

  try {
    logger.debug('Request received', { method, pathname })

    const apiResponse = await handleApiRequest(pathname, request)
    if (apiResponse) {
      return withCors(apiResponse, request)
    }

    logger.debug('Route not found', { method, pathname })
    return withCors(apiErrorResponse('Not found', 404), request)
  } catch (error) {
    logger.error('Request handler error', error, { method, pathname })
    return withCors(apiErrorResponse(error instanceof Error ? error.message : 'Internal error', 500), request)
  }
}

/**
 * 启动服务器
 */
let serverStarted = false
export let activeServer: { url: string; stop: () => void } | null = null

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
    activeServer = server

    // 优雅关闭
    if (typeof process !== 'undefined') {
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...')
        try {
          await gracefulShutdown()
        } catch (err) {
          logger.error('Graceful shutdown error', err)
        }
        server.stop()
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...')
        try {
          await gracefulShutdown()
        } catch (err) {
          logger.error('Graceful shutdown error', err)
        }
        server.stop()
        process.exit(0)
      })
    }

    logger.info('Server started successfully', {
      url: server.url
    })
    const actualUrl = server.url
    const actualPort = actualUrl.split(':')[2]
    console.log(`Desktop Agent Studio running at ${actualUrl}`)

    // 写入端口文件供 dev.mjs 脚本使用
    const portFile = PATHS.PORT_FILE
    try {
      fs.writeFileSync(portFile, actualPort, 'utf-8')
      console.log(`[dev] Port file written: ${portFile}`)
    } catch (err) {
      logger.warn('Failed to write port file', err)
    }

    // 保持事件循环活跃（Bun 下 node:http 服务器可能不 keep-alive）
    const keepAliveTimer = setInterval(() => {}, 30000)
  } catch (error) {
    serverStarted = false
    logger.error('Failed to start server', error)
    process.exit(1)
  }
}
