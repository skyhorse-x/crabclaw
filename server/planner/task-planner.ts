/**
 * 任务规划器
 * 负责任务拆解和步骤规划
 */

import { createId } from '../shared/utils'
import { logger } from '../services/logger.service'
import type { TaskPlan, TaskStep, PlanningResult, PlannerConfig } from './planner.types'
import { llm } from '../llm'

/**
 * 任务规划器类
 */
export class TaskPlanner {
  private config: PlannerConfig

  constructor(config: PlannerConfig = {}) {
    this.config = {
      useAI: false,
      maxSteps: 20,
      allowParallel: false,
      timeout: 60000,
      ...config
    }
  }

  /**
   * 规划任务
   */
  async plan(task: string, context?: Record<string, any>): Promise<PlanningResult> {
    const startTime = Date.now()
    
    logger.info('[TaskPlanner] Planning task', { task, useAI: this.config.useAI })

    try {
      let plan: TaskPlan

      if (this.config.useAI) {
        // TODO: 使用 AI 进行任务规划
        plan = await this.aiPlan(task, context)
      } else {
        // 使用规则进行任务规划
        plan = this.ruleBasedPlan(task, context)
      }

      const duration = Date.now() - startTime

      logger.info('[TaskPlanner] Task planning completed', { 
        stepsCount: plan.steps.length,
        duration 
      })

      return {
        ok: true,
        plan,
        duration
      }
    } catch (error: any) {
      logger.error('[TaskPlanner] Planning failed', error)
      
      return {
        ok: false,
        error: error.message,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 基于规则的任务规划（简化版）
   */
  private ruleBasedPlan(task: string, _context?: Record<string, any>): TaskPlan {
    const steps: TaskStep[] = []

    // 简单的关键词匹配来生成步骤
    const taskLower = task.toLowerCase()

    // 检测任务类型并生成相应步骤
    if (taskLower.includes('创建') && (taskLower.includes('文件') || taskLower.includes('.txt') || taskLower.includes('.json'))) {
      // 创建文件任务
      steps.push({
        id: createId('step'),
        description: '检查文件路径',
        status: 'pending'
      })

      steps.push({
        id: createId('step'),
        description: '创建文件',
        tool: 'write_file',
        dependsOn: [steps[0].id],
        status: 'pending'
      })

      steps.push({
        id: createId('step'),
        description: '验证文件创建',
        tool: 'file_exists',
        dependsOn: [steps[1].id],
        status: 'pending'
      })
    } else if (taskLower.includes('读取') && taskLower.includes('文件')) {
      // 读取文件任务
      steps.push({
        id: createId('step'),
        description: '检查文件是否存在',
        tool: 'file_exists',
        status: 'pending'
      })

      steps.push({
        id: createId('step'),
        description: '读取文件内容',
        tool: 'read_file',
        dependsOn: [steps[0].id],
        status: 'pending'
      })
    } else if (taskLower.includes('执行') || taskLower.includes('运行')) {
      // 执行命令任务
      steps.push({
        id: createId('step'),
        description: '执行命令',
        tool: 'shell',
        status: 'pending'
      })
    } else {
      // 通用任务模板
      steps.push({
        id: createId('step'),
        description: `执行任务：${task}`,
        status: 'pending'
      })
    }

    // 限制步骤数量
    const limitedSteps = steps.slice(0, this.config.maxSteps || 20)

    return {
      id: createId('plan'),
      originalTask: task,
      steps: limitedSteps,
      createdAt: new Date().toISOString(),
      status: 'ready'
    }
  }

  /**
   * AI 任务规划（使用 LLM）
   */
  private async aiPlan(task: string, context?: Record<string, any>): Promise<TaskPlan> {
    logger.info('[TaskPlanner] Using AI for task planning', { task })
    
    try {
      // 构建提示词
      const prompt = this.buildPlanningPrompt(task, context)
      
      // 调用 LLM
      const aiResponse = await llm.converse([
        {
          role: 'system',
          content: '你是一个专业的任务规划助手。你的任务是将用户的复杂任务拆解为可执行的具体步骤。\n\n请按照以下 JSON 格式返回计划：\n```json\n{\n  "steps": [\n    {\n      "description": "步骤描述",\n      "tool": "工具名称（可选）",\n      "tool_input": {},\n      "depends_on": ["前置步骤 ID"]\n    }\n  ]\n}\n```\n\n可用的工具包括：read_file, write_file, delete_file, list_directory, create_directory, shell'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.3,
        max_tokens: 2000
      })
      
      logger.debug('[TaskPlanner] AI response', { content: aiResponse })
      
      // 解析 AI 响应中的 JSON
      const planData = this.extractJsonFromResponse(aiResponse)
      
      if (!planData || !Array.isArray(planData.steps)) {
        logger.warn('[TaskPlanner] AI response invalid, using rule-based planning')
        return this.ruleBasedPlan(task, context)
      }
      
      // 转换为内部格式
      const steps: TaskStep[] = planData.steps.map((step: any, index: number) => ({
        id: step.id || createId('step'),
        description: step.description || `步骤 ${index + 1}`,
        tool: step.tool,
        toolInput: step.tool_input,
        dependsOn: step.depends_on?.length > 0 ? step.depends_on : (index > 0 ? [planData.steps[index - 1].id || `step-${index - 1}`] : []),
        status: 'pending' as const
      }))
      
      // 限制步骤数量
      const limitedSteps = steps.slice(0, this.config.maxSteps || 20)
      
      return {
        id: createId('plan'),
        originalTask: task,
        steps: limitedSteps,
        createdAt: new Date().toISOString(),
        status: 'ready'
      }
    } catch (error) {
      logger.error('[TaskPlanner] AI planning failed, falling back to rule-based', error)
      // 降级到规则规划
      return this.ruleBasedPlan(task, context)
    }
  }
  
  /**
   * 构建任务规划提示词
   */
  private buildPlanningPrompt(task: string, context?: Record<string, any>): string {
    let prompt = `请将以下任务拆解为可执行的步骤序列：\n\n任务：${task}`
    
    if (context) {
      prompt += `\n\n上下文信息：\n`
      if (context.completedSteps && context.completedSteps.length > 0) {
        prompt += `\n已完成的步骤:\n`
        context.completedSteps.forEach((step: TaskStep, i: number) => {
          prompt += `${i + 1}. ${step.description}\n`
        })
      }
      if (context.failedStep) {
        prompt += `\n失败的步骤：${context.failedStep.description}\n`
        prompt += `失败原因：${context.failedStep.error || '未知'}\n`
      }
    }
    
    prompt += `\n\n请确保：\n1. 每个步骤都是原子操作\n2. 明确步骤间的依赖关系\n3. 指定每个步骤需要使用的工具\n4. 步骤总数不超过 20 个`
    
    return prompt
  }
  
  /**
   * 从 AI 响应中提取 JSON
   */
  private extractJsonFromResponse(response: string): any | null {
    try {
      // 尝试直接解析
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1].trim())
      }
      
      // 尝试查找第一个 { 和最后一个 }
      const startIdx = response.indexOf('{')
      const endIdx = response.lastIndexOf('}')
      
      if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        const jsonStr = response.substring(startIdx, endIdx + 1).trim()
        return JSON.parse(jsonStr)
      }
      
      // 尝试直接解析整个响应
      return JSON.parse(response)
    } catch (error) {
      logger.debug('[TaskPlanner] Failed to parse JSON from response', error)
      return null
    }
  }

