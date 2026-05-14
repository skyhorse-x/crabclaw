/**
 * MiniMonkey 多 Agent 协作框架实现
 * @description 基于角色分工的群体智能系统，实现自我规划、执行、审查和学习的完整闭环
 */

import { randomUUID } from 'crypto'

const uuid = () => randomUUID()

// ==================== 类型定义 ====================

export interface TaskDefinition {
  id?: string
  goal: string
  description?: string
  constraints?: TaskConstraints
  metadata?: Record<string, any>
}

export interface TaskConstraints {
  maxSteps?: number
  timeout?: number
  allowedDomains?: string[]
  [key: string]: any
}

export interface ITool {
  name: string
  description: string
  execute: (args: any) => Promise<any>
}

export interface ActionResult {
  success: boolean
  data?: any
  error?: string
  recovery?: RecoveryStrategy
}

export interface RecoveryStrategy {
  type: 'retry' | 'skip' | 'abort' | 'fallback'
  maxRetries?: number
  delay?: number
  fallbackAction?: string
}

export interface HistoryStats {
  totalActions: number
  successfulActions: number
  failedActions: number
  averageDuration: number
  totalDuration: number
}

export interface TaskPlan {
  steps: PlanStep[]
  totalSteps: number
  estimatedTime: number
  riskLevel: 'low' | 'medium' | 'high'
}

export interface PlanStep {
  id: string
  description: string
  actionType: string
  expectedOutput?: string
  dependencies?: string[]
  preconditions?: string[]
  postconditions?: string[]
}

export interface TaskResult {
  taskId: string
  success: boolean
  error?: string
  steps?: number
  duration?: number
}

export interface ILLMService {
  generate: (prompt: string, options?: any) => Promise<any>
  chat: (prompt: string, options?: any) => Promise<string>
}

export interface IMemoryService {
  save: (data: any) => Promise<void>
  searchSimilar: (query: any) => Promise<any[]>
  retrieve: (key: string) => Promise<any>
}

export class ActionHistory {
  private actions: { action: Action; result?: ActionResult; timestamp: number }[] = []

  add(action: Action, result?: ActionResult): void {
    this.actions.push({ action, result, timestamp: Date.now() })
  }

  getActions(): Action[] {
    return this.actions.map(a => a.action)
  }

  getResults(): ActionResult[] {
    return this.actions.filter(a => a.result).map(a => a.result!)
  }

  getStats(): HistoryStats {
    const total = this.actions.length
    const successful = this.actions.filter(a => a.result?.success).length
    const failed = total - successful
    const durations = this.actions.map((a, i) => {
      const next = this.actions[i + 1]
      return next ? next.timestamp - a.timestamp : 0
    })
    const totalDuration = durations.reduce((a, b) => a + b, 0)

    return {
      totalActions: total,
      successfulActions: successful,
      failedActions: failed,
      averageDuration: total > 0 ? totalDuration / total : 0,
      totalDuration
    }
  }

  getDuration(): number {
    if (this.actions.length === 0) return 0
    return this.actions[this.actions.length - 1].timestamp - this.actions[0].timestamp
  }
}

export class EnvironmentState {
  private state: Record<string, any> = {}

  setState(key: string, value: any): void {
    this.state[key] = value
  }

  getState(): Record<string, any> {
    return { ...this.state }
  }

  get(key: string): any {
    return this.state[key]
  }
}

/**
 * Agent 角色枚举
 */
export enum AgentRole {
  PLANNER = 'planner',        // 规划者 - 负责任务拆解和路径规划
  EXECUTOR = 'executor',      // 执行者 - 负责具体操作执行
  REVIEWER = 'reviewer',      // 审查者 - 负责质量审查和风险评估
  LEARNER = 'learner',        // 学习者 - 负责经验总结和优化建议
  COORDINATOR = 'coordinator' // 协调者 - 负责任务分配和进度管理
}

/**
 * 思考结果
 */
export interface Thought {
  type: 'plan' | 'action' | 'review' | 'learn'
  content: any
  confidence: number
  reasoning?: string
  alternatives?: any[]
}

/**
 * 动作定义
 */
export interface Action {
  id: string
  type: ActionType
  payload: any
  timestamp: number
  agentId: string
}

export enum ActionType {
  MOUSE_CLICK = 'mouse_click',
  KEYBOARD_INPUT = 'keyboard_input',
  NAVIGATE = 'navigate',
  EXTRACT_DATA = 'extract_data',
  WAIT = 'wait',
  CONDITIONAL = 'conditional',
  LOOP = 'loop'
}

