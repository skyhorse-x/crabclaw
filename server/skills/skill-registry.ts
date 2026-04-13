/**
 * 技能注册表
 * 管理所有技能的注册和执行
 */

import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises'
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
      const skill = this.parseSkillContent(filePath, json)
      if (!skill) {
        logger.error('[SkillRegistry] Failed to parse skill content', { filePath })
        return
      }

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

      const entries = await readdir(dirPath, { withFileTypes: true })
      let loadedCount = 0

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = join(dirPath, entry.name, 'SKILL.md')
          if (existsSync(skillPath)) {
            await this.loadFromFile(skillPath)
            loadedCount++
          }
          continue
        }

        if (entry.isFile() && (entry.name.endsWith('.skill.json') || entry.name.endsWith('.json'))) {
          const filePath = join(dirPath, entry.name)
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

  async migrateJsonSkillsToFolders(dirPath: string): Promise<number> {
    try {
      if (!existsSync(dirPath)) {
        return 0
      }

      const entries = await readdir(dirPath, { withFileTypes: true })
      let migrated = 0

      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!entry.name.endsWith('.skill.json')) continue

        const filePath = join(dirPath, entry.name)
        const raw = await readFile(filePath, 'utf8')
        let skill: Skill | null = null
        try {
          skill = JSON.parse(raw)
        } catch (error) {
          logger.error('[SkillRegistry] Invalid skill json, skip migration', { filePath })
          continue
        }

        const skillId = String(skill?.id || entry.name.replace(/\.skill\.json$/i, ''))
        const skillDir = join(dirPath, skillId)
        const skillMd = join(skillDir, 'SKILL.md')
        const agentsDir = join(skillDir, 'agents')
        const agentYaml = join(agentsDir, 'openai.yaml')

        await mkdir(skillDir, { recursive: true })
        await mkdir(agentsDir, { recursive: true })
        if (!existsSync(skillMd)) {
          const md = this.buildSkillMarkdown(skill)
          await writeFile(skillMd, md, 'utf8')
        }
        if (!existsSync(agentYaml)) {
          const yaml = this.buildAgentYaml(skill)
          await writeFile(agentYaml, yaml, 'utf8')
        }

        await rm(filePath, { force: true })
        migrated++
      }

      if (migrated > 0) {
        logger.info('[SkillRegistry] Skills migrated to folder structure', { dirPath, migrated })
      }
      return migrated
    } catch (error: any) {
      logger.error('[SkillRegistry] Failed to migrate skills', { dirPath, error: error.message })
      return 0
    }
  }

  private parseSkillContent(filePath: string, content: string): Skill | null {
    if (filePath.endsWith('SKILL.md')) {
      const jsonBlock = this.extractJsonBlock(content)
      if (!jsonBlock) return null
      return JSON.parse(jsonBlock) as Skill
    }
    return JSON.parse(content) as Skill
  }

  private extractJsonBlock(content: string): string | null {
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i)
    if (!match) return null
    return match[1]
  }

  private buildSkillMarkdown(skill: Skill): string {
    const header = `# ${skill.name}\n\n${skill.description || ''}\n`
    const metaLines = [
      `- id: ${skill.id}`,
      `- category: ${skill.category}`,
      `- tags: ${(skill.tags || []).join(', ') || '-'}`,
      `- triggerPhrases: ${(skill.triggerPhrases || []).join(', ') || '-'}`,
      `- delayMs: ${skill.delayMs ?? 500}`
    ].join('\n')
    const jsonBlock = JSON.stringify(skill, null, 2)
    return `${header}\n## Metadata\n${metaLines}\n\n## Skill JSON\n\n\`\`\`json\n${jsonBlock}\n\`\`\`\n`
  }

  private buildAgentYaml(skill: Skill): string {
    return `name: ${skill.name}\ncategory: ${skill.category}\nentry: SKILL.md\n`
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
