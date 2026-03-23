/**
 * MCP 工具适配器
 * 将 MCP 工具适配为统一工具接口
 */

import type { ITool, ToolInputSchema, ToolResult } from './tool.types'
import { mcpService } from '../services/mcp.service'
import { logger } from '../services/logger.service'

/**
 * MCP 工具适配器
 */
export class McpToolAdapter implements ITool {
  readonly name: string
  readonly description: string
  readonly inputSchema: ToolInputSchema
  
  constructor(
    private serverId: string,
    private toolName: string,
    toolDescription?: string,
    toolInputSchema?: any
  ) {
    this.name = `${serverId}__${toolName}`
    this.description = toolDescription || `MCP 工具：${serverId}/${toolName}`
    
    // 转换 MCP inputSchema 为统一格式
    this.inputSchema = this.convertInputSchema(toolInputSchema)
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    try {
      logger.debug('[McpToolAdapter] Executing MCP tool', { 
        server: this.serverId, 
        tool: this.toolName 
      })

      const result = await mcpService.callTool(this.serverId, this.toolName, input)

      if (result.ok) {
        return {
          ok: true,
          data: result.result
        }
      } else {
        return {
          ok: false,
          error: result.error
        }
      }
    } catch (error: any) {
      logger.error('[McpToolAdapter] Execution error', error)
      
      return {
        ok: false,
        error: `MCP 工具执行失败：${error.message}`
      }
    }
  }

  /**
   * 转换 MCP inputSchema 为统一格式
   */
  private convertInputSchema(mcpSchema?: any): ToolInputSchema {
    if (!mcpSchema) {
      return {
        type: 'object',
        properties: {}
      }
    }

    const properties: Record<string, any> = {}
    const required = mcpSchema.required || []

    // 转换 properties
    if (mcpSchema.properties) {
      for (const [key, value] of Object.entries(mcpSchema.properties)) {
        const prop = value as any
        properties[key] = {
          type: prop.type || 'string',
          description: prop.description || '',
          required: required.includes(key),
          default: prop.default
        }
      }
    }

    return {
      type: 'object',
      properties,
      required
    }
  }

  /**
   * 获取 MCP 工具元数据
   */
  getMetadata() {
    return {
      server: this.serverId,
      tool: this.toolName,
      name: this.name,
      description: this.description
    }
  }
}

/**
 * 批量注册 MCP 工具到注册表
 */
export async function registerMcpTools(toolRegistry: any): Promise<void> {
  try {
    const mcpTools = await mcpService.getTools()
    
    for (const [serverId, tools] of Object.entries(mcpTools)) {
      for (const tool of tools) {
        const adapter = new McpToolAdapter(
          serverId,
          tool.name,
          tool.description,
          tool.inputSchema
        )
        
        toolRegistry.register(adapter)
        logger.debug(`[McpToolAdapter] Registered: ${adapter.name}`)
      }
    }

    logger.info('[McpToolAdapter] All MCP tools registered', { 
      serversCount: Object.keys(mcpTools).length 
    })
  } catch (error: any) {
    logger.error('[McpToolAdapter] Failed to register MCP tools', error)
  }
}
