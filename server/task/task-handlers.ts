/**
 * 任务执行器
 * 负责执行具体类型的任务
 */

import { logger } from '../services/logger.service'
import { toolRegistry } from '../tools/tool-registry'
import { skillRegistry } from '../skills/skill-registry'
import { taskPlanner } from '../planner/task-planner'
import type { TaskHandler, TaskContext } from './task.types'

/**
 * 工具执行任务处理器
 */
export class ToolTaskHandler implements TaskHandler {
  async execute(context: TaskContext): Promise<any> {
    const { tool, input } = context.data

    logger.debug('[ToolTaskHandler] Executing tool task', { 
      tool, 
      taskId: context.taskId 
    })

    const result = await toolRegistry.executeTool(tool, input)

    if (!result.ok) {
      throw new Error(result.error || '工具执行失败')
    }

    return result.data
  }

  async cancel(taskId: string): Promise<void> {
    logger.info('[ToolTaskHandler] Cancelling tool task', { taskId })
    // 工具执行通常是原子的，无法取消
  }
}

/**
 * 技能执行任务处理器
 */
export class SkillTaskHandler implements TaskHandler {
  async execute(context: TaskContext): Promise<any> {
    const { skillId, input } = context.data

    logger.debug('[SkillTaskHandler] Executing skill task', { 
      skillId, 
      taskId: context.taskId 
    })

    const result = await skillRegistry.execute(skillId, input)

    if (!result.success) {
      throw new Error(result.error || '技能执行失败')
    }

    return result.output
  }

  async cancel(taskId: string): Promise<void> {
    logger.info('[SkillTaskHandler] Cancelling skill task', { taskId })
  }
}

/**
 * 任务规划处理器
 */
export class PlanningTaskHandler implements TaskHandler {
  async execute(context: TaskContext): Promise<any> {
    const { task } = context.data

    logger.debug('[PlanningTaskHandler] Planning task', { 
      task, 
      taskId: context.taskId 
    })

    const result = await taskPlanner.plan(task)

    if (!result.ok || !result.plan) {
      throw new Error(result.error || '任务规划失败')
    }

    return result.plan
  }
}

/**
 * 复合任务处理器（执行一系列子任务）
 */
export class CompositeTaskHandler implements TaskHandler {
  constructor(private taskQueue: any) {}

  async execute(context: TaskContext): Promise<any> {
    const { subTasks } = context.data
    const results: any[] = []

    logger.debug('[CompositeTaskHandler] Executing composite task', { 
      subTasksCount: subTasks.length,
      taskId: context.taskId 
    })

    for (const subTask of subTasks) {
      // 检查是否取消
      if (context.cancelled) {
        throw new Error('任务已取消')
      }

      // 添加子任务到队列并等待完成
      const subTaskId = await this.taskQueue.add(subTask)
      const result = await this.taskQueue.waitForTask(subTaskId)
      
      results.push({
        taskId: subTaskId,
        status: result.status,
        result: result.result
      })
    }

    return results
  }

  async cancel(taskId: string): Promise<void> {
    logger.info('[CompositeTaskHandler] Cancelling composite task', { taskId })
  }
}

/**
 * 注册所有内置任务处理器
 */
export function registerBuiltInHandlers(taskQueue: any): void {
  taskQueue.registerHandler('tool', new ToolTaskHandler())
  taskQueue.registerHandler('skill', new SkillTaskHandler())
  taskQueue.registerHandler('planning', new PlanningTaskHandler())
  taskQueue.registerHandler('composite', new CompositeTaskHandler(taskQueue))

  logger.info('[TaskHandlers] Built-in handlers registered')
}
