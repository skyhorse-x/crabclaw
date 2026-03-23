/**
 * System Agent
 * 负责 AI 驱动的技能执行和系统操作调度
 */

import { BaseAgent, AgentContext, AgentResult } from './base.agent'
import { actionService } from '../services/action.service'
import { logger } from '../services/logger.service'
import type { SkillStep } from '../shared/types'

/**
 * System Agent 类
 */
export class SystemAgent extends BaseAgent {
  readonly type = 'system'

  private executionStack: SkillStep[] = []

  async initialize(): Promise<void> {
    logger.debug('[SystemAgent] Initializing...')
    logger.info('[SystemAgent] Initialized')
  }

  protected async doExecute(context: AgentContext): Promise<AgentResult> {
    const { variables } = context

    // 检查是否有技能步骤需要执行
    const steps = variables.steps as SkillStep[] | undefined
    
    if (!steps || steps.length === 0) {
      return this.error('没有需要执行的技能步骤')
    }

    logger.info('[SystemAgent] Executing skill steps', { 
      stepsCount: steps.length 
    })

    this.executionStack = [...steps]
    const results: any[] = []

    try {
      // 顺序执行技能步骤
      for (const step of this.executionStack) {
        logger.debug('[SystemAgent] Executing step', { 
          type: step.type,
          label: step.label 
        })

        const result = await this.executeStep(step)
        
        if (!result.ok) {
          logger.error('[SystemAgent] Step execution failed', { 
            type: step.type,
            error: result.error 
          })
          
          return this.error(`步骤 "${step.label || step.type}" 执行失败：${result.error}`)
        }

        results.push({
          step,
          result: result.data
        })

        // 如果步骤指定了延迟，等待指定时间
        if (step.ms && step.ms > 0) {
          await actionService.wait(step.ms)
        }
      }

      logger.debug('[SystemAgent] All steps completed successfully')

      return this.success({
        executedSteps: results.length,
        results
      })
    } catch (error: any) {
      logger.error('[SystemAgent] Execution error', error)
      
      return this.error(`技能执行异常：${error.message}`)
    }
  }

  /**
   * 执行单个技能步骤
   */
  private async executeStep(step: SkillStep): Promise<{ ok: boolean; data?: any; error?: string }> {
    switch (step.type) {
      case 'openApp':
        if (!step.app) {
          return { error: '缺少 app 参数' }
        }
        return actionService.openApp(step.app)

      case 'openUrl':
        if (!step.url) {
          return { error: '缺少 url 参数' }
        }
        return actionService.openUrl(step.url)

      case 'move':
        if (step.x === undefined || step.y === undefined) {
          return { error: '缺少 x 或 y 参数' }
        }
        return actionService.moveMouse(step.x, step.y)

      case 'click':
        if (step.x === undefined || step.y === undefined) {
          return { error: '缺少 x 或 y 参数' }
        }
        return actionService.click(step.x, step.y)

      case 'doubleClick':
        if (step.x === undefined || step.y === undefined) {
          return { error: '缺少 x 或 y 参数' }
        }
        return actionService.doubleClick(step.x, step.y)

      case 'type':
        if (!step.text) {
          return { error: '缺少 text 参数' }
        }
        return actionService.typeText(step.text)

      case 'key':
        if (!step.key) {
          return { error: '缺少 key 参数' }
        }
        return actionService.pressKey(step.key)

      case 'hotkey':
        if (!step.keys || step.keys.length === 0) {
          return { error: '缺少 keys 参数' }
        }
        return actionService.pressHotkey(step.keys)

      case 'wait':
        const waitTime = step.ms || 1000
        await actionService.wait(waitTime)
        return { ok: true, data: { waited: waitTime } }

      case 'noop':
      case 'note':
        return { ok: true, data: { skipped: true } }

      default:
        return { error: `不支持的操作类型：${step.type}` }
    }
  }

  async cleanup(): Promise<void> {
    logger.debug('[SystemAgent] Cleaning up...')
    this.executionStack = []
    await super.cleanup()
  }
}

/**
 * 创建 System Agent 单例
 */
export const systemAgent = new SystemAgent()
