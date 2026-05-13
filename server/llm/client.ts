/**
 * LLM Client
 * Agent 调用的统一入口
 */

import type { LLMRequest, LLMResponse } from './types'
import type { GatewayConfig } from './gateway'
import { LLMGateway, createGateway } from './gateway'
import { logger } from '../services/logger.service'

export interface ClientConfig extends GatewayConfig {
  /**
   * 默认任务类型
   */
  defaultTask?: string

  /**
   * 默认温度
   */
  defaultTemperature?: number

  /**
   * 默认最大 token 数
   */
  defaultMaxTokens?: number
}

/**
 * 创建默认客户端配置
 */
export function createDefaultConfig(): ClientConfig {
  return {
    providers: [],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    logging: true,
    defaultTask: 'general',
    defaultTemperature: 0.7
  }
}

export class LLMClient {
  private readonly gateway: LLMGateway
  private readonly defaultTask?: string
  private readonly defaultTemperature?: number
  private readonly defaultMaxTokens?: number

  constructor(config: ClientConfig) {
    this.gateway = createGateway(config)
    this.defaultTask = config.defaultTask
    this.defaultTemperature = config.defaultTemperature
    this.defaultMaxTokens = config.defaultMaxTokens
  }

  /**
   * 生成响应（完整接口）
   */
  async generate(input: LLMRequest): Promise<LLMResponse> {
    const enrichedInput = {
      ...input,
      task: input.task || this.defaultTask,
      temperature: input.temperature ?? this.defaultTemperature,
      max_tokens: input.max_tokens ?? this.defaultMaxTokens
    }

    return this.gateway.generate(enrichedInput)
  }

  /**
   * 简单聊天
   */
  async chat(
    prompt: string,
    options?: {
      model?: string
      temperature?: number
      max_tokens?: number
    }
  ): Promise<string> {
    return this.gateway.chat(
      [{ role: 'user', content: prompt }],
      options
    )
  }

  /**
   * 对话（多轮）
   */
  async converse(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string
      temperature?: number
      max_tokens?: number
      task?: string
    }
  ): Promise<string> {
    return this.gateway.chat(messages, options)
  }

  /**
   * 规划任务（专用于任务规划）
   */
  async plan(prompt: string, context?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: '你是一个专业的任务规划助手。请将复杂任务拆解为可执行的步骤。'
      }
    ]

    if (context) {
      messages.push({ role: 'user', content: `上下文：${context}` })
    }

    messages.push({ role: 'user', content: prompt })

    return this.gateway.chat(messages, {
      model: 'gpt-4o',
      task: 'planning',
      max_tokens: 2000
    })
  }

  /**
   * 编码任务（专用于代码生成）
   */
  async code(prompt: string, context?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: '你是一个专业的编程助手。请生成高质量、可运行的代码。'
      }
    ]

    if (context) {
      messages.push({ role: 'user', content: `上下文：${context}` })
    }

    messages.push({ role: 'user', content: prompt })

    return this.gateway.chat(messages, {
      model: 'claude-3-sonnet-20240229',
      task: 'coding',
      max_tokens: 4000
    })
  }

  /**
   * 工具调用
   */
  async withTools(
    messages: Array<{ role: string; content: string }>,
    tools: any[],
    options?: {
      model?: string
      temperature?: number
    }
  ): Promise<{ text: string; toolCalls?: any[] }> {
    return this.gateway.toolCall(messages, tools, options)
  }

  /**
   * 获取可用模型
   */
  async listModels(): Promise<any[]> {
    return this.gateway.listModels()
  }

  /**
   * 测试连接
   */
  async testConnections(): Promise<Record<string, boolean>> {
    logger.info('测试 LLM 连接...')
    const results = await this.gateway.testConnections()

    for (const [provider, connected] of Object.entries(results)) {
      logger.info(`${provider}: ${connected ? 'connected' : 'disconnected'}`)
    }

    return results
  }

  /**
   * 获取支持的 Provider
   */
  getProviders(): string[] {
    return this.gateway.getProviders()
  }
}

/**
 * 创建 LLM Client
 */
export function createClient(config: ClientConfig): LLMClient {
  return new LLMClient(config)
}

/**
 * 默认 Client 实例（便捷使用）
 */
let _defaultClient: LLMClient | null = null

export function getDefaultClient(config?: ClientConfig): LLMClient {
  if (!_defaultClient) {
    if (!config) {
      throw new Error('首次调用需要提供配置')
    }
    _defaultClient = createClient(config)
  }
  return _defaultClient
}

/**
 * 便捷函数
 */
export const llm = {
  chat: (prompt: string, options?: any) => getDefaultClient().chat(prompt, options),
  converse: (messages: any[], options?: any) => getDefaultClient().converse(messages, options),
  plan: (prompt: string, context?: string) => getDefaultClient().plan(prompt, context),
  code: (prompt: string, context?: string) => getDefaultClient().code(prompt, context),
  withTools: (messages: any[], tools: any[], options?: any) => getDefaultClient().withTools(messages, tools, options),
  generate: (input: LLMRequest) => getDefaultClient().generate(input),
  listModels: () => getDefaultClient().listModels(),
  testConnections: () => getDefaultClient().testConnections(),
  getProviders: () => getDefaultClient().getProviders()
}
