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
      logger.error(`Port ${port} is already in use. Please stop the other process or change the port.`, {
        errCode: 'EADDRINUSE',
        port,
        error: err.message
      })
    } else {
      logger.error('HTTP server error', err)
    }
  })

  server.on('listening', () => {
    const actualPort = server.address()?.port || port
    logger.info('HTTP server created', { port: actualPort, url: `http://localhost:${actualPort}`, hostname: 'localhost' })

    if (!wsInitialized) {
      wsInitialized = true
      wsService.initializeWithServer(server, '/ws')
      registerWSChatHandler(wsService)
      logger.info('WebSocket service initialized on path: /ws')
    }
  })

  // 尝试监听，如果端口被占用则尝试下一个端口
  function tryListen(currentPort: number) {
    server.once('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        logger.warn(`Port ${currentPort} in use, trying port ${currentPort + 1}`)
        server.removeAllListeners('error')
        tryListen(currentPort + 1)
      }
    })
    server.listen(currentPort)
  }
  tryListen(port)

  // 获取实际监听的端口
  function getActualPort(): number {
    const addr = server.address()
    return addr ? (typeof addr === 'string' ? port : addr.port) : port
  }

  return {
    url: `http://localhost:${getActualPort()}`,
    stop: () => {
      wsService.close()
      server.close()
    }
  }
}

const MAX_BODY_SIZE = 10 * 1024 * 1024

async function readBody(req: any): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      chunks.push(chunk)
    })
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
