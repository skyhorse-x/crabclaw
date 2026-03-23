/**
 * MCP 相关类型定义
 */

/**
 * MCP 服务器配置
 */
export interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

/**
 * MCP 工具
 */
export interface McpTool {
  name: string
  description?: string
  inputSchema: any
}

/**
 * MCP 客户端
 */
export interface McpClient {
  client: any
  transport: any
  tools: McpTool[]
  connected: boolean
}

/**
 * MCP 服务器市场项
 */
export interface McpServerMarketItem {
  id: string
  name: string
  description: string
  category: string
  author?: string
  downloads: number
  url: string
  installed?: boolean
}
