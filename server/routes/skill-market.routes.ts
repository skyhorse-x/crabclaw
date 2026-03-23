/**
 * Skill Market 路由
 * 处理技能市场相关的 HTTP 路由
 */

import { readJsonBody } from '../shared/utils'
import { logger } from '../services/logger.service'
import { getConfigService } from '../services/config.service'
import { getSkillMarketService } from '../services/skill-market.service'
import type { SkillCategory } from '../shared/types'

const configService = getConfigService()

function toSkillCategory(input: string): SkillCategory {
  const normalized = String(input || '').toLowerCase()
  if (normalized.includes('desktop')) return 'desktop'
  if (normalized.includes('emulator')) return 'emulator'
  return 'browser'
}

/**
 * 处理 Skill Market 路由请求
 */
export async function handleSkillMarketRoute(pathname: string, request: Request) {
  const appConfig = await configService.getConfig()
  const service = getSkillMarketService(appConfig.settings?.userDataDir)

  // POST /api/skill-market/refresh - 手动刷新远程技能市场
  if (pathname === '/api/skill-market/refresh' && request.method === 'POST') {
    try {
      await service.refreshIfNeeded(true)
      const meta = service.getMeta()
      return new Response(JSON.stringify({
        ok: true,
        message: '技能市场已刷新',
        data: { meta }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[SkillMarket] Force refresh failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `刷新失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // GET /api/skill-market - 获取技能列表
  if (pathname === '/api/skill-market' && request.method === 'GET') {
    try {
      const url = new URL(request.url)
      const page = parseInt(url.searchParams.get('page') || '1')
      const pageSize = parseInt(url.searchParams.get('pageSize') || '10')

      await service.refreshIfNeeded()
      const marketResult = service.listSkills(page, pageSize)
      const meta = service.getMeta()
      const installedIds = new Set(appConfig.skills.map((s) => s.id))
      const skillsWithInstalled = marketResult.skills.map((skill) => ({
        ...skill,
        installed: installedIds.has(skill.id)
      }))

      logger.info('[SkillMarket] Skills retrieved', {
        total: marketResult.total,
        page: marketResult.page,
        pageSize: marketResult.pageSize
      })

      return new Response(JSON.stringify({
        ok: true,
        message: 'success',
        skills: skillsWithInstalled,
        pagination: {
          total: marketResult.total,
          page: marketResult.page,
          pageSize: marketResult.pageSize,
          totalPages: Math.ceil(marketResult.total / marketResult.pageSize),
          hasMore: marketResult.page * marketResult.pageSize < marketResult.total
        },
        data: {
          skills: skillsWithInstalled,
          pagination: {
            total: marketResult.total,
            page: marketResult.page,
            pageSize: marketResult.pageSize,
            totalPages: Math.ceil(marketResult.total / marketResult.pageSize),
            hasMore: marketResult.page * marketResult.pageSize < marketResult.total
          },
          meta
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[SkillMarket] Get skills failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `获取技能市场失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }
  
  // GET /api/skill-market/:id - 获取单个技能详情
  if (pathname.startsWith('/api/skill-market/') && request.method === 'GET') {
    try {
      const skillId = pathname.split('/')[3]
      await service.refreshIfNeeded()
      const skill = service.getSkill(skillId)
      
      if (!skill) {
        return new Response(JSON.stringify({
          ok: false,
          error: '技能不存在'
        }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        })
      }
      
      logger.info('[SkillMarket] Skill detail retrieved', { skillId })
      
      return new Response(JSON.stringify({
        ok: true,
        skill,
        data: { skill }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[SkillMarket] Get skill detail failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `获取技能详情失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/skill-market/install
  if (pathname === '/api/skill-market/install' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const id = body?.id

      if (!id) {
        return new Response(JSON.stringify({
          ok: false,
          error: '缺少技能 id'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      await service.refreshIfNeeded()
      let skill = service.getSkill(id)
      if (!skill) {
        await service.refreshIfNeeded(true)
        skill = service.getSkill(id)
      }
      if (!skill) {
        return new Response(JSON.stringify({
          ok: false,
          error: '技能不存在'
        }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        })
      }

      const config = await configService.getConfig()
      const exists = config.skills.some((s) => s.id === id)
      if (!exists) {
        config.skills.push({
          id: skill.id,
          name: skill.name,
          category: toSkillCategory(skill.category || 'browser'),
          description: skill.description,
          tags: skill.tags,
          triggerPhrases: [],
          delayMs: 500,
          steps: (Array.isArray(skill.steps) ? skill.steps : []) as any
        })
        await configService.saveConfig(config)
      }

      return new Response(JSON.stringify({
        ok: true,
        message: '技能已安装'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[SkillMarket] Install skill failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `安装失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/skill-market/uninstall
  if (pathname === '/api/skill-market/uninstall' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const id = body?.id

      if (!id) {
        return new Response(JSON.stringify({
          ok: false,
          error: '缺少技能 id'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      const config = await configService.getConfig()
      const index = config.skills.findIndex(s => s.id === id)
      if (index !== -1) {
        config.skills.splice(index, 1)
        await configService.saveConfig(config)
      }

      return new Response(JSON.stringify({
        ok: true,
        message: '技能已卸载'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[SkillMarket] Uninstall skill failed', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return new Response(JSON.stringify({
        ok: false,
        error: `卸载失败：${errorMessage}`
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
