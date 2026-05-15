/**
 * 智能 MCP Agent
 * 负责 AI 驱动的 MCP 工具自主选择和调用
 */

import { BaseAgent, AgentContext, AgentResult } from './base.agent'
import { mcpToolRegistry, type ToolSelectionResult } from '../services/mcp-tool-registry'
import { llm } from '../llm'
import { logger } from '../services/logger.service'

/**
 * 智能工具选择请求
 */
interface IntelligentToolSelectionRequest {
  userTask: string
  context?: {
    previousActions?: string[]
    currentState?: Record<string, any>
    constraints?: string[]
  }
}

/**
 * 智能 MCP Agent 类
 */
export class IntelligentMcpAgent extends BaseAgent {
  readonly type = 'intelligent_mcp'
  
  private toolSelectionPrompt: string = ''
  
  async initialize(): Promise<void> {
    logger.debug('[IntelligentMcpAgent] Initializing...')
    
    // 初始化工具注册表
    await mcpToolRegistry.initialize()
    
    // 构建工具选择提示词
    this.toolSelectionPrompt = this.buildToolSelectionPrompt()
    
    logger.info('[IntelligentMcpAgent] Initialized')
  }
  
  /**
   * 构建工具选择提示词
   */
  private buildToolSelectionPrompt(): string {
    const availableTools = mcpToolRegistry.getAvailableTools()
    
    const toolsInfo = availableTools.map(tool => {
      return `
### ${tool.server}/${tool.name}
**描述**: ${tool.description}
**参数格式**:
${JSON.stringify(tool.inputSchema, null, 2)}
`
    }).join('\n')
    
    return `
你是一个智能助手，需要根据用户任务自主判断该使用哪个 MCP 工具。

## 可用工具列表

${toolsInfo}

## 你的职责

1. 仔细阅读每个工具的**描述**，理解这个工具能做什么
2. 根据**用户任务的意图**选择最合适的工具
3. 不要依赖预定义的类别或标签，要自己理解工具描述

## 决策思路

当用户说"打开百度"时，你应该：
1. 理解意图：用户想在一个浏览器中打开网页
2. 查看工具描述：找描述中提到"browser"、"page"、"chrome"、"web"等关键词的工具
3. 选择 chrome-devtools 相关的工具

## 输出格式

请严格按照以下 JSON 格式返回：

{
  "selectedTool": {
    "server": "服务器名称",
    "tool": "工具名称"
  },
  "confidence": 0.0-1.0,
  "reasoning": "详细说明你的推理过程，为什么选择这个工具",
  "parameters": {}
}

请基于工具描述和用户任务做出选择。
`
  }
  
  protected async doExecute(context: AgentContext): Promise<AgentResult> {
    const { variables } = context
    
    // 检查是否有智能工具选择请求
    const selectionRequest = variables.selectionRequest as IntelligentToolSelectionRequest | undefined
    
    if (!selectionRequest) {
      return {
        ok: false,
        error: '缺少工具选择请求参数',
        data: null
      }
    }
    
    try {
      // 执行智能工具选择
      const selectionResult = await this.selectToolIntelligently(selectionRequest)
      
      // 如果置信度足够高，直接调用工具
      if (selectionResult.confidence > 0.7) {
        const toolResult = await this.executeSelectedTool(selectionResult)
        
        return {
          ok: true,
          data: {
            selection: selectionResult,
            execution: toolResult
          }
        }
      } else {
        // 置信度不足，返回选择结果供用户确认
        return {
          ok: true,
          data: {
            selection: selectionResult,
            requiresConfirmation: true,
            message: '置信度较低，请确认是否执行'
          }
        }
      }
    } catch (error) {
      logger.error('[IntelligentMcpAgent] Tool selection failed', error)
      return {
        ok: false,
        error: `工具选择失败: ${error instanceof Error ? error.message : '未知错误'}`,
        data: null
      }
    }
  }
  
  /**
   * 智能选择工具
   */
  private async selectToolIntelligently(request: IntelligentToolSelectionRequest): Promise<ToolSelectionResult> {
    const { userTask, context } = request
    
    // 构建完整的提示词
    const fullPrompt = `${this.toolSelectionPrompt}

## 用户任务

${userTask}

${context ? `## 上下文信息

${JSON.stringify(context, null, 2)}` : ''}

请基于以上信息选择最合适的工具。`
    
    // 调用 LLM 进行工具选择
      const response = await llm.chat(fullPrompt, {
        temperature: 0.3, // 较低的温度以获得更确定的结果
        max_tokens: 2000
      })
      
      // 解析 LLM 响应
      const selectionResult = this.parseLlmResponse(response)
    
    // 验证选择结果
    this.validateSelectionResult(selectionResult)
    
    logger.debug('[IntelligentMcpAgent] Tool selection completed', {
      task: userTask,
      selectedTool: selectionResult.selectedTool,
      confidence: selectionResult.confidence
    })
    
    return selectionResult
  }
  
  /**
   * 解析 LLM 响应
   */
  private parseLlmResponse(response: string): ToolSelectionResult {
    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('LLM 响应中未找到有效的 JSON 格式')
      }
      
      const parsed = JSON.parse(jsonMatch[0])
      
