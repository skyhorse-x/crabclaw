/**
 * 工具注册表实现
 * 统一管理所有可用工具
 */

import { logger } from '../services/logger.service'
import type { ITool, IToolRegistry, ToolMetadata, ToolResult } from './tool.types'

/**
 * 工具注册表类
 */
export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, ITool> = new Map()

  /**
   * 注册工具
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`[ToolRegistry] Tool "${tool.name}" already registered, overwriting`)
    }
    
    this.tools.set(tool.name, tool)
    logger.debug(`[ToolRegistry] Tool registered: ${tool.name}`)
  }

  /**
   * 获取工具
   */
  getTool(name: string): ITool | null {
    return this.tools.get(name) || null
  }

  /**
   * 获取所有工具
   */
  getAllTools(): ITool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取工具列表
   */
  listTools(): ToolMetadata[] {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      category: this.inferCategory(tool.name),
      version: '1.0.0'
    }))
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, input: Record<string, any>): Promise<ToolResult> {
    const tool = this.getTool(name)
    
    if (!tool) {
      const availableTools = this.getAllTools().map(t => t.name).join(', ')
      logger.error(`[ToolRegistry] Tool not found: ${name}`, { 
        availableTools 
      })
      
      return {
        ok: false,
        error: `工具 "${name}" 不存在`,
        message: `可用工具：${availableTools}`
      }
    }

    try {
      logger.debug(`[ToolRegistry] Executing tool: ${name}`, { input })
      
      // 验证输入
      const validationError = this.validateInput(tool, input)
      if (validationError) {
        return validationError
      }

      // 执行工具
      const result = await tool.execute(input)
      
      logger.debug(`[ToolRegistry] Tool execution completed: ${name}`, { 
        success: result.ok 
      })
      
      return result
    } catch (error: any) {
      logger.error(`[ToolRegistry] Tool execution error: ${name}`, error)
      
      return {
        ok: false,
        error: `工具执行失败：${error.message}`
      }
    }
  }

  /**
   * 注销工具
   */
  unregister(name: string): void {
    if (this.tools.delete(name)) {
      logger.debug(`[ToolRegistry] Tool unregistered: ${name}`)
    }
  }

  /**
   * 验证输入参数
   */
  private validateInput(tool: ITool, input: Record<string, any>): ToolResult | null {
    const { inputSchema } = tool
    const required = inputSchema.required || []

    // 检查必填参数
    for (const fieldName of required) {
      if (!(fieldName in input)) {
        return {
          ok: false,
          error: `缺少必填参数：${fieldName}`
        }
      }
    }

    // 检查参数类型
    for (const [fieldName, param] of Object.entries(inputSchema.properties)) {
      const value = input[fieldName]
      
      if (value === undefined || value === null) {
        continue
      }

      const actualType = typeof value
      
      if (param.type === 'number' && actualType !== 'number') {
        return {
          ok: false,
          error: `参数 "${fieldName}" 应该是 number 类型`
        }
      }

      if (param.type === 'string' && actualType !== 'string') {
        return {
          ok: false,
          error: `参数 "${fieldName}" 应该是 string 类型`
        }
      }

      if (param.type === 'boolean' && actualType !== 'boolean') {
        return {
          ok: false,
          error: `参数 "${fieldName}" 应该是 boolean 类型`
        }
      }

      if (param.type === 'object' && actualType !== 'object') {
        return {
          ok: false,
          error: `参数 "${fieldName}" 应该是 object 类型`
        }
      }

      if (param.type === 'array' && !Array.isArray(value)) {
        return {
          ok: false,
          error: `参数 "${fieldName}" 应该是 array 类型`
        }
      }
    }

    return null
  }

  /**
   * 推断工具类别
   */
  private inferCategory(name: string): string {
    if (name.includes('file')) return 'file'
    if (name.includes('shell')) return 'shell'
    if (name.includes('system')) return 'system'
    if (name.includes('mcp')) return 'mcp'
    if (name.includes('web')) return 'web'
    return 'general'
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    totalTools: number
    categories: Record<string, number>
  } {
    const tools = this.getAllTools()
    const categories: Record<string, number> = {}

    for (const tool of tools) {
      const category = this.inferCategory(tool.name)
      categories[category] = (categories[category] || 0) + 1
    }

    return {
      totalTools: tools.length,
      categories
    }
  }
}

/**
 * 创建全局工具注册表单例
 */
export const toolRegistry = new ToolRegistry()
