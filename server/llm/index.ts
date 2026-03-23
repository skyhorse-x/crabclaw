/**
 * LLM 层统一导出（简化版）
 */

// ==================== 类型 ====================
export type {
  MessageRole,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  Usage,
  LLMResponse,
  LLMRequest,
  ProviderConfig,
  ModelInfo,
  RouterConfig,
  RoutingRule,
  Provider
} from './types'

// 从 gateway.ts 和 client.ts 导出类型
export type { GatewayConfig } from './gateway'
export type { ClientConfig } from './client'

// ==================== Client（入口） ====================
export {
  LLMClient,
  createClient,
  getDefaultClient,
  llm
} from './client'

// ==================== Gateway（统一 API） ====================
export {
  LLMGateway,
  createGateway
} from './gateway'

// ==================== Router（模型路由） ====================
export {
  ModelRouter,
  createRouter
} from './router'

// ==================== Providers（提供商） ====================
export {
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider
} from './providers'
