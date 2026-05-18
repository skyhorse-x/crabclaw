export interface Message {
  role: string
  text: string
  agentName?: string
  meta?: any
  typing?: boolean
  error?: boolean
  isReading?: boolean
  pendingConfirm?: {
    server: string
    tool: string
    args: Record<string, any>
    message?: string
    executing?: boolean
  } | null
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
}

export interface Model {
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
  createdAt: string
  updatedAt: string
}

export interface Skill {
  id: string
  name: string
  description: string
  steps: any[]
}

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
  language: string
  activeModelId: string
  userDataDir?: string
  skillsDir?: string
  username?: string
  proxy?: ProxyConfig
}

export interface AppConfig {
  settings: AppSettings
  models: Model[]
  skills: Skill[]
}

export interface ScheduledTask {
  id: string
  name: string
  type: 'interval' | 'cron'
  intervalMs?: number
  toolName: string
  toolInput: Record<string, unknown>
  enabled: boolean
  lastRun?: number
  nextRun?: number
  createdAt: number
}

export interface TaskLog {
  id: string
  taskId: string
  taskName: string
  status: 'success' | 'error'
  result?: string
  error?: string
  executedAt: number
}

export interface RemoteControlConfig {
  enabled: boolean
  commandPrefix: string
  verifyCode: string
  telegram: {
    enabled: boolean
    botToken: string
    chatId: string
  }
  qq: {
    enabled: boolean
    botId: string
    webhook: string
    appSecret: string
  }
  wechat: {
    enabled: boolean
    webhook: string
  }
  feishu: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
  discord: {
    enabled: boolean
    botToken: string
    channelId: string
  }
  slack: {
    enabled: boolean
    botToken: string
    channelId: string
  }
  teams: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
  whatsapp: {
    enabled: boolean
    accountSid: string
    authToken: string
    fromNumber: string
  }
}

export interface McpServer {
  id: string
  name: string
  category: string
  description: string
  downloads: number
  author?: string
  url?: string
  installed?: boolean
}

export interface SkillMarketItem {
  id: string
  name: string
  category: string
  description: string
  downloads: number
  author?: string
  url?: string
  installed?: boolean
}

export interface TraceDetailItem {
  stage: string
  text: string
  time: string
}

export interface TraceMcpRuntimeItem {
  status: 'start' | 'success' | 'error'
  label: string
  time: string
  error?: string
}

export interface MessageTraceState {
  planLines: string[]
  details: TraceDetailItem[]
  mcpRuntime: Record<string, TraceMcpRuntimeItem>
}

export interface TokenStats {
  totalPrompt: number
  totalCompletion: number
  totalTokens: number
  byModel: Record<string, { prompt: number; completion: number; total: number }>
}

export type NavKey = 'chat' | 'agents' | 'mcp' | 'skills' | 'tasks' | 'control' | 'settings'
