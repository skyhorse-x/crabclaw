/**
 * 配置相关类型定义
 */

import { SkillConfig } from './skill.types'
import { TaskConfig } from './task.types'

/**
 * 模型配置
 */
export interface ModelConfig {
  id: string
  name: string
  provider: string
  customProviderName?: string
  apiKey?: string
  apiKeyEncrypted?: string
  modelName: string
  apiBaseUrl: string
  isBuiltIn: boolean
  isActive: boolean
  maxTokens?: number
  createdAt: string
  updatedAt: string
}

/**
 * 应用设置
 */
export interface ProxyConfig {
  enabled: boolean
  protocol: string
  host: string
  port: number
  username?: string
  password?: string
}

export interface AppSettings {
  backendPort: number
  theme: string
  language?: string
  activeModelId?: string
  userDataDir?: string
  skillsDir?: string
  proxy?: ProxyConfig
}

/**
 * 应用配置
 */
export interface AppConfig {
  settings: AppSettings
  models: ModelConfig[]
  skills: SkillConfig[]
  tasks: TaskConfig[]
}
