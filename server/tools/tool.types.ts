/**
 * 工具系统接口和类型定义
 */

/**
 * 工具参数定义
 */
export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  default?: any
  enum?: any[]
}

/**
 * 工具输入 Schema
 */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, ToolParameter>
  required?: string[]
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  ok: boolean
  data?: any
  error?: string
  message?: string
}

/**
 * 工具定义接口
 */
export interface ITool {
  /**
   * 工具名称
   */
  readonly name: string

  /**
   * 工具描述
   */
  readonly description: string

  /**
   * 输入参数 Schema
   */
  readonly inputSchema: ToolInputSchema

  /**
   * 执行工具
   */
  execute(input: Record<string, any>): Promise<ToolResult>
}

/**
 * 工具元数据
 */
export interface ToolMetadata {
  name: string
  description: string
  category: string
  tags?: string[]
  version?: string
  author?: string
}

/**
 * 工具注册表
 */
export interface IToolRegistry {
  /**
   * 注册工具
   */
  register(tool: ITool): void

  /**
   * 获取工具
   */
  getTool(name: string): ITool | null

  /**
   * 获取所有工具
   */
  getAllTools(): ITool[]

  /**
   * 获取工具列表
   */
  listTools(): ToolMetadata[]

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean

  /**
   * 执行工具
   */
  executeTool(name: string, input: Record<string, any>): Promise<ToolResult>

  /**
   * 注销工具
   */
  unregister(name: string): void
}
