/**
 * Chat 路由
 * 处理聊天相关的 HTTP 路由
 */

import { handleChatStream } from '../handlers/chat.handler'
import { readJsonBody } from '../shared/utils'
import { logger } from '../services/logger.service'

/**
 * 处理 Chat 路由请求
 */
export async function handleChatRoute(pathname: string, request: Request) {
  // POST /api/chat
  if (pathname === '/api/chat' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const message = body?.message
    const conversationHistory = body?.conversationHistory
    const selectedSkillId = body?.selectedSkillId
    const model = body?.model
    const executionMode = body?.executionMode
    const promptInstruction = body?.promptInstruction
    const allowedMcpServers = Array.isArray(body?.allowedMcpServers) ? body.allowedMcpServers : undefined
    logger.info('[Chat Route] Received request', { message, historyLength: conversationHistory?.length || 0 })
    
    if (!message) {
      return new Response(JSON.stringify({
        ok: false,
        error: '缺少 message 参数'
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }

    logger.info('[Chat Route] Calling handleChatStream', { message })
    
    // 使用流式响应
    const stream = new ReadableStream({
      async start(streamWriter) {
        const encoder = new TextEncoder()
        
        try {
          for await (const chunk of handleChatStream(message, { selectedSkillId, model, executionMode, promptInstruction, allowedMcpServers }, conversationHistory)) {
            streamWriter.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          }
        } catch (error) {
          logger.error('[Chat Route] Stream error', error)
          streamWriter.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`))
        } finally {
          streamWriter.close()
        }
      }
    })
    
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no'
      }
    })
  }

  return null
}
