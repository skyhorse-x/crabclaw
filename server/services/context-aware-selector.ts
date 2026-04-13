/**
 * 上下文感知工具选择器
 * 基于任务上下文、历史记录和约束条件智能选择 MCP 工具
 */

import { mcpToolRegistry, type McpToolDefinition, type ToolSelectionResult } from './mcp-tool-registry'
import { logger } from './logger.service'

/**
 * 选择上下文
 */
interface SelectionContext {
  /**
   * 用户任务描述
   */
  task: string
  
  /**
   * 任务类型
   */
  taskType?: 'read' | 'write' | 'execute' | 'navigate' | 'analyze' | 'transform'
  
  /**
   * 数据格式
   */
  dataFormat?: 'json' | 'text' | 'file' | 'database' | 'api'
  
  /**
   * 目标系统
   */
  targetSystem?: 'filesystem' | 'browser' | 'memory' | 'shell' | 'database'
  
  /**
   * 约束条件
   */
  constraints?: {
    security?: string[]
    performance?: string[]
    complexity?: 'simple' | 'medium' | 'complex'
    timeLimit?: number // 毫秒
  }
  
  /**
   * 历史记录
   */
  history?: {
    previousTools: Array<{
      server: string
      tool: string
      success: boolean
      confidence: number
      timestamp: Date
    }>
    similarTasks: Array<{
      task: string
      tools: Array<{
        server: string
        tool: string
        success: boolean
      }>
    }>
  }
}

/**
 * 工具匹配分数
 */
interface ToolMatchScore {
  tool: McpToolDefinition
  score: number
  reasoning: string
  parameters?: Record<string, any>
}

/**
 * 上下文感知工具选择器
 */
export class ContextAwareSelector {
  
  /**
   * 基于上下文选择工具
   */
  async selectTool(context: SelectionContext): Promise<ToolSelectionResult> {
    logger.debug('[ContextAwareSelector] Selecting tool with context', { 
      task: context.task,
      taskType: context.taskType 
    })
    
    // 获取所有可用工具
    const availableTools = mcpToolRegistry.getAvailableTools()
    
    // 计算每个工具的匹配分数
    const scoredTools = await this.scoreTools(availableTools, context)
    
    // 选择最佳工具
    const bestMatch = this.selectBestTool(scoredTools, context)
    
    // 构建选择结果
    const selectionResult: ToolSelectionResult = {
      selectedTool: {
        server: bestMatch.tool.server,
        tool: bestMatch.tool.name
      },
      confidence: bestMatch.score,
      reasoning: bestMatch.reasoning,
      parameters: bestMatch.parameters || {}
    }
    
    // 添加备选工具
    const alternatives = scoredTools
      .slice(1, 4) // 取前3个备选
      .filter(alt => alt.score > 0.3) // 只保留有意义的备选
      .map(alt => ({
        server: alt.tool.server,
        tool: alt.tool.name,
        confidence: alt.score,
        reasoning: alt.reasoning
      }))
    
    if (alternatives.length > 0) {
      selectionResult.alternativeTools = alternatives
    }
    
    logger.info('[ContextAwareSelector] Tool selection completed', {
      selectedTool: selectionResult.selectedTool,
      confidence: selectionResult.confidence,
      alternativesCount: alternatives.length
    })
    
    return selectionResult
  }
  
  /**
   * 计算工具匹配分数
   */
  private async scoreTools(
    tools: McpToolDefinition[], 
    context: SelectionContext
  ): Promise<ToolMatchScore[]> {
    const scoredTools: ToolMatchScore[] = []
    
    for (const tool of tools) {
      let score = 0
      let reasoning = ''
      let parameters: Record<string, any> = {}
      
      // 1. 任务类型匹配
      score += this.scoreTaskTypeMatch(tool, context, reasoning)
      
      // 2. 数据格式匹配
      score += this.scoreDataFormatMatch(tool, context, reasoning)
      
      // 3. 目标系统匹配
      score += this.scoreTargetSystemMatch(tool, context, reasoning)
      
      // 4. 约束条件匹配
      score += this.scoreConstraintsMatch(tool, context, reasoning)
      
      // 5. 历史记录匹配
      score += await this.scoreHistoryMatch(tool, context, reasoning)
      
      // 6. 工具使用统计
      score += this.scoreUsageStats(tool, reasoning)
      
      // 7. 参数复杂度
      score += this.scoreParameterComplexity(tool, context, reasoning, parameters)
      
      // 归一化分数到 0-1 范围
      score = Math.min(Math.max(score, 0), 1)
      
      scoredTools.push({
        tool,
        score,
        reasoning: reasoning || '基于综合匹配算法',
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined
      })
    }
    
    // 按分数排序
    return scoredTools.sort((a, b) => b.score - a.score)
  }
  
  /**
   * 任务类型匹配评分
   */
  private scoreTaskTypeMatch(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    reasoning: string
  ): number {
    if (!context.taskType) return 0
    
    let score = 0
    
    // 基于工具名称和描述匹配任务类型
    const toolName = tool.name.toLowerCase()
    const toolDesc = tool.description.toLowerCase()
    
    switch (context.taskType) {
      case 'read':
        if (toolName.includes('read') || toolName.includes('get') || 
            toolDesc.includes('read') || toolDesc.includes('get')) {
          score += 0.3
          reasoning += '任务类型匹配(读取); '
        }
        break
        
      case 'write':
        if (toolName.includes('write') || toolName.includes('create') || toolName.includes('save') ||
            toolDesc.includes('write') || toolDesc.includes('create') || toolDesc.includes('save')) {
          score += 0.3
          reasoning += '任务类型匹配(写入); '
        }
        break
        
      case 'execute':
        if (toolName.includes('execute') || toolName.includes('run') || toolName.includes('command') ||
            toolDesc.includes('execute') || toolDesc.includes('run') || toolDesc.includes('command')) {
          score += 0.3
          reasoning += '任务类型匹配(执行); '
        }
        break
        
      case 'navigate':
        if (toolName.includes('navigate') || toolName.includes('browse') || toolName.includes('click') ||
            toolDesc.includes('navigate') || toolDesc.includes('browse') || toolDesc.includes('click')) {
          score += 0.3
          reasoning += '任务类型匹配(导航); '
        }
        break
    }
    
    return score
  }
  
  /**
   * 数据格式匹配评分
   */
  private scoreDataFormatMatch(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    reasoning: string
  ): number {
    if (!context.dataFormat) return 0
    
    let score = 0
    const toolDesc = tool.description.toLowerCase()
    
    switch (context.dataFormat) {
      case 'json':
        if (toolDesc.includes('json')) {
          score += 0.2
          reasoning += '数据格式匹配(JSON); '
        }
        break
        
      case 'text':
        if (toolDesc.includes('text') || toolDesc.includes('string')) {
          score += 0.2
          reasoning += '数据格式匹配(文本); '
        }
        break
        
      case 'file':
        if (toolDesc.includes('file')) {
          score += 0.2
          reasoning += '数据格式匹配(文件); '
        }
        break
        
      case 'database':
        if (toolDesc.includes('database') || toolDesc.includes('db') || toolDesc.includes('sql')) {
          score += 0.2
          reasoning += '数据格式匹配(数据库); '
        }
        break
        
      case 'api':
        if (toolDesc.includes('api') || toolDesc.includes('http') || toolDesc.includes('rest')) {
          score += 0.2
          reasoning += '数据格式匹配(API); '
        }
        break
    }
    
    return score
  }
  
  /**
   * 目标系统匹配评分
   */
  private scoreTargetSystemMatch(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    reasoning: string
  ): number {
    if (!context.targetSystem) return 0
    
    let score = 0
    
    if (tool.server === context.targetSystem) {
      score += 0.3
      reasoning += `目标系统匹配(${context.targetSystem}); `
    }
    
    // 基于工具类别匹配
    if (tool.category === context.targetSystem) {
      score += 0.2
      reasoning += `类别匹配(${context.targetSystem}); `
    }
    
    return score
  }
  
  /**
   * 约束条件匹配评分
   */
  private scoreConstraintsMatch(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    reasoning: string
  ): number {
    if (!context.constraints) return 0
    
    let score = 0
    
    // 复杂度约束
    if (context.constraints.complexity === 'simple') {
      if (this.isSimpleTool(tool)) {
        score += 0.1
        reasoning += '复杂度匹配(简单); '
      }
    }
    
    // 时间限制
    if (context.constraints.timeLimit) {
      if (this.isFastTool(tool)) {
        score += 0.1
        reasoning += '时间约束匹配; '
      }
    }
    
    return score
  }
  
