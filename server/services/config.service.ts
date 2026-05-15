/**
 * 配置服务
 * 负责配置的加载、验证、保存
 */


import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { 
  AppConfig, 
  ModelConfig,
  SkillConfig, 
  SkillStep, 
  TaskConfig,
  SkillCategory 
} from '../shared/types'
import { PATHS, DEFAULTS, DEFAULT_CONFIG } from '../shared/constants'
import { ValidationError } from '../middleware/error.middleware'
import { logger } from './logger.service'
import { getEncryptionService } from './encryption.service'

/**
 * 配置验证器
 */
export class ConfigValidator {
  /**
   * 验证技能步骤
   */
  static validateSkillStep(step: any, index: number): SkillStep {
    if (!step || typeof step !== 'object') {
      throw new ValidationError(`技能步骤 #${index} 必须是对象`)
    }

    if (!step.type) {
      throw new ValidationError(`技能步骤 #${index} 缺少 type 字段`)
    }

    const validTypes = ['openApp', 'openUrl', 'click', 'doubleClick', 'rightClick', 'type', 'paste', 'key', 'hotkey', 'wait', 'scroll', 'move', 'noop', 'note', 'chat']
    
    if (!validTypes.includes(step.type)) {
      throw new ValidationError(`技能步骤 #${index} 的操作类型 "${step.type}" 无效`)
    }

    const sanitized: SkillStep = {
      type: step.type,
      label: step.label ? String(step.label) : undefined,
      target: step.target ? String(step.target) : undefined,
      x: typeof step.x === 'number' ? step.x : (step.x ? Number(step.x) : undefined),
      y: typeof step.y === 'number' ? step.y : (step.y ? Number(step.y) : undefined),
      text: step.text ? String(step.text) : undefined,
      app: step.app ? String(step.app) : undefined,
      url: step.url ? String(step.url) : undefined,
      key: step.key ? String(step.key) : undefined,
      keys: Array.isArray(step.keys) ? step.keys : undefined,
      dx: typeof step.dx === 'number' ? step.dx : undefined,
      dy: typeof step.dy === 'number' ? step.dy : undefined,
      ms: typeof step.ms === 'number' ? step.ms : (step.ms ? Number(step.ms) : undefined),
      note: step.note ? String(step.note) : undefined
    }

    return sanitized
  }

