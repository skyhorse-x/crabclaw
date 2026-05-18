import { readJsonBody } from '../shared/utils'
import { getChatHistoryService } from '../services/chat-history.service'
import { logger } from '../services/logger.service'
import { getConfigService } from '../services/config.service'

export async function handleChatHistoryRoute(pathname: string, request: Request): Promise<Response | null> {
  const configService = getConfigService()
  const config = await configService.getConfig()
  const configuredUserDataDir = config.settings?.userDataDir
  const service = getChatHistoryService(configuredUserDataDir)

  if (pathname === '/api/chat-history/config' && request.method === 'GET') {
    try {
      return new Response(JSON.stringify({
        ok: true,
        data: service.getRuntimeConfig()
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[ChatHistory] Get config failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '读取聊天存储配置失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/chat-history/config' && (request.method === 'POST' || request.method === 'PUT')) {
    try {
      const body = await readJsonBody(request)
      const userDataDir = String(body?.userDataDir || '').trim()

      const nextConfig = {
        ...config,
        settings: {
          ...config.settings,
          userDataDir
        }
      }
      await configService.saveConfig(nextConfig as any)

      const refreshedService = getChatHistoryService(userDataDir)
      return new Response(JSON.stringify({
        ok: true,
        message: '聊天存储目录已更新',
        data: refreshedService.getRuntimeConfig()
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[ChatHistory] Save config failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '保存聊天存储配置失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/chat-history' && request.method === 'GET') {
    try {
      const conversations = service.loadAll()
      return new Response(JSON.stringify({
        ok: true,
        data: { conversations }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[ChatHistory] Load failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '读取聊天记录失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/chat-history' && (request.method === 'POST' || request.method === 'PUT')) {
    try {
      const body = await readJsonBody(request)
      const conversations = Array.isArray(body?.conversations) ? body.conversations : []
      service.saveAll(conversations)
      return new Response(JSON.stringify({
        ok: true,
        message: '聊天记录已保存'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[ChatHistory] Save failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '保存聊天记录失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/token-stats' && request.method === 'GET') {
    try {
      const stats = service.getTokenStats()
      return new Response(JSON.stringify({
        ok: true,
        data: stats
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[ChatHistory] Token stats failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '获取 Token 统计失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