export interface BridgeService {
  mouse: {
    click: (x: number, y: number) => Promise<ActionResult>
  }
  keyboard: {
    type: (text: string) => Promise<ActionResult>
  }
  browser: {
    navigate: (url: string) => Promise<ActionResult>
  }
}

/**
 * Agent 上下文
 */
export class AgentContext {
  taskId: string
  task: TaskDefinition
  constraints: TaskConstraints
  tools: ITool[]
  history: ActionHistory
  environment: EnvironmentState
  sharedMemory: Map<string, any>
  bridge?: BridgeService
  
  constructor(taskId: string, task: TaskDefinition) {
    this.taskId = taskId
    this.task = task
    this.constraints = {
      maxSteps: 50,
      timeout: 300000, // 5 分钟
      allowedDomains: ['*']
    }
    this.tools = []
    this.history = new ActionHistory()
    this.environment = new EnvironmentState()
    this.sharedMemory = new Map()
  }
  
  /**
   * 记录动作到历史
   */
  recordAction(action: Action, result?: ActionResult): void {
    this.history.add(action, result)
  }
  
  /**
   * 获取历史统计信息
   */
  getHistoryStats(): HistoryStats {
    return this.history.getStats()
  }
}

// ==================== Agent 基类 ====================

/**
 * Agent 抽象基类
 */
export abstract class BaseAgent {
  readonly id: string
  readonly role: AgentRole
  protected llm?: ILLMService
  protected memory?: IMemoryService
  
  constructor(id: string, role: AgentRole) {
    this.id = id
    this.role = role
  }
  
