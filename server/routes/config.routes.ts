/**
 * Config 路由
 * 处理配置相关的 HTTP 路由
 */

import { getConfigService } from '../services/config.service'
import { logger } from '../services/logger.service'

/**
 * 读取 JSON 请求体
 */
async function readJsonBody(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const configService = getConfigService()

/**
 * 处理 Config 路由请求
 */
export async function handleConfigRoute(pathname: string, request: Request) {
  // GET /api/config
  if (pathname === '/api/config' && request.method === 'GET') {
    try {
      const config = await configService.getConfig()
      return new Response(JSON.stringify({
        ok: true,
        message: 'success',
        data: {
          ...config,
          config
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('Get config failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: errorMessage
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST/PUT /api/config
  if (pathname === '/api/config' && (request.method === 'POST' || request.method === 'PUT')) {
    try {
      const body = await readJsonBody(request)
      if (!body || typeof body !== 'object') {
        return new Response(JSON.stringify({
          ok: false,
          error: '请求体必须是合法 JSON 对象'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }
      const hasKnownKey = ['settings', 'models', 'skills', 'tasks'].some((key) => key in body)
      if (!hasKnownKey) {
        return new Response(JSON.stringify({
          ok: false,
          error: '配置格式无效，缺少有效字段'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      const current = await configService.getConfig()
      const mergedConfig = {
        ...current,
        ...body,
        settings: {
          ...current.settings,
          ...(body.settings || {})
        },
        models: Array.isArray(body.models) ? body.models : current.models,
        skills: Array.isArray(body.skills) ? body.skills : current.skills,
        tasks: Array.isArray(body.tasks) ? body.tasks : current.tasks
      }

      await configService.saveConfig(mergedConfig)
      const config = await configService.getConfig()
      return new Response(JSON.stringify({
        ok: true,
        message: '配置已保存',
        data: {
          ...config,
          config
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('Save config failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: errorMessage
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // PUT /api/config/settings
  if (pathname === '/api/config/settings' && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request)
      if (!body || typeof body !== 'object') {
        return new Response(JSON.stringify({
          ok: false,
          error: '请求体必须是合法 JSON 对象'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      const current = await configService.getConfig()
      const nextConfig = {
        ...current,
        settings: {
          ...current.settings,
          ...body
        }
      }

      await configService.saveConfig(nextConfig)
      const config = await configService.getConfig()

      return new Response(JSON.stringify({
        ok: true,
        message: '配置已保存',
        data: {
          ...config,
          config
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('Save settings failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: errorMessage
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
