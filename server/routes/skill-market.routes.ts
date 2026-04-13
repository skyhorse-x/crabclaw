/**
 * Skill Market 路由
 * 处理技能市场相关的 HTTP 路由
 */

import { readJsonBody } from '../shared/utils'
import { logger } from '../services/logger.service'
import { getConfigService } from '../services/config.service'
import { getSkillMarketService } from '../services/skill-market.service'
import { skillRegistry } from '../skills/skill-registry'
import type { SkillCategory } from '../shared/types'

const configService = getConfigService()
const JSON_HEADERS = { 'content-type': 'application/json' }

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function errorResponse(error: string, status = 500) {
  return jsonResponse({ ok: false, error }, status)
}

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
      return jsonResponse({ ok: true, message: '技能市场已刷新', data: { meta } })
    } catch (error) {
      logger.error('[SkillMarket] Force refresh failed', error)
      return errorResponse(`刷新失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // GET /api/skill-market - 获取技能列表
  if (pathname === '/api/skill-market' && request.method === 'GET') {
    try {
      const url = new URL(request.url)
      const page = parseInt(url.searchParams.get('page') || '1')
      const pageSize = parseInt(url.searchParams.get('pageSize') || '10')

      await service.refreshIfNeeded()
      let marketResult = service.listSkills(page, pageSize)
      const meta = service.getMeta()

      if (marketResult.total === 0) {
        logger.info('[SkillMarket] Remote market empty, loading local skills')
        const localSkills = skillRegistry.listSkills()
        const installedIds = new Set(appConfig.skills.map((s) => s.id))
        const localSkillsWithInstalled = localSkills.map(skill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          author: 'local',
          downloads: 0,
          rating: 0,
          tags: [],
          stepsCount: skill.stepsCount,
          installed: installedIds.has(skill.id)
        }))

        logger.info('[SkillMarket] Local skills loaded', { count: localSkills.length })

        return new Response(JSON.stringify({
          ok: true,
          message: 'success',
          skills: localSkillsWithInstalled,
          pagination: {
            total: localSkills.length,
            page: 1,
            pageSize: pageSize,
            totalPages: 1,
            hasMore: false
          },
          data: {
            skills: localSkillsWithInstalled,
            pagination: {
              total: localSkills.length,
              page: 1,
              pageSize: pageSize,
              totalPages: 1,
              hasMore: false
            },
            meta: { ...meta, source: 'local' }
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

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
      return errorResponse(`获取技能市场失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  // GET /api/skill-market/:id - 获取单个技能详情
  if (pathname.startsWith('/api/skill-market/') && request.method === 'GET') {
    try {
      const skillId = pathname.split('/')[3]
      await service.refreshIfNeeded()
      const skill = service.getSkill(skillId)
      
      if (!skill) {
        return errorResponse('技能不存在', 404)
      }

      logger.info('[SkillMarket] Skill detail retrieved', { skillId })

      return jsonResponse({ ok: true, skill, data: { skill } })
    } catch (error) {
      logger.error('[SkillMarket] Get skill detail failed', error)
      return errorResponse(`获取技能详情失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // POST /api/skill-market/install
  if (pathname === '/api/skill-market/install' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const id = body?.id

      if (!id) {
        return errorResponse('缺少技能 id', 400)
      }

      await service.refreshIfNeeded()
      let skill = service.getSkill(id)
      if (!skill) {
        await service.refreshIfNeeded(true)
        skill = service.getSkill(id)
      }
      if (!skill) {
        return errorResponse('技能不存在', 404)
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

      return jsonResponse({ ok: true, message: '技能已安装' })
    } catch (error) {
      logger.error('[SkillMarket] Install skill failed', error)
      return errorResponse(`安装失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // POST /api/skill-market/uninstall
  if (pathname === '/api/skill-market/uninstall' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const id = body?.id

      if (!id) {
        return errorResponse('缺少技能 id', 400)
      }

      const config = await configService.getConfig()
      const index = config.skills.findIndex(s => s.id === id)
      if (index !== -1) {
        config.skills.splice(index, 1)
        await configService.saveConfig(config)
      }

      return jsonResponse({ ok: true, message: '技能已卸载' })
    } catch (error) {
      logger.error('[SkillMarket] Uninstall skill failed', error)
      return errorResponse(`卸载失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return null
}
