/**
 * Bridge 路由
 * 处理与 Neutralinojs 桌面端通信的 HTTP 路由
 */

import { readJsonBody } from '../shared/utils'
import { logger } from '../services/logger.service'
import { getBridgeService } from '../services/bridge.service'

export async function handleBridgeRoute(pathname: string, request: Request) {
  const bridge = getBridgeService()

  // GET /api/bridge/ping
  if (pathname === '/api/bridge/ping' && request.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      message: 'Bridge service is running',
      timestamp: Date.now()
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  // GET /api/bridge/mouse/position
  if (pathname === '/api/bridge/mouse/position' && request.method === 'GET') {
    const result = await bridge.getMousePosition()
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  // POST /api/bridge/mouse/move
  if (pathname === '/api/bridge/mouse/move' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const result = await bridge.moveMouse(body?.x || 0, body?.y || 0)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  // POST /api/bridge/mouse/click
  if (pathname === '/api/bridge/mouse/click' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const result = await bridge.click(body?.button || 'left')
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  // POST /api/bridge/screen/capture
  if (pathname === '/api/bridge/screen/capture' && request.method === 'POST') {
    const result = await bridge.captureScreenshot()
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  // POST /api/bridge/keyboard/type
  if (pathname === '/api/bridge/keyboard/type' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const result = await bridge.typeText(body?.text || '')
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  // POST /api/bridge/call - 通用调用接口
  if (pathname === '/api/bridge/call' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const { command, payload } = body
      
      logger.info('[Bridge] Calling command', { command, payload })
      const result = await bridge.call(command, payload)
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[Bridge] Command failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Bridge 调用失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