      // 验证必需字段
      if (!parsed.selectedTool || !parsed.selectedTool.server || !parsed.selectedTool.tool) {
        throw new Error('选择结果缺少必要的工具信息')
      }
      
      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error('置信度必须在 0-1 之间')
      }
      
      return parsed as ToolSelectionResult
    } catch (error) {
      logger.error('[IntelligentMcpAgent] Failed to parse LLM response', { response, error })
      throw new Error(`解析 LLM 响应失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
  
  /**
   * 验证选择结果
   */
  private validateSelectionResult(result: ToolSelectionResult): void {
    const { server, tool } = result.selectedTool
    const toolKey = `${server}/${tool}`
    
    // 检查工具是否存在
    const availableTools = mcpToolRegistry.getAvailableTools()
    const toolExists = availableTools.some(t => 
      t.server === server && t.name === tool
    )
    
    if (!toolExists) {
      throw new Error(`选择的工具不存在: ${toolKey}`)
    }
    
    // 验证参数格式
    if (result.parameters) {
      const toolDefinition = availableTools.find(t => 
        t.server === server && t.name === tool
      )
      
      if (toolDefinition) {
        this.validateToolParameters(result.parameters, toolDefinition.inputSchema)
      }
    }
  }
  
  /**
   * 验证工具参数
   */
  private validateToolParameters(parameters: Record<string, any>, schema: any): void {
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in parameters)) {
          throw new Error(`缺少必需参数: ${requiredParam}`)
        }
      }
    }
    
    // 验证参数类型（基础验证）
    if (schema.properties) {
      for (const [paramName, paramValue] of Object.entries(parameters)) {
        const paramSchema = schema.properties[paramName]
        if (paramSchema) {
          if (paramSchema.type && typeof paramValue !== paramSchema.type) {
            throw new Error(`参数 ${paramName} 类型不匹配，期望 ${paramSchema.type}，实际 ${typeof paramValue}`)
          }
        }
      }
    }
  }
  
  /**
   * 执行选择的工具
   */
  private async executeSelectedTool(selection: ToolSelectionResult): Promise<any> {
    const { server, tool } = selection.selectedTool
    const { parameters } = selection
    
    try {
      // 调用工具
      const result = await mcpToolRegistry.callTool(server, tool, parameters || {})
      
      // 更新工具使用统计
      await mcpToolRegistry.updateToolUsage(
        `${server}/${tool}`,
        true, // 假设成功
        selection.confidence,
        selection.reasoning
      )
      
      logger.info('[IntelligentMcpAgent] Tool executed successfully', {
        server,
        tool,
        confidence: selection.confidence
      })
      
      return result
    } catch (error) {
      // 更新失败统计
      await mcpToolRegistry.updateToolUsage(
        `${server}/${tool}`,
        false,
        selection.confidence,
        selection.reasoning
      )
      
      throw error
    }
  }
  
  /**
   * 直接工具选择（绕过 AI 决策）
   */
  async selectToolDirectly(
    server: string,
    tool: string,
    parameters?: Record<string, any>
  ): Promise<ToolSelectionResult> {
    const toolKey = `${server}/${tool}`
    const availableTools = mcpToolRegistry.getAvailableTools()
    const toolDefinition = availableTools.find(t => 
      t.server === server && t.name === tool
    )
    
    if (!toolDefinition) {
      throw new Error(`工具不存在: ${toolKey}`)
    }
    
    return {
      selectedTool: { server, tool },
      confidence: 0.9, // 直接选择置信度高
      reasoning: `直接选择工具 ${toolKey}`,
      parameters: parameters || {}
    }
  }
  
  /**
   * 获取工具推荐（不执行）
   */
  async getToolRecommendations(task: string): Promise<ToolSelectionResult[]> {
    const availableTools = mcpToolRegistry.getAvailableTools()
    const recommendations: ToolSelectionResult[] = []
    
    // 基于关键词匹配的简单推荐算法
    const taskLower = task.toLowerCase()
    
    for (const tool of availableTools) {
      let confidence = 0
      let reasoning = ''
      
      // 基于名称匹配
      if (tool.name.toLowerCase().includes(taskLower) || 
          taskLower.includes(tool.name.toLowerCase())) {
        confidence += 0.4
        reasoning += '名称匹配; '
      }
      
      // 基于描述匹配
      if (tool.description.toLowerCase().includes(taskLower)) {
        confidence += 0.3
        reasoning += '描述匹配; '
      }
      
      // 基于类别匹配
      if (taskLower.includes(tool.category.toLowerCase())) {
        confidence += 0.2
        reasoning += '类别匹配; '
      }
      
      // 基于能力匹配
      for (const capability of tool.capabilities) {
        if (taskLower.includes(capability.toLowerCase())) {
          confidence += 0.1
          reasoning += `能力匹配(${capability}); `
        }
      }
      
      if (confidence > 0.3) {
        recommendations.push({
          selectedTool: { server: tool.server, tool: tool.name },
          confidence: Math.min(confidence, 0.9),
          reasoning: reasoning || '基于关键词匹配',
          parameters: {}
        })
      }
    }
    
    // 按置信度排序
    return recommendations.sort((a, b) => b.confidence - a.confidence)
  }
}

export const intelligentMcpAgent = new IntelligentMcpAgent()