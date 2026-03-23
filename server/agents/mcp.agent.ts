/**
 * MCP Agent
 * 负责 AI 驱动的 MCP 工具调用和上下文管理
 */

import { BaseAgent, AgentContext, AgentResult } from './base.agent'
import { mcpService } from '../services/mcp.service'
import { logger } from '../services/logger.service'

/**
 * MCP 工具调用参数
 */
interface McpToolCall {
  server: string
  tool: string
  args: Record<string, any>
}

/**
 * MCP Agent 类
 */
export class McpAgent extends BaseAgent {
  readonly type = 'mcp'

  private availableTools: Map<string, string[]> = new Map()

  async initialize(): Promise<void> {
    logger.debug('[McpAgent] Initializing...')
    
    // 加载可用的 MCP 工具
    const tools = await mcpService.getTools()
    
    for (const [server, serverTools] of Object.entries(tools)) {
      this.availableTools.set(
        server,
        serverTools.map(t => t.name)
      )
    }

    logger.info('[McpAgent] Initialized', { 
      serversCount: this.availableTools.size 
    })
  }

  protected async doExecute(context: AgentContext): Promise<AgentResult> {
    const { variables } = context

    // 检查是否有工具调用请求
    const toolCall = variables.toolCall as McpToolCall | undefined
    
    if (!toolCall) {
      return this.error('缺少工具调用参数')
    }

    const { server, tool, args } = toolCall

    logger.info('[McpAgent] Executing tool call', { 
      server, 
      tool, 
      argsCount: Object.keys(args).length 
    })

    try {
      // 验证工具是否存在
      const serverTools = this.availableTools.get(server)
      if (!serverTools) {
        return this.error(`MCP 服务器 "${server}" 未找到`)
      }

      if (!serverTools.includes(tool)) {
        return this.error(`工具 "${tool}" 在服务器 "${server}" 中不存在`)
      }

      // 调用工具
      const result = await mcpService.callTool(server, tool, args)

      if (result.ok) {
        logger.debug('[McpAgent] Tool call succeeded', { server, tool })
        
        return this.success({
          server,
          tool,
          result: result.result
        })
      } else {
        logger.error('[McpAgent] Tool call failed', { server, tool, error: result.error })
        
        return this.error(result.error || 'MCP 工具调用失败')
      }
    } catch (error: any) {
      logger.error('[McpAgent] Execution error', error)
      
      return this.error(`MCP 工具调用异常：${error.message}`)
    }
  }

  async cleanup(): Promise<void> {
    logger.debug('[McpAgent] Cleaning up...')
    this.availableTools.clear()
    await super.cleanup()
  }

  /**
   * 获取可用的 MCP 工具列表
   */
  getAvailableTools(): Map<string, string[]> {
    return new Map(this.availableTools)
  }

  /**
   * 检查工具是否可用
   */
  isToolAvailable(server: string, tool: string): boolean {
    const serverTools = this.availableTools.get(server)
    return serverTools?.includes(tool) || false
  }
}

/**
 * 创建 MCP Agent 单例
 */
export const mcpAgent = new McpAgent()