  /**
   * 验证技能配置
   */
  static validateSkill(skill: any, index?: number): SkillConfig {
    if (!skill || typeof skill !== 'object') {
      throw new ValidationError(`技能${index !== undefined ? ` #${index}` : ''} 必须是对象`)
    }

    if (!skill.id) {
      throw new ValidationError(`技能${index !== undefined ? ` #${index}` : ''} 缺少 id 字段`)
    }

    if (!skill.name) {
      throw new ValidationError(`技能 "${skill.id}" 缺少 name 字段`)
    }

    if (!skill.category) {
      throw new ValidationError(`技能 "${skill.id}" 缺少 category 字段`)
    }

    const validCategories = ['browser', 'desktop', 'emulator']
    if (!validCategories.includes(skill.category)) {
      throw new ValidationError(`技能 "${skill.id}" 的 category "${skill.category}" 无效`)
    }

    if (!Array.isArray(skill.steps)) {
      throw new ValidationError(`技能 "${skill.id}" 的 steps 必须是数组`)
    }

    if (!Array.isArray(skill.tags)) {
      skill.tags = []
    }

    if (!Array.isArray(skill.triggerPhrases)) {
      skill.triggerPhrases = []
    }

    const sanitized: SkillConfig = {
      id: String(skill.id),
      name: String(skill.name),
      category: skill.category as SkillCategory,
      description: skill.description ? String(skill.description) : '',
      tags: skill.tags.map((t: any) => String(t)),
      triggerPhrases: skill.triggerPhrases.map((t: any) => String(t)),
      delayMs: typeof skill.delayMs === 'number' ? skill.delayMs : 500,
      steps: skill.steps.map((step: any, i: number) => this.validateSkillStep(step, i)),
      skillFile: skill.skillFile ? String(skill.skillFile) : undefined
    }

    return sanitized
  }

  /**
   * 验证任务配置
   */
  static validateTask(task: any, index?: number): TaskConfig {
    if (!task || typeof task !== 'object') {
      throw new ValidationError(`任务${index !== undefined ? ` #${index}` : ''} 必须是对象`)
    }

    if (!task.id) {
      throw new ValidationError(`任务${index !== undefined ? ` #${index}` : ''} 缺少 id 字段`)
    }

    if (!task.name) {
      throw new ValidationError(`任务 "${task.id}" 缺少 name 字段`)
    }

    if (!task.skillId) {
      throw new ValidationError(`任务 "${task.id}" 缺少 skillId 字段`)
    }

    const sanitized: TaskConfig = {
      id: String(task.id),
      name: String(task.name),
      skillId: String(task.skillId),
      enabled: task.enabled !== false,
      intervalMinutes: typeof task.intervalMinutes === 'number' ? task.intervalMinutes : 60,
      runOnStartup: task.runOnStartup === true,
      description: task.description ? String(task.description) : ''
    }

    return sanitized
  }

  /**
   * 验证模型配置
   */
  static validateModel(model: any, index?: number): ModelConfig {
    if (!model || typeof model !== 'object') {
      throw new ValidationError(`模型${index !== undefined ? ` #${index}` : ''} 必须是对象`)
    }

    if (!model.id) {
      throw new ValidationError(`模型${index !== undefined ? ` #${index}` : ''} 缺少 id 字段`)
    }

    if (!model.name) {
      throw new ValidationError(`模型 "${model.id}" 缺少 name 字段`)
    }

    if (!model.provider) {
      throw new ValidationError(`模型 "${model.id}" 缺少 provider 字段`)
    }

    if (!model.modelName) {
      throw new ValidationError(`模型 "${model.id}" 缺少 modelName 字段`)
    }

    if (!model.apiBaseUrl) {
      throw new ValidationError(`模型 "${model.id}" 缺少 apiBaseUrl 字段`)
    }

    const sanitized: ModelConfig = {
      id: String(model.id),
      name: String(model.name),
      provider: String(model.provider),
      customProviderName: model.customProviderName ? String(model.customProviderName) : undefined,
      apiKey: model.apiKey ? String(model.apiKey) : undefined,
      apiKeyEncrypted: model.apiKeyEncrypted ? String(model.apiKeyEncrypted) : undefined,
      modelName: String(model.modelName),
      apiBaseUrl: String(model.apiBaseUrl),
      isBuiltIn: model.isBuiltIn === true,
      isActive: model.isActive !== false,
      createdAt: model.createdAt ? String(model.createdAt) : new Date().toISOString(),
      updatedAt: model.updatedAt ? String(model.updatedAt) : new Date().toISOString()
    }

    return sanitized
  }

  /**
   * 验证应用配置
   */
  static validateConfig(config: any): AppConfig {
    if (!config || typeof config !== 'object') {
      throw new ValidationError('配置必须是对象')
    }

    if (!config.settings || typeof config.settings !== 'object') {
      config.settings = {}
    }

    const sanitized: AppConfig = {
      settings: {
        backendPort: typeof config.settings.backendPort === 'number' 
          ? config.settings.backendPort 
          : DEFAULTS.PORT,
        theme: config.settings.theme ? String(config.settings.theme) : DEFAULTS.THEME,
        language: config.settings.language ? String(config.settings.language) : DEFAULTS.LANGUAGE,
        activeModelId: config.settings.activeModelId ? String(config.settings.activeModelId) : undefined,
        userDataDir: config.settings.userDataDir ? String(config.settings.userDataDir) : undefined,
        skillsDir: config.settings.skillsDir ? String(config.settings.skillsDir) : PATHS.SKILLS_DIR
      },
      models: Array.isArray(config.models)
        ? config.models.reduce((acc: ModelConfig[], model: any, i: number) => {
            try { acc.push(this.validateModel(model, i)) } catch (e) {
              logger.warn(`跳过无效模型 #${i}`, { error: (e as Error).message, model })
            }
            return acc
          }, [])
        : DEFAULT_CONFIG.models,
      skills: Array.isArray(config.skills)
        ? config.skills.reduce((acc: SkillConfig[], skill: any, i: number) => {
            try { acc.push(this.validateSkill(skill, i)) } catch (e) {
              logger.warn(`跳过无效技能 #${i}`, { error: (e as Error).message, skillId: skill?.id })
            }
            return acc
          }, [])
        : [],
      tasks: Array.isArray(config.tasks)
        ? config.tasks.reduce((acc: TaskConfig[], task: any, i: number) => {
            try { acc.push(this.validateTask(task, i)) } catch (e) {
              logger.warn(`跳过无效任务 #${i}`, { error: (e as Error).message, taskId: task?.id })
            }
            return acc
          }, [])
        : []
    }

    return sanitized
  }
}

/**
 * 配置服务类
 */
export class ConfigService {
  private configPath: string
  private skillsDir: string
  private cache: AppConfig | null = null
  private cacheTimestamp: number = 0
  private readonly CACHE_TTL = 5000 // 5 秒缓存
  private saveLock = false
  private saveQueue: Array<{ config: AppConfig; resolve: (value: AppConfig) => void; reject: (error: unknown) => void }> = []

  constructor(options: {
    configPath?: string
    skillsDir?: string
  } = {}) {
    this.configPath = options.configPath || PATHS.CONFIG_PATH
    this.skillsDir = options.skillsDir || PATHS.SKILLS_DIR
  }

  /**
   * 确保配置目录存在
   */
  private async ensureConfigDir(): Promise<void> {
    const configDir = path.dirname(this.configPath)
    try {
      await mkdir(configDir, { recursive: true })
      await mkdir(this.skillsDir, { recursive: true })
    } catch (error) {
      logger.error('Failed to create config directories', error)
      throw error
    }
  }

  /**
   * 加载配置文件
   */
  private async loadConfigFile(): Promise<Partial<AppConfig>> {
    try {
      const content = await readFile(this.configPath, 'utf8')
      return JSON.parse(content)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.debug('Config file not found, will create default')
        return {}
      }
      logger.error('Failed to load config file', error)
      throw new ValidationError('配置文件格式错误', { error: error.message })
    }
  }

  /**
   * 保存配置文件
   */
  private async saveConfigFile(config: AppConfig): Promise<void> {
    try {
      await this.ensureConfigDir()
      const content = JSON.stringify(config, null, 2)
      await writeFile(this.configPath, content, 'utf8')
      logger.info('Config file saved', { path: this.configPath })
    } catch (error: any) {
      logger.error('Failed to save config file', error)
      throw new Error(`保存配置文件失败：${error.message}`)
    }
  }

  /**
   * 获取配置（带缓存）
   */
  async getConfig(): Promise<AppConfig> {
    const now = Date.now()
    
    // 检查缓存是否有效
    if (this.cache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      logger.debug('Returning cached config')
      return this.cache
    }

    logger.debug('Loading config from file')
    
    try {
      const rawConfig = await this.loadConfigFile()
      const validatedConfig = ConfigValidator.validateConfig(rawConfig)
      
      // 更新缓存
      this.cache = validatedConfig
      this.cacheTimestamp = now
      this.skillsDir = validatedConfig.settings.skillsDir || PATHS.SKILLS_DIR
      
      return validatedConfig
    } catch (error) {
      logger.error('Failed to load config', error)
      // 返回默认配置
      return ConfigValidator.validateConfig({})
    }
  }

  /**
   * 保存配置（带互斥锁，防止并发写入丢失数据）
   */
  async saveConfig(config: AppConfig): Promise<AppConfig> {
    if (this.saveLock) {
      return new Promise((resolve, reject) => {
        this.saveQueue.push({ config, resolve, reject })
      })
    }

    this.saveLock = true
    try {
      return await this.doSaveConfig(config)
    } finally {
      this.saveLock = false
      this.processSaveQueue()
    }
  }

  private processSaveQueue(): void {
    if (this.saveQueue.length === 0) return
    const next = this.saveQueue.shift()!
    this.saveConfig(next.config).then(next.resolve).catch(next.reject)
  }

  private async doSaveConfig(config: AppConfig): Promise<AppConfig> {
    logger.info('Saving config')
    
    try {
      const validatedConfig = ConfigValidator.validateConfig(config)
      this.skillsDir = validatedConfig.settings.skillsDir || PATHS.SKILLS_DIR
      
      // 加密所有模型中的 API Key
      const encryptionService = getEncryptionService()
      validatedConfig.models = validatedConfig.models.map(model => {
        if (model.apiKey) {
          try {
            const encryptedApiKey = encryptionService.encrypt(model.apiKey)
            return {
              ...model,
              apiKeyEncrypted: encryptedApiKey,
              apiKey: undefined // 移除明文 API Key
            }
          } catch (error) {
            logger.error(`[Config] Failed to encrypt API Key for model ${model.id}`, error)
          }
        }
        return model
      })
      
      await this.saveConfigFile(validatedConfig)
      
      // 更新缓存
      this.cache = validatedConfig
      this.cacheTimestamp = Date.now()
      this.skillsDir = validatedConfig.settings.skillsDir || PATHS.SKILLS_DIR
      
      return validatedConfig
    } catch (error) {
      logger.error('Failed to save config', error)
      throw error
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    logger.debug('Clearing config cache')
    this.cache = null
    this.cacheTimestamp = 0
  }

  /**
   * 获取技能配置文件路径
   */
  getSkillFilePath(skillId: string): string {
    return path.join(this.skillsDir, skillId, 'SKILL.md')
  }

  getSkillDirPath(skillId: string): string {
    return path.join(this.skillsDir, skillId)
  }

  /**
   * 加载技能文件
   */
  async loadSkillFile(skillId: string): Promise<SkillConfig | null> {
    const skillPath = this.getSkillFilePath(skillId)
    
    try {
      const content = await readFile(skillPath, 'utf8')
      const jsonBlock = this.extractJsonBlock(content)
      if (!jsonBlock) {
        logger.error(`Skill file missing JSON block: ${skillId}`)
        return null
      }
      const skill = JSON.parse(jsonBlock)
      return ConfigValidator.validateSkill(skill)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null
      }
      logger.error(`Failed to load skill file: ${skillId}`, error)
      return null
    }
  }

  /**
   * 保存技能文件
   */
  async saveSkillFile(skill: SkillConfig): Promise<void> {
    const skillDir = this.getSkillDirPath(skill.id)
    const skillPath = this.getSkillFilePath(skill.id)
    const agentsDir = path.join(skillDir, 'agents')
    const agentYamlPath = path.join(agentsDir, 'openai.yaml')
    
    try {
      await this.ensureConfigDir()
      await mkdir(skillDir, { recursive: true })
      await mkdir(agentsDir, { recursive: true })
      const content = this.buildSkillMarkdown(skill)
      await writeFile(skillPath, content, 'utf8')
      if (!await this.exists(agentYamlPath)) {
        const yaml = this.buildAgentYaml(skill)
        await writeFile(agentYamlPath, yaml, 'utf8')
      }
      logger.info('Skill file saved', { skillId: skill.id, path: skillPath })
    } catch (error: any) {
      logger.error('Failed to save skill file', error)
      throw new Error(`保存技能文件失败：${error.message}`)
    }
  }

  /**
   * 删除技能文件
   */
  async deleteSkillFile(skillId: string): Promise<void> {
    const skillDir = this.getSkillDirPath(skillId)
    
    try {
      await rm(skillDir, { recursive: true, force: true })
      logger.info('Skill file deleted', { skillId, path: skillDir })
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to delete skill file', error)
        throw error
      }
    }
  }

  private extractJsonBlock(content: string): string | null {
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i)
    if (!match) return null
    return match[1]
  }

  private buildSkillMarkdown(skill: SkillConfig): string {
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

  private buildAgentYaml(skill: SkillConfig): string {
    return `name: ${skill.name}\ncategory: ${skill.category}\nentry: SKILL.md\n`
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath)
      return true
    } catch {
      return false
    }
  }
}

/**
 * 创建默认配置实例
 */
export function createDefaultConfig(): AppConfig {
  return {
    settings: {
      backendPort: DEFAULTS.PORT,
      theme: DEFAULTS.THEME,
      language: DEFAULTS.LANGUAGE,
      activeModelId: 'default-openai',
      userDataDir: undefined,
      skillsDir: PATHS.SKILLS_DIR
    },
    models: [
      {
        id: 'default-openai',
        name: 'OpenAI GPT-4o',
        provider: 'openai',
        modelName: DEFAULTS.MODEL_NAME,
        apiBaseUrl: DEFAULTS.API_BASE_URL,
        isBuiltIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    skills: [],
    tasks: []
  }
}

/**
 * 单例实例
 */
let configServiceInstance: ConfigService | null = null

/**
 * 获取配置服务单例
 */
export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService()
  }
  return configServiceInstance
}
