/**
 * HTTP 服务器创建模块
 * 负责创建和配置 HTTP 服务器
 */

import { logger } from '../services/logger.service'
import http from 'node:http'
import type { ServerResponse } from 'node:http'
import { wsService } from '../services/websocket.service'
import { registerWSChatHandler } from '../handlers/chat.handler'

let wsInitialized = false

export function createHttpServer(
  port: number,
  fetchHandler: (request: Request) => Promise<Response>
) {
  const server = http.createServer(async (req: any, res: any) => {
    // 检查是否是 WebSocket 升级请求，如果是，不处理，让 upgrade 事件处理器处理
    if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
      return
    }

    try {
      const chunks = req.method !== 'GET' && req.method !== 'HEAD'
        ? await readBody(req)
        : null
      const bodyBuffer = chunks && chunks.length > 0 ? Buffer.concat(chunks) : null

      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: bodyBuffer
      })

      const response = await fetchHandler(request)
      await writeWebResponse(response, res)
    } catch (error) {
      logger.error('HTTP request handling failed', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
      }
      res.end(JSON.stringify({ ok: false, error: 'Internal server error' }))
    }
  })

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Cannot start server.`, {
        errCode: 'EADDRINUSE',
        port,
        error: err.message
      })
      process.exit(1)
    }
    logger.error('HTTP server error', err)
  })

  server.on('listening', () => {
    logger.info('HTTP server created', { port, url: `http://localhost:${port}`, hostname: 'localhost' })

    if (!wsInitialized) {
      wsInitialized = true
      wsService.initializeWithServer(server, '/ws')
      registerWSChatHandler(wsService)
      logger.info('WebSocket service initialized on path: /ws')
    }
  })

  server.listen(port)

  return {
    url: `http://localhost:${port}`,
    stop: () => {
      wsService.close()
      server.close()
    }
  }
}

async function readBody(req: any): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(chunks))
    req.on('error', reject)
  })
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } else {
    res.end()
  }
}
