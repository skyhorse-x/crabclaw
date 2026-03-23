/**
 * HTTP 服务器创建模块
 * 负责创建和配置 HTTP 服务器
 */

import { logger } from '../services/logger.service'
import http from 'node:http'
import type { ServerResponse } from 'node:http'

/**
 * 创建 HTTP 服务器
 */
export function createHttpServer(
  port: number,
  fetchHandler: (request: Request) => Promise<Response>
) {
  const server = http.createServer(async (req: any, res: any) => {
    try {
      // 将 Node.js 请求转换为 Web Request
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD'
          ? new Uint8Array(await readBody(req))
          : null
      })

      // 调用处理函数
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
  
  server.listen(port, () => {
    logger.info('HTTP server created', { port, url: `http://localhost:${port}`, hostname: 'localhost' })
  })
  
  return {
    url: `http://localhost:${port}`,
    stop: () => server.close()
  }
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status

  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })

  if (!response.body) {
    res.end()
    return
  }

  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.length > 0) {
        res.write(Buffer.from(value))
      }
    }
    res.end()
  } finally {
    reader.releaseLock()
  }
}

/**
 * 读取请求体
 */
async function readBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * 获取服务器信息
 */
export function getServerInfo(server: any) {
  return {
    hostname: server.hostname,
    port: server.port,
    url: `http://${server.hostname}:${server.port}`
  }
}
