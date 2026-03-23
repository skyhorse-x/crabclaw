/**
 * 技能执行器
 * 负责执行技能步骤
 */

import { createId } from '../shared/utils'
import { logger } from '../services/logger.service'
import { toolRegistry } from '../tools/tool-registry'
import type { Skill, SkillStep, SkillContext, SkillResult, SkillStepResult } from './skill.types'

/**
 * 技能执行器类
 */
export class SkillExecutor {
  /**
   * 执行技能
   */
  async execute(skill: Skill, input: Record<string, any> = {}): Promise<SkillResult> {
    const startTime = Date.now()
    
    logger.info('[SkillExecutor] Executing skill', { 
      skillId: skill.id, 
      skillName: skill.name,
      stepsCount: skill.steps.length 
    })

    // 创建执行上下文
    const context: SkillContext = {
      skillId: skill.id,
      input,
      variables: new Map(),
      stepResults: new Map(),
      currentStepIndex: 0
    }

    // 验证输入
    if (skill.inputSchema) {
      const validationError = this.validateInput(skill, input)
      if (validationError) {
        return {
          success: false,
          skillId: skill.id,
          error: validationError,
          stepResults: [],
          duration: Date.now() - startTime,
          stepsExecuted: 0
        }
      }
    }

    const stepResults: SkillStepResult[] = []
    let stepsExecuted = 0

    // 执行步骤
    for (let i = 0; i < skill.steps.length; i++) {
      const step = skill.steps[i]
      context.currentStepIndex = i

      logger.debug('[SkillExecutor] Executing step', { 
        stepId: step.id || i, 
        tool: step.tool,
        index: i 
      })

      // 检查依赖
      if (step.dependsOn && step.dependsOn.length > 0) {
        const depsMet = step.dependsOn.every(depId => {
          const result = context.stepResults.get(depId)
          return result && result.success
        })

        if (!depsMet) {
          logger.warn('[SkillExecutor] Step dependencies not met', { stepId: step.id })
          
          const stepResult: SkillStepResult = {
            stepId: step.id || `step-${i}`,
            success: false,
            error: '依赖步骤未完成',
            duration: 0
          }
          
          stepResults.push(stepResult)
          context.stepResults.set(step.id || `step-${i}`, stepResult)
          continue
        }
      }

      // 执行步骤
      const stepResult = await this.executeStep(step, context)
      stepResults.push(stepResult)
      context.stepResults.set(step.id || `step-${i}`, stepResult)
      stepsExecuted++

      // 检查是否需要停止
      if (!stepResult.success && !step.optional) {
        logger.error('[SkillExecutor] Step failed, stopping execution', { 
          stepId: step.id,
          error: stepResult.error 
        })

        return {
          success: false,
          skillId: skill.id,
          error: `步骤 ${step.id || i} 执行失败：${stepResult.error}`,
          output: this.extractOutput(context),
          stepResults,
          duration: Date.now() - startTime,
          stepsExecuted
        }
      }
    }

    const duration = Date.now() - startTime
    
    logger.info('[SkillExecutor] Skill execution completed', { 
      skillId: skill.id,
      success: true,
      duration,
      stepsExecuted 
    })

    return {
      success: true,
      skillId: skill.id,
      output: this.extractOutput(context),
      stepResults,
      duration,
      stepsExecuted
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: SkillStep, context: SkillContext): Promise<SkillStepResult> {
    const stepId = step.id || createId('step')
    const startTime = Date.now()
    let retries = 0
    const maxRetries = step.retries || 0

    // 准备工具参数
    const toolInput = await this.prepareToolInput(step.input || {}, context)

    while (retries <= maxRetries) {
      try {
        // 执行工具
        const result = await toolRegistry.executeTool(step.tool, toolInput)
        const duration = Date.now() - startTime

        if (result.ok) {
          // 保存结果到变量
          if (result.data) {
            context.variables.set(`step.${stepId}.result`, result.data)
          }

          return {
            stepId,
            success: true,
            result: result.data,
            duration
          }
        } else {
          // 工具执行失败
          logger.warn('[SkillExecutor] Tool execution failed', { 
            stepId, 
            tool: step.tool,
            error: result.error,
            retry: retries 
          })

          if (retries >= maxRetries) {
            return {
              stepId,
              success: false,
              error: result.error,
              duration,
              retries
            }
          }

          retries++
        }
      } catch (error: any) {
        logger.error('[SkillExecutor] Step execution error', error)
        
        if (retries >= maxRetries) {
          return {
            stepId,
            success: false,
            error: error.message,
            duration: Date.now() - startTime,
            retries
          }
        }

        retries++
      }
    }

    return {
      stepId,
      success: false,
      error: '达到最大重试次数',
      duration: Date.now() - startTime,
      retries
    }
  }

  /**
   * 准备工具参数（处理变量引用）
   */
  private async prepareToolInput(
    input: Record<string, any>, 
    context: SkillContext
  ): Promise<Record<string, any>> {
    const prepared: Record<string, any> = {}

    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        // 变量引用
        const varName = value.slice(2, -1)
        prepared[key] = await this.resolveVariable(varName, context)
      } else if (typeof value === 'object' && value !== null) {
        // 递归处理对象
        prepared[key] = await this.prepareToolInput(value, context)
      } else {
        prepared[key] = value
      }
    }

    return prepared
  }

  /**
   * 解析变量
   */
  private async resolveVariable(varName: string, context: SkillContext): Promise<any> {
    // 检查是否是输入参数
    if (varName.startsWith('input.')) {
      const paramName = varName.slice(6)
      return context.input[paramName]
    }

    // 检查是否是步骤结果
    if (context.variables.has(varName)) {
      return context.variables.get(varName)
    }

    // 检查是否是上一步结果
    if (varName === 'lastResult') {
      const lastStepIndex = context.currentStepIndex - 1
      if (lastStepIndex >= 0) {
        const steps = Object.values(context.stepResults)
        if (steps.length > 0) {
          return steps[lastStepIndex]?.result
        }
      }
      return null
    }

    logger.warn('[SkillExecutor] Variable not found', { varName })
    return null
  }

  /**
   * 验证输入
   */
  private validateInput(skill: Skill, input: Record<string, any>): string | null {
    if (!skill.inputSchema) {
      return null
    }

    const schema = skill.inputSchema

    // 检查必填参数
    if (schema.required) {
      for (const param of schema.required) {
        if (!(param in input)) {
          return `缺少必填参数：${param}`
        }
      }
    }

    // 检查参数类型
    if (schema.properties) {
      for (const [param, def] of Object.entries(schema.properties)) {
        if (param in input) {
          const value = input[param]
          const expectedType = def.type

          if (expectedType === 'string' && typeof value !== 'string') {
            return `参数 ${param} 应该是 string 类型`
          }
          if (expectedType === 'number' && typeof value !== 'number') {
            return `参数 ${param} 应该是 number 类型`
          }
          if (expectedType === 'boolean' && typeof value !== 'boolean') {
            return `参数 ${param} 应该是 boolean 类型`
          }
          if (expectedType === 'object' && (typeof value !== 'object' || value === null)) {
            return `参数 ${param} 应该是 object 类型`
          }
          if (expectedType === 'array' && !Array.isArray(value)) {
            return `参数 ${param} 应该是 array 类型`
          }
        }
      }
    }

    return null
  }

  /**
   * 提取输出
   */
  private extractOutput(context: SkillContext): any {
    // 返回最后一步的结果
    const steps = Object.values(context.stepResults)
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1]
      return lastStep.result
    }
    return null
  }
}

/**
 * 创建技能执行器单例
 */
export const skillExecutor = new SkillExecutor()