  /**
   * 思考过程（模板方法）
   */
  async think(context: AgentContext): Promise<Thought> {
    try {
      const perception = await this.perceive(context)
      const analysis = await this.analyze(perception, context)
      const decision = await this.decide(analysis, context)
      const confidence = await this.evaluateConfidence(decision, context)
      
      return {
        type: this.getThoughtType(),
        content: decision,
        confidence,
        reasoning: analysis.reasoning
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Agent ${this.id} 思考失败：${errorMessage}`)
    }
  }
  
  /**
   * 执行动作（模板方法）
   */
  async act(thought: Thought, context: AgentContext): Promise<ActionResult> {
    try {
      // 1. 准备动作
      const action = await this.prepareAction(thought, context)
      
      // 2. 执行动作
      const result = await this.executeAction(action, context)
      
      // 3. 验证结果
      await this.verifyResult(result, context)
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: errorMessage,
        recovery: await this.getRecoveryStrategy()
      }
    }
  }
  
  /**
   * 学习反馈
   */
  async learn(result: ActionResult, context: AgentContext): Promise<void> {
    if (result.success) {
      await this.recordSuccess(result, context)
    } else {
      await this.recordFailure(result, context)
    }
  }
  
  // === 子类需要实现的抽象方法 ===
  
  /**
   * 感知环境
   */
  protected abstract perceive(context: AgentContext): Promise<any>
  
  /**
   * 分析情况
   */
  protected abstract analyze(perception: any, context: AgentContext): Promise<any>
  
  /**
   * 生成决策
   */
  protected abstract decide(analysis: any, context: AgentContext): Promise<any>
  
  /**
   * 评估置信度
   */
  protected abstract evaluateConfidence(decision: any, context: AgentContext): Promise<number>
  
  /**
   * 准备动作
   */
  protected abstract prepareAction(thought: Thought, context: AgentContext): Promise<Action>
  
  /**
   * 执行动作
   */
  protected abstract executeAction(action: Action, context: AgentContext): Promise<ActionResult>
  
  /**
   * 获取思考类型
   */
  protected abstract getThoughtType(): Thought['type']
  
  // === 辅助方法 ===
  
  /**
   * 验证结果
   */
  protected async verifyResult(result: ActionResult, _context: AgentContext): Promise<void> {
    if (!result.success) {
      throw new Error(`动作执行失败：${result.error}`)
    }
  }
  
  /**
   * 获取恢复策略
   */
  protected async getRecoveryStrategy(): Promise<RecoveryStrategy> {
    return {
      type: 'retry',
      maxRetries: 3,
      delay: 1000
    }
  }
  
  /**
   * 记录成功
   */
  protected async recordSuccess(result: ActionResult, context: AgentContext): Promise<void> {
    if (this.memory) {
      await this.memory.save({
        type: 'success',
        taskId: context.taskId,
        data: result,
        timestamp: Date.now()
      })
    }
  }
  
  /**
   * 记录失败
   */
  protected async recordFailure(result: ActionResult, context: AgentContext): Promise<void> {
    if (this.memory) {
      await this.memory.save({
        type: 'failure',
        taskId: context.taskId,
        data: result,
        timestamp: Date.now()
      })
    }
  }
}

// ==================== 具体 Agent 实现 ====================

/**
 * 规划者 Agent
 */
export class PlannerAgent extends BaseAgent {
  constructor(id: string) {
    super(id, AgentRole.PLANNER)
  }
  
  protected async perceive(context: AgentContext): Promise<any> {
    return {
      task: context.task,
      availableTools: context.tools.map(t => t.name),
      environment: context.environment.getState()
    }
  }
  
  protected async analyze(perception: any, _context: AgentContext): Promise<any> {
    const defaultSteps = [
      { description: '分析任务目标', actionType: 'analyze', expectedOutput: '任务分析结果' },
      { description: '执行主要操作', actionType: 'execute', expectedOutput: '操作结果' },
      { description: '验证结果', actionType: 'verify', expectedOutput: '验证报告' }
    ]
    
    return {
      taskType: this.extractTaskType(perception.task),
      complexity: this.calculateComplexity(perception.task),
      steps: this.llm ? await this.generateStepsWithLLM(perception) : defaultSteps,
      risks: [],
      reasoning: '任务分析完成'
    }
  }
  
  private async generateStepsWithLLM(perception: any): Promise<any[]> {
    if (!this.llm) return []
    const prompt = `
      任务分析：
      - 目标：${perception.task.goal}
      - 约束：${JSON.stringify(perception.task.constraints)}
      - 可用工具：${perception.availableTools.join(', ')}
      - 当前环境：${JSON.stringify(perception.environment)}
      
      请分析并生成执行步骤。
    `
    const analysis = await this.llm.generate(prompt)
    return analysis.steps || []
  }
  
  protected async decide(analysis: any, _context: AgentContext): Promise<any> {
    const plan: TaskPlan = {
      steps: analysis.steps.map((step: any, index: number) => ({
        id: `step_${index}`,
        description: step.description,
        actionType: step.actionType,
        expectedOutput: step.expectedOutput,
        dependencies: step.dependencies || []
      })),
      totalSteps: analysis.steps.length,
      estimatedTime: analysis.steps.length * 5000,
      riskLevel: analysis.risks.length > 0 ? 'medium' : 'low'
    }
    
    return plan
  }
  
  protected async evaluateConfidence(_decision: any, _context: AgentContext): Promise<number> {
    if (this.memory) {
      const similarTasks = await this.memory.searchSimilar({})
      const successRate = similarTasks.length > 0 
        ? similarTasks.filter((t: any) => t.success).length / similarTasks.length
        : 0
      return 0.5 + successRate * 0.5
    }
    return 0.7
  }
  
  protected async prepareAction(thought: Thought, _context: AgentContext): Promise<Action> {
    return {
      id: uuid(),
      type: ActionType.NAVIGATE,
      payload: thought.content.steps[0],
      timestamp: Date.now(),
      agentId: this.id
    }
  }
  
  protected async executeAction(action: Action, _context: AgentContext): Promise<ActionResult> {
    return {
      success: true,
      data: action.payload
    }
  }
  
  protected getThoughtType(): Thought['type'] {
    return 'plan'
  }
  
  // === 辅助方法 ===
  
  private extractTaskType(task: TaskDefinition): string {
    // 根据任务描述提取类型
    if (task.goal.includes('点击')) return 'click'
    if (task.goal.includes('输入')) return 'input'
    if (task.goal.includes('提取')) return 'extraction'
    return 'general'
  }
  
  private calculateComplexity(task: TaskDefinition): number {
    // 简单复杂度计算
    const keywords = ['如果', '循环', '多个', '条件', '判断']
    let complexity = 1
    for (const keyword of keywords) {
      if (task.goal.includes(keyword)) complexity++
    }
    return complexity
  }
}

/**
 * 执行者 Agent
 */
export class ExecutorAgent extends BaseAgent {
  constructor(id: string) {
    super(id, AgentRole.EXECUTOR)
  }
  
  protected async perceive(context: AgentContext): Promise<any> {
    return {
      currentPlan: context.sharedMemory.get('current_plan'),
      currentStep: context.sharedMemory.get('current_step'),
      environment: context.environment.getState()
    }
  }
  
  protected async analyze(perception: any, _context: AgentContext): Promise<any> {
    const step = perception.currentStep
    
    return {
      stepType: step.actionType,
      requiredTools: this.getRequiredTools(step),
      preconditions: step.preconditions || [],
      postconditions: step.postconditions || []
    }
  }
  
  protected async decide(analysis: any, _context: AgentContext): Promise<any> {
    return {
      action: analysis.stepType,
      parameters: analysis,
      sequence: this.buildActionSequence(analysis)
    }
  }
  
  protected async evaluateConfidence(_decision: any, context: AgentContext): Promise<number> {
    const availableTools = context.tools.map(t => t.name)
    const requiredTools = this.getRequiredTools(context.sharedMemory.get('current_step'))
    
    const hasAllTools = requiredTools.every(t => availableTools.includes(t))
    return hasAllTools ? 0.9 : 0.5
  }
  
  protected async prepareAction(thought: Thought, _context: AgentContext): Promise<Action> {
    return {
      id: uuid(),
      type: this.mapToActionType(thought.content.action),
      payload: thought.content.parameters,
      timestamp: Date.now(),
      agentId: this.id
    }
  }
  
  protected async executeAction(action: Action, context: AgentContext): Promise<ActionResult> {
    if (!context.bridge) {
      return {
        success: false,
        error: 'Bridge service not available'
      }
    }
    
    const bridge = context.bridge
    
    switch (action.type) {
      case ActionType.MOUSE_CLICK:
        return await bridge.mouse.click(action.payload.x, action.payload.y)
      case ActionType.KEYBOARD_INPUT:
        return await bridge.keyboard.type(action.payload.text)
      case ActionType.NAVIGATE:
        return await bridge.browser.navigate(action.payload.url)
      default:
        throw new Error(`未知动作类型：${action.type}`)
    }
  }
  
  protected getThoughtType(): Thought['type'] {
    return 'action'
  }
  
  // === 辅助方法 ===
  
  private getRequiredTools(step: any): string[] {
    const toolMapping: Record<string, string[]> = {
      'click': ['mouse'],
      'type': ['keyboard'],
      'navigate': ['browser'],
      'extract': ['screen', 'ocr']
    }
    return toolMapping[step.actionType] || []
  }
  
  private mapToActionType(type: string): ActionType {
    const mapping: Record<string, ActionType> = {
      'click': ActionType.MOUSE_CLICK,
      'type': ActionType.KEYBOARD_INPUT,
      'navigate': ActionType.NAVIGATE
    }
    return mapping[type] || ActionType.WAIT
  }
  
  private buildActionSequence(_analysis: any): Action[] {
    return []
  }
}

/**
 * 审查者 Agent
 */
export class ReviewerAgent extends BaseAgent {
  constructor(id: string) {
    super(id, AgentRole.REVIEWER)
  }
  
  protected async perceive(context: AgentContext): Promise<any> {
    return {
      plan: context.sharedMemory.get('current_plan'),
      executedSteps: context.history.getActions(),
      results: context.history.getResults()
    }
  }
  
  protected async analyze(perception: any, _context: AgentContext): Promise<any> {
    const quality = this.calculateQuality(perception.results)
    const deviation = perception.plan ? this.calculateDeviation(perception.plan, perception.executedSteps) : 0
    const llmResult = this.llm ? await this.generateReviewWithLLM(perception) : { risks: [], suggestions: [] }
    
    return {
      quality,
      deviation,
      risks: llmResult.risks,
      suggestions: llmResult.suggestions
    }
  }
  
  private async generateReviewWithLLM(perception: any): Promise<{ risks: any[], suggestions: any[] }> {
    if (!this.llm) return { risks: [], suggestions: [] }
    const prompt = `
      审查任务执行：
      - 计划步骤数：${perception.plan.totalSteps}
      - 已执行步骤：${perception.executedSteps.length}
      - 成功次数：${perception.results.filter((r: any) => r.success).length}
      - 失败次数：${perception.results.filter((r: any) => !r.success).length}
      
      请评估并返回风险和建议。
    `
    const review = await this.llm.generate(prompt)
    return {
      risks: review.risks || [],
      suggestions: review.suggestions || []
    }
  }
  
  protected async decide(analysis: any, _context: AgentContext): Promise<any> {
    return {
      passed: analysis.quality >= 0.7 && analysis.deviation < 0.3,
      quality: analysis.quality,
      issues: analysis.risks,
      recommendations: analysis.suggestions
    }
  }
  
  protected async evaluateConfidence(_decision: any, context: AgentContext): Promise<number> {
    const hasEnoughData = context.history.getActions().length > 0
    return hasEnoughData ? 0.8 : 0.6
  }
  
  protected async prepareAction(thought: Thought, _context: AgentContext): Promise<Action> {
    return {
      id: uuid(),
      type: ActionType.CONDITIONAL,
      payload: thought.content,
      timestamp: Date.now(),
      agentId: this.id
    }
  }
  
  protected async executeAction(action: Action, _context: AgentContext): Promise<ActionResult> {
    return {
      success: action.payload.passed,
      data: action.payload
    }
  }
  
  protected getThoughtType(): Thought['type'] {
    return 'review'
  }
  
  // === 辅助方法 ===
  
  private calculateQuality(results: ActionResult[]): number {
    const successful = results.filter(r => r.success).length
    return results.length > 0 ? successful / results.length : 0
  }
  
  private calculateDeviation(plan: TaskPlan, executed: Action[]): number {
    // 计算执行偏离度
    return Math.abs(plan.totalSteps - executed.length) / plan.totalSteps
  }
}

/**
 * 协调者 Agent
 */
export class CoordinatorAgent extends BaseAgent {
  constructor(id: string) {
    super(id, AgentRole.COORDINATOR)
  }
  
  protected async perceive(_context: AgentContext): Promise<any> {
    return {
      task: {},
      history: [],
      currentState: {}
    }
  }
  
  protected async analyze(perception: any, _context: AgentContext): Promise<any> {
    return {
      taskProgress: perception.history.length,
      state: perception.currentState,
      reasoning: 'Coordinator analysis'
    }
  }
  
  protected async decide(_analysis: any, _context: AgentContext): Promise<any> {
    return {
      continue: true,
      nextAgent: AgentRole.EXECUTOR,
      reasoning: 'Continue execution'
    }
  }
  
  protected async evaluateConfidence(_decision: any, _context: AgentContext): Promise<number> {
    return 0.8
  }
  
  protected async prepareAction(thought: Thought, _context: AgentContext): Promise<Action> {
    return {
      id: uuid(),
      type: ActionType.WAIT,
      payload: thought.content,
      timestamp: Date.now(),
      agentId: this.id
    }
  }
  
  protected async executeAction(action: Action, _context: AgentContext): Promise<ActionResult> {
    return {
      success: true,
      data: action.payload
    }
  }
  
  protected getThoughtType(): Thought['type'] {
    return 'action'
  }
}

// ==================== 协作编排器 ====================

/**
 * Agent 协作编排器
 */
export class AgentOrchestrator {
  private agents: Map<AgentRole, BaseAgent> = new Map()
  
  constructor() {}
  
  /**
   * 注册 Agent
   */
  registerAgent(role: AgentRole, agent: BaseAgent): void {
    this.agents.set(role, agent)
  }
  
  /**
   * 执行协作流程
   */
  async collaborate(task: TaskDefinition): Promise<TaskResult> {
    const context = new AgentContext(uuid(), task)
    
    try {
      // 1. 规划阶段
      const planner = this.agents.get(AgentRole.PLANNER)!
      const plan = await planner.think(context)
      
      // 2. 审查计划
      const reviewer = this.agents.get(AgentRole.REVIEWER)!
      context.sharedMemory.set('current_plan', plan.content)
      const planReview = await reviewer.think(context)
      
      if (!planReview.content.passed) {
        context.sharedMemory.set('plan_rejected', true)
        return this.collaborate(task)
      }
      
      // 3. 执行阶段
      const executor = this.agents.get(AgentRole.EXECUTOR)!
      
      for (const step of plan.content.steps) {
        context.sharedMemory.set('current_step', step)
        
        const result = await executor.act(await executor.think(context), context)
        context.recordAction({ id: uuid(), type: ActionType.WAIT, payload: {}, timestamp: Date.now(), agentId: executor.id }, result)
        
        if (result.success) {
          const stepReview = await reviewer.think(context)
          if (!stepReview.content.passed) {
            throw new Error(`步骤 ${step.id} 执行质量不达标`)
          }
        }
      }
      
      // 4. 学习总结
      const learner = this.agents.get(AgentRole.LEARNER)
      if (learner) {
        await learner.learn({ success: true }, context)
      }
      
      return {
        taskId: context.taskId,
        success: true,
        steps: plan.content.steps.length,
        duration: context.history.getDuration()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      const learner = this.agents.get(AgentRole.LEARNER)
      if (learner) {
        await learner.learn({ success: false, error: errorMessage }, context)
      }
      
      return {
        taskId: context.taskId,
        success: false,
        error: errorMessage,
        steps: context.history.getActions().length
      }
    }
  }
}
