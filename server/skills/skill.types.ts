/**
 * 技能系统类型定义
 */

/**
 * 技能步骤
 */
export interface SkillStep {
  /**
   * 步骤 ID
   */
  id?: string

  /**
   * 步骤描述
   */
  description?: string

  /**
   * 使用的工具
   */
  tool: string

  /**
   * 工具参数（支持动态变量）
   */
  input?: Record<string, any>

  /**
   * 前置步骤 ID
   */
  dependsOn?: string[]

  /**
   * 是否可选（失败不影响后续）
   */
  optional?: boolean

  /**
   * 重试次数
   */
  retries?: number

  /**
   * 超时时间（毫秒）
   */
  timeout?: number
}

/**
 * 技能定义
 */
export interface Skill {
  /**
   * 技能 ID
   */
  id: string

  /**
   * 技能名称
   */
  name: string

  /**
   * 技能描述
   */
  description?: string

  /**
   * 技能分类
   */
  category?: string

  /**
   * 技能版本
   */
  version?: string

  /**
   * 技能步骤
   */
  steps: SkillStep[]

  /**
   * 输入参数定义
   */
  inputSchema?: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      required?: boolean
      default?: any
    }>
    required?: string[]
  }

  /**
   * 元数据
   */
  metadata?: Record<string, any>
}

/**
 * 技能执行上下文
 */
export interface SkillContext {
  /**
   * 技能 ID
   */
  skillId: string

  /**
   * 输入参数
   */
  input: Record<string, any>

  /**
   * 变量存储
   */
  variables: Map<string, any>

  /**
   * 步骤结果
   */
  stepResults: Map<string, SkillStepResult>

  /**
   * 当前步骤索引
   */
  currentStepIndex: number
}

/**
 * 技能步骤结果
 */
export interface SkillStepResult {
  /**
   * 步骤 ID
   */
  stepId: string

  /**
   * 是否成功
   */
  success: boolean

  /**
   * 工具返回结果
   */
  result?: any

  /**
   * 错误信息
   */
  error?: string

  /**
   * 执行时间（毫秒）
   */
  duration?: number

  /**
   * 重试次数
   */
  retries?: number
}

/**
 * 技能执行结果
 */
export interface SkillResult {
  /**
   * 是否成功
   */
  success: boolean

  /**
   * 技能 ID
   */
  skillId: string

  /**
   * 输出结果
   */
  output?: any

  /**
   * 错误信息
   */
  error?: string

  /**
   * 步骤结果
   */
  stepResults: SkillStepResult[]

  /**
   * 执行时间（毫秒）
   */
  duration: number

  /**
   * 执行的步骤数
   */
  stepsExecuted: number
}

/**
 * 技能注册表接口
 */
export interface ISkillRegistry {
  /**
   * 注册技能
   */
  register(skill: Skill): void

  /**
   * 获取技能
   */
  getSkill(id: string): Skill | null

  /**
   * 获取所有技能
   */
  getAllSkills(): Skill[]

  /**
   * 按分类获取技能
   */
  getSkillsByCategory(category: string): Skill[]

  /**
   * 删除技能
   */
  unregister(id: string): void

  /**
   * 执行技能
   */
  execute(skillId: string, input?: Record<string, any>): Promise<SkillResult>

  /**
   * 检查技能是否存在
   */
  hasSkill(id: string): boolean
}