  /**
   * 重新规划任务
   */
  async replan(plan: TaskPlan, failedStepId: string, context?: Record<string, any>): Promise<PlanningResult> {
    logger.info('[TaskPlanner] Replanning from failed step', { 
      planId: plan.id, 
      failedStepId 
    })

    // 找到失败的步骤
    const failedStepIndex = plan.steps.findIndex(s => s.id === failedStepId)
    
    if (failedStepIndex === -1) {
      return {
        ok: false,
        error: '未找到失败的步骤'
      }
    }

    // 保留已完成的步骤
    const completedSteps = plan.steps.slice(0, failedStepIndex)
    
    // 重新规划剩余步骤
    const newPlanResult = await this.plan(plan.originalTask, {
      ...context,
      completedSteps,
      failedStep: plan.steps[failedStepIndex]
    })

    if (!newPlanResult.ok || !newPlanResult.plan) {
      return newPlanResult
    }

    // 合并计划
    const mergedPlan: TaskPlan = {
      ...newPlanResult.plan,
      steps: [...completedSteps, ...newPlanResult.plan.steps]
    }

    return {
      ok: true,
      plan: mergedPlan,
      duration: newPlanResult.duration
    }
  }

  /**
   * 验证计划
   */
  validatePlan(plan: TaskPlan): boolean {
    if (plan.steps.length === 0) {
      return false
    }

    if (plan.steps.length > (this.config.maxSteps || 20)) {
      return false
    }

    // 检查依赖关系
    const stepIds = new Set(plan.steps.map(s => s.id))
    
    for (const step of plan.steps) {
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            logger.error('[TaskPlanner] Invalid dependency', { 
              stepId: step.id, 
              dependency: depId 
            })
            return false
          }
        }
      }
    }

    return true
  }

  /**
   * 获取可执行的步骤（无未完成的依赖）
   */
  getExecutableSteps(plan: TaskPlan): TaskStep[] {
    const completedSteps = new Set(
      plan.steps
        .filter(s => s.status === 'completed')
        .map(s => s.id)
    )

    return plan.steps.filter(step => {
      if (step.status !== 'pending') {
        return false
      }

      if (!step.dependsOn || step.dependsOn.length === 0) {
        return true
      }

      // 所有依赖都已完成
      return step.dependsOn.every(depId => completedSteps.has(depId))
    })
  }
}

/**
 * 创建任务规划器单例
 */
export const taskPlanner = new TaskPlanner()
