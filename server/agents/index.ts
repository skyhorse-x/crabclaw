/**
 * Agent 层导出
 */

// 基础类和接口
export type { BaseAgent, IAgent, AgentContext, AgentResult } from './base.agent'

// 具体 Agent 实现
export { McpAgent, mcpAgent } from './mcp.agent'
export { SystemAgent, systemAgent } from './system.agent'
