/**
 * 智能 MCP 工具注册表
 * 负责 AI 驱动的 MCP 工具自主选择和上下文管理
 */

import { mcpService } from './mcp.service'
import { logger } from './logger.service'
import { CacheService } from './cache.service'

// 创建缓存服务实例
const cacheService = new CacheService({ defaultTTL: 3600000 }) // 默认1小时

/**
 * MCP 工具定义
 */
export interface McpToolDefinition {
  server: string
  name: string
  description: string
  inputSchema: any
  capabilities: string[]
  examples: ToolExample[]
  usageStats: ToolUsageStats
  category: string
  tags: string[]
}

/**
 * 工具使用示例
 */
export interface ToolExample {
  task: string
  call: {
    server: string
    tool: string
    args: Record<string, any>
  }
  result: any
  confidence: number
}

/**
 * 工具使用统计
 */
export interface ToolUsageStats {
  totalCalls: number
  successRate: number
  averageConfidence: number
  lastUsed: Date
  commonTasks: string[]
}

/**
 * 工具选择结果
 */
export interface ToolSelectionResult {
  selectedTool: {
    server: string
    tool: string
  }
  confidence: number
  reasoning: string
  parameters: Record<string, any>
  alternativeTools?: Array<{
    server: string
    tool: string
    confidence: number
    reasoning: string
  }>
}

/**
 * 智能 MCP 工具注册表
 */
export class McpToolRegistry {
  private tools: Map<string, McpToolDefinition> = new Map()
  private toolCategories: Map<string, Set<string>> = new Map()
  private toolCapabilities: Map<string, Set<string>> = new Map()
  
  /**
   * 初始化：从所有 MCP 服务器加载工具信息
   */
  async initialize(): Promise<void> {
    logger.info('[McpToolRegistry] Initializing...')
    
    try {
      // 获取所有 MCP 工具（按服务器分组）
      const allTools = await mcpService.getTools()
      
      for (const [serverName, serverTools] of Object.entries(allTools)) {
        for (const tool of serverTools) {
          const toolKey = `${serverName}/${tool.name}`
          
          // 分析工具类别和能力
          const { category, capabilities, tags } = this.analyzeTool(tool)
          
          // 注册工具到全局注册表
          this.tools.set(toolKey, {
            server: serverName,
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema,
            capabilities: capabilities,
            examples: await this.loadToolExamples(toolKey),
            usageStats: await this.loadToolStats(toolKey),
            category: category,
            tags: tags
          })
          
          // 更新类别索引
          if (!this.toolCategories.has(category)) {
            this.toolCategories.set(category, new Set())
          }
          this.toolCategories.get(category)!.add(toolKey)
          
          // 更新能力索引
          for (const capability of capabilities) {
            if (!this.toolCapabilities.has(capability)) {
              this.toolCapabilities.set(capability, new Set())
            }
            this.toolCapabilities.get(capability)!.add(toolKey)
          }
          
          logger.debug(`[McpToolRegistry] Registered tool: ${toolKey}`)
        }
      }
      
      logger.info(`[McpToolRegistry] Initialized with ${this.tools.size} tools across ${this.toolCategories.size} categories`)
    } catch (error) {
      logger.error('[McpToolRegistry] Initialization failed', error)
      throw error
    }
  }
  
  /**
   * 分析工具类别和能力
   * 直接使用 MCP 返回的原始描述，不做任何硬编码分析
   * AI 应该自己理解工具描述来做出选择
   */
  private analyzeTool(tool: any): { category: string; capabilities: string[]; tags: string[] } {
    // 直接返回原始信息，不做关键词分析
    return {
      category: 'general',
      capabilities: [],
      tags: []
    }
  }
  
