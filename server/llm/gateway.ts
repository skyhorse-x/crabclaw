/**
 * LLM Gateway
 * 统一的 LLM API 层，提供标准化接口
 */

import type { LLMRequest, LLMResponse, RouterConfig } from './types'
import { ModelRouter, createRouter } from './router'
import { logger } from '../services/logger.service'

export interface GatewayConfig extends RouterConfig {
  /**
   * 启用日志
   */
  logging?: boolean

  /**
   * 启用成本估算
   */
  costEstimation?: boolean

  /**
   * 限流配置（每分钟请求数）
   */
  rateLimit?: number
}

export class LLMGateway {
  private readonly router: ModelRouter
  private readonly logging: boolean
  private readonly costEstimation: boolean
  private readonly rateLimit?: number
  private requestCount = 0
  private lastResetTime = Date.now()

  constructor(config: GatewayConfig) {
    this.router = createRouter(config)
    this.logging = config.logging ?? true
    this.costEstimation = config.costEstimation ?? false
    this.rateLimit = config.rateLimit
  }

  /**
   * 生成响应（主要接口）
   */
  async generate(input: LLMRequest): Promise<LLMResponse> {
    // 限流检查
    if (this.rateLimit) {
      await this.checkRateLimit()
    }

    // 路由选择
    const { provider: providerName, model } = this.router.route(input)
    const provider = this.router.getProvider(providerName)

    if (this.logging) {
      logger.debug('LLM 请求', {
        provider: providerName,
        model,
        task: input.task,
        messagesCount: input.messages.length
      })
    }

    const startTime = Date.now()

    try {
      // 调用 Provider
      const response = await provider.generate({
        ...input,
        model
      })

      const duration = Date.now() - startTime

      if (this.logging) {
        logger.info('LLM 响应', {
          provider: providerName,
          model,
          duration: `${duration}ms`,
          tokens: response.usage?.total_tokens,
          textLength: response.text.length
        })
      }

      if (this.costEstimation && response.usage) {
        const cost = this.estimateCost(response.usage, model)
        if (this.logging) {
          logger.debug('成本估算', {
            provider: providerName,
            model,
            cost: `$${cost.toFixed(6)}`
          })
        }
      }

      return response
    } catch (error: any) {
      logger.error('LLM 错误', {
        provider: providerName,
        model,
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      })
      throw error
    }
  }

  /**
   * 简化的聊天接口
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string
      temperature?: number
      max_tokens?: number
      tools?: any[]
      task?: string
    }
  ): Promise<string> {
    const response = await this.generate({
      messages: messages as any,
      model: options?.model,
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
      tools: options?.tools,
      task: options?.task
    })

    return response.text
  }

  /**
   * 工具调用接口
   */
  async toolCall(
    messages: Array<{ role: string; content: string }>,
    tools: any[],
    options?: {
      model?: string
      temperature?: number
    }
  ): Promise<{ text: string; toolCalls?: any[] }> {
    const response = await this.generate({
      messages: messages as any,
      tools,
      model: options?.model,
      temperature: options?.temperature,
      tool_choice: 'auto'
    })

    return {
      text: response.text,
      toolCalls: response.toolCalls
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<any[]> {
    return this.router.listModels()
  }

  /**
   * 测试所有 Provider 连接
   */
  async testConnections(): Promise<Record<string, boolean>> {
    return this.router.testConnections()
  }

  /**
   * 获取支持的 Provider 列表
   */
  getProviders(): string[] {
    return this.router.getProviders()
  }

  /**
   * 限流检查
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    const minutePassed = now - this.lastResetTime

    if (minutePassed >= 60000) {
      this.requestCount = 0
      this.lastResetTime = now
    }

    if (this.requestCount >= (this.rateLimit || Infinity)) {
      throw new Error('请求速率限制，请稍后重试')
    }

    this.requestCount++
  }

  /**
   * 成本估算
   */
  private estimateCost(usage: { prompt_tokens: number; completion_tokens: number }, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.000005, output: 0.000015 },
      'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
      'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
      'claude-3-opus': { input: 0.000015, output: 0.000075 },
      'claude-3-sonnet': { input: 0.000003, output: 0.000015 },
      'claude-3-haiku': { input: 0.00000025, output: 0.00000125 }
    }

    const price = pricing[model] || { input: 0.000001, output: 0.000002 }
    const inputCost = usage.prompt_tokens * price.input
    const outputCost = usage.completion_tokens * price.output

    return inputCost + outputCost
  }
}

/**
 * 创建 LLM Gateway
 */
export function createGateway(config: GatewayConfig): LLMGateway {
  return new LLMGateway(config)
}
