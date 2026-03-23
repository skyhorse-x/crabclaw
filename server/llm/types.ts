/**
 * LLM 层类型定义（简化版）
 */

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant'

/**
 * 对话消息
 */
export interface ChatMessage {
  role: MessageRole
  content: string
  name?: string
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, any>
  }
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 使用统计
 */
export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/**
 * LLM 响应
 */
export interface LLMResponse {
  id: string
  model: string
  text: string
  toolCalls?: ToolCall[]
  usage?: Usage
  raw?: any
}

/**
 * LLM 请求
 */
export interface LLMRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  stream?: boolean
  task?: string
}

/**
 * 提供商配置
 */
export interface ProviderConfig {
  name: string
  apiKey?: string
  baseURL?: string
  defaultModel?: string
  timeout?: number
  retries?: number
  [key: string]: any
}

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string
  name: string
  provider: string
  context_window?: number
  supports_tools?: boolean
  supports_vision?: boolean
}

/**
 * 路由配置
 */
export interface RouterConfig {
  defaultProvider?: string
  defaultModel?: string
  providers: ProviderConfig[]
  rules?: RoutingRule[]
}

/**
 * 路由规则
 */
export interface RoutingRule {
  pattern: string
  provider: string
  model?: string
  task?: string
}

/**
 * Provider 接口
 */
export interface Provider {
  readonly name: string
  generate(input: LLMRequest): Promise<LLMResponse>
  listModels?(): Promise<ModelInfo[]>
  testConnection?(): Promise<boolean>
}