  /**
   * 历史记录匹配评分
   */
  private async scoreHistoryMatch(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    reasoning: string
  ): Promise<number> {
    if (!context.history) return 0
    
    let score = 0
    
    // 检查历史使用记录
    const previousUsage = context.history.previousTools.find(pt => 
      pt.server === tool.server && pt.tool === tool.name
    )
    
    if (previousUsage) {
      if (previousUsage.success) {
        score += 0.2
        reasoning += '历史使用成功; '
      } else {
        score -= 0.1
        reasoning += '历史使用失败; '
      }
    }
    
    // 检查相似任务
    for (const similarTask of context.history.similarTasks) {
      const usedTool = similarTask.tools.find(st => 
        st.server === tool.server && st.tool === tool.name
      )
      
      if (usedTool) {
        if (usedTool.success) {
          score += 0.15
          reasoning += '相似任务成功; '
        }
      }
    }
    
    return score
  }
  
  /**
   * 使用统计评分
   */
  private scoreUsageStats(tool: McpToolDefinition, reasoning: string): number {
    let score = 0
    
    // 基于成功率评分
    if (tool.usageStats.successRate > 0.8) {
      score += 0.1
      reasoning += '高成功率; '
    } else if (tool.usageStats.successRate < 0.5) {
      score -= 0.05
      reasoning += '低成功率; '
    }
    
    // 基于使用频率评分（适度使用）
    if (tool.usageStats.totalCalls > 10 && tool.usageStats.totalCalls < 100) {
      score += 0.05
      reasoning += '适度使用; '
    }
    
    return score
  }
  
  /**
   * 参数复杂度评分
   */
  private scoreParameterComplexity(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    reasoning: string,
    parameters: Record<string, any>
  ): number {
    let score = 0
    
    // 参数数量评分
    const paramCount = Object.keys(tool.inputSchema.properties || {}).length
    
    if (paramCount <= 2) {
      score += 0.05
      reasoning += '参数简单; '
    } else if (paramCount > 5) {
      score -= 0.02
      reasoning += '参数复杂; '
    }
    
    // 尝试推断参数值
    this.inferParameters(tool, context, parameters)
    
    return score
  }
  
  /**
   * 推断参数值
   */
  private inferParameters(
    tool: McpToolDefinition, 
    context: SelectionContext, 
    parameters: Record<string, any>
  ): void {
    const task = context.task.toLowerCase()
    
    // 基于任务描述推断参数
    if (tool.name === 'read_file') {
      if (task.includes('config') || task.includes('设置')) {
        parameters.path = './config.json'
      } else if (task.includes('log') || task.includes('日志')) {
        parameters.path = './server/logs/app.log'
      }
    }
    
    if (tool.name === 'navigate') {
      // 从任务中提取 URL
      const urlMatch = task.match(/(https?:\/\/[^\s]+)/)
      if (urlMatch) {
        parameters.url = urlMatch[1]
      } else if (task.includes('google') || task.includes('谷歌')) {
        parameters.url = 'https://google.com'
      }
    }
  }
  
  /**
   * 选择最佳工具
   */
  private selectBestTool(scoredTools: ToolMatchScore[], context: SelectionContext): ToolMatchScore {
    if (scoredTools.length === 0) {
      throw new Error('没有可用的工具')
    }
    
    const bestTool = scoredTools[0]
    
    // 如果最佳工具分数过低，考虑是否需要人工干预
    if (bestTool.score < 0.3) {
      logger.warn('[ContextAwareSelector] Low confidence tool selection', {
        bestScore: bestTool.score,
        task: context.task
      })
    }
    
    return bestTool
  }
  
  /**
   * 判断是否为简单工具
   */
  private isSimpleTool(tool: McpToolDefinition): boolean {
    const paramCount = Object.keys(tool.inputSchema.properties || {}).length
    return paramCount <= 3 && tool.usageStats.successRate > 0.8
  }
  
  /**
   * 判断是否为快速工具
   */
  private isFastTool(tool: McpToolDefinition): boolean {
    // 基于工具类别判断
    const fastCategories = ['filesystem', 'memory', 'browser']
    return fastCategories.includes(tool.category)
  }
}

export const contextAwareSelector = new ContextAwareSelector()
