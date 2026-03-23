/**
 * 技能注册表
 * 管理所有技能的注册和执行
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../services/logger.service'
import type { Skill, ISkillRegistry, SkillResult } from './skill.types'
import { skillExecutor } from './skill-executor'

/**
 * 技能注册表类
 */
export class SkillRegistry implements ISkillRegistry {
  private skills: Map<string, Skill> = new Map()

  /**
   * 注册技能
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      logger.warn('[SkillRegistry] Skill already registered, overwriting', { 
        skillId: skill.id 
      })
    }

    this.skills.set(skill.id, skill)
    logger.debug('[SkillRegistry] Skill registered', { 
      skillId: skill.id, 
      skillName: skill.name,
      stepsCount: skill.steps.length 
    })
  }

  /**
   * 获取技能
   */
  getSkill(id: string): Skill | null {
    return this.skills.get(id) || null
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * 按分类获取技能
   */
  getSkillsByCategory(category: string): Skill[] {
    return Array.from(this.skills.values())
      .filter(skill => skill.category === category)
  }

  /**
   * 删除技能
   */
  unregister(id: string): void {
    const deleted = this.skills.delete(id)
    logger.debug('[SkillRegistry] Skill unregistered', { skillId: id, deleted })
  }

  /**
   * 执行技能
   */
  async execute(skillId: string, input?: Record<string, any>): Promise<SkillResult> {
    const skill = this.getSkill(skillId)

    if (!skill) {
      const availableSkills = this.getAllSkills()
        .map(s => `${s.id} (${s.name})`)
        .join(', ')

      logger.error('[SkillRegistry] Skill not found', { 
        skillId,
        availableSkills 
      })

      return {
        success: false,
        skillId,
        error: `技能 "${skillId}" 不存在。可用技能：${availableSkills}`,
        stepResults: [],
        duration: 0,
        stepsExecuted: 0
      }
    }

    try {
      return await skillExecutor.execute(skill, input)
    } catch (error: any) {
      logger.error('[SkillRegistry] Skill execution error', error)

      return {
        success: false,
        skillId,
        error: `技能执行失败：${error.message}`,
        stepResults: [],
        duration: 0,
        stepsExecuted: 0
      }
    }
  }

  /**
   * 检查技能是否存在
   */
  hasSkill(id: string): boolean {
    return this.skills.has(id)
  }

  /**
   * 从文件加载技能
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      if (!existsSync(filePath)) {
        logger.warn('[SkillRegistry] Skill file not found', { filePath })
        return
      }

      const json = await readFile(filePath, 'utf8')
      const skill: Skill = JSON.parse(json)

      this.register(skill)
      logger.info('[SkillRegistry] Skill loaded from file', { 
        filePath, 
        skillId: skill.id 
      })
    } catch (error: any) {
      logger.error('[SkillRegistry] Failed to load skill from file', { 
        filePath, 
        error: error.message 
      })
    }
  }

  /**
   * 从目录加载所有技能
   */
  async loadFromDirectory(dirPath: string): Promise<number> {
    try {
      if (!existsSync(dirPath)) {
        logger.warn('[SkillRegistry] Skills directory not found', { dirPath })
        return 0
      }

      const { readdir } = await import('fs/promises')
      const files = await readdir(dirPath)
      let loadedCount = 0

      for (const file of files) {
        if (file.endsWith('.skill.json') || file.endsWith('.json')) {
          const filePath = join(dirPath, file)
          await this.loadFromFile(filePath)
          loadedCount++
        }
      }

      logger.info('[SkillRegistry] Skills loaded from directory', { 
        dirPath, 
        count: loadedCount 
      })

      return loadedCount
    } catch (error: any) {
      logger.error('[SkillRegistry] Failed to load skills from directory', error)
      return 0
    }
  }

  /**
   * 获取技能列表（元数据）
   */
  listSkills(): Array<{
    id: string
    name: string
    description?: string
    category?: string
    stepsCount: number
  }> {
    return Array.from(this.skills.values()).map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      stepsCount: skill.steps.length
    }))
  }

  /**
   * 导出技能
   */
  exportSkill(skillId: string): Skill | null {
    return this.getSkill(skillId)
  }

  /**
   * 导入技能
   */
  importSkill(skill: Skill): void {
    this.register(skill)
  }
}

/**
 * 创建技能注册表单例
 */
export const skillRegistry = new SkillRegistry()
