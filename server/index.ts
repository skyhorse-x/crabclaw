/**
 * Server 核心模块统一导出
 * 
 * 提供所有核心能力的便捷导入
 */

// ==================== 核心层 ====================
export { startServer } from './core/server'
export { bootstrap } from './core/bootstrap'

// ==================== 工具系统 ====================
export { 
  toolRegistry,
  ToolRegistry 
} from './tools/index'
export type { ITool, IToolRegistry } from './tools/index'

// ==================== 任务规划 ====================
export { 
  taskPlanner,
  TaskPlanner 
} from './planner/index'
export type { TaskPlan, TaskStep, PlanningResult } from './planner/index'

// ==================== 记忆系统 ====================
export { 
  memoryManager,
  MemoryManager,
  ShortMemory,
  LongMemory 
} from './memory/index'
export type { MemoryEntry, MemoryContext } from './memory/index'

// ==================== 技能系统 ====================
export { 
  skillRegistry,
  SkillRegistry,
  skillExecutor 
} from './skills/index'
export type { Skill, SkillStep, SkillResult } from './skills/index'

// ==================== 任务队列 ====================
export { 
  taskQueue,
  TaskQueue,
  registerBuiltInHandlers 
} from './task/index'
export type { Task, TaskStatus, TaskQueueStats } from './task/index'

// ==================== 状态管理 ====================
export { 
  agentStateManager,
  AgentStateManager 
} from './state/index'
export type { AgentState, AgentStatus } from './state/index'

// ==================== LLM 层 ====================
export {
  LLMClient,
  createClient,
  getDefaultClient,
  llm,
  LLMGateway,
  createGateway,
  ModelRouter,
  createRouter,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider
} from './llm/index'
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
  Provider,
  GatewayConfig,
  ClientConfig
} from './llm/index'

// ==================== Agents ====================
export { BaseAgent } from './agents/base.agent'
export { McpAgent } from './agents/mcp.agent'
export { SystemAgent } from './agents/system.agent'

// ==================== 服务层 ====================
export { mcpService } from './services/mcp.service'
export { actionService } from './services/action.service'
export { logger } from './services/logger.service'
export { getConfigService } from './services/config.service'
export { getCacheService } from './services/cache.service'

// ==================== 共享模块 ====================
export * from './shared/index'