  /**
   * 加载工具使用示例
   */
  private async loadToolExamples(toolKey: string): Promise<ToolExample[]> {
    const cacheKey = `tool_examples_${toolKey}`
    const cached = await cacheService.get<ToolExample[]>(cacheKey)
    
    if (cached) {
      return cached
    }
    
    // 不预置任何示例，让 AI 根据工具描述自行判断
    const examples: ToolExample[] = []
    
    await cacheService.set(cacheKey, examples, { ttl: 3600000 }) // 缓存1小时
    return examples
  }
  
  /**
   * 加载工具使用统计
   */
  private async loadToolStats(toolKey: string): Promise<ToolUsageStats> {
    const cacheKey = `tool_stats_${toolKey}`
    const cached = await cacheService.get<ToolUsageStats>(cacheKey)
    
    if (cached) {
      return cached
    }
    
    // 默认统计信息
    const defaultStats: ToolUsageStats = {
      totalCalls: 0,
      successRate: 0.8, // 默认成功率
      averageConfidence: 0.7,
      lastUsed: new Date(0),
      commonTasks: []
    }
    
    await cacheService.set(cacheKey, defaultStats, { ttl: 1800000 }) // 缓存30分钟
    return defaultStats
  }
  
  /**
   * 获取所有可用工具（用于 AI 决策）
   */
  getAvailableTools(): McpToolDefinition[] {
    return Array.from(this.tools.values())
  }
  
  /**
   * 根据关键词搜索工具
   */
  searchTools(query: string): McpToolDefinition[] {
    const queryLower = query.toLowerCase()
    
    return Array.from(this.tools.values()).filter(tool => {
      return (
        tool.description.toLowerCase().includes(queryLower) ||
        tool.name.toLowerCase().includes(queryLower) ||
        tool.server.toLowerCase().includes(queryLower) ||
        tool.category.toLowerCase().includes(queryLower) ||
        tool.tags.some(tag => tag.toLowerCase().includes(queryLower)) ||
        tool.capabilities.some(cap => cap.toLowerCase().includes(queryLower))
      )
    })
  }
  
  /**
   * 根据类别获取工具
   */
  getToolsByCategory(category: string): McpToolDefinition[] {
    const toolKeys = this.toolCategories.get(category)
    if (!toolKeys) return []
    
    return Array.from(toolKeys).map(key => this.tools.get(key)!).filter(Boolean)
  }
  
  /**
   * 根据能力获取工具
   */
  getToolsByCapability(capability: string): McpToolDefinition[] {
    const toolKeys = this.toolCapabilities.get(capability)
    if (!toolKeys) return []
    
    return Array.from(toolKeys).map(key => this.tools.get(key)!).filter(Boolean)
  }
  
  /**
   * 更新工具使用统计
   */
  async updateToolUsage(toolKey: string, success: boolean, confidence: number, task: string): Promise<void> {
    const tool = this.tools.get(toolKey)
    if (!tool) return
    
    const stats = tool.usageStats
    stats.totalCalls++
    stats.successRate = (stats.successRate * (stats.totalCalls - 1) + (success ? 1 : 0)) / stats.totalCalls
    stats.averageConfidence = (stats.averageConfidence * (stats.totalCalls - 1) + confidence) / stats.totalCalls
    stats.lastUsed = new Date()
    
    if (task && !stats.commonTasks.includes(task)) {
      stats.commonTasks.push(task)
      if (stats.commonTasks.length > 5) {
        stats.commonTasks.shift() // 保持最多5个任务
      }
    }
    
    // 更新缓存
    const cacheKey = `tool_stats_${toolKey}`
    await cacheService.set(cacheKey, stats, { ttl: 1800000 })
  }
  
  /**
   * 调用指定工具
   */
  async callTool(
    server: string,
    tool: string,
    args: Record<string, any>
  ): Promise<any> {
    const toolKey = `${server}/${tool}`
    
    if (!this.tools.has(toolKey)) {
      throw new Error(`工具未找到：${toolKey}`)
    }
    
    return await mcpService.callTool(server, tool, args)
  }
}

export const mcpToolRegistry = new McpToolRegistry()