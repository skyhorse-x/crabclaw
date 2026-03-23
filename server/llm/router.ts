/**
 * Model Router
 * 根据任务类型、模型名称等路由到合适的 Provider
 */

import type { Provider, LLMRequest, RouterConfig, RoutingRule } from './types'
import { OpenAIProvider, AnthropicProvider, OllamaProvider } from './providers'

export class ModelRouter {
  private readonly providers: Map<string, Provider> = new Map()
  private readonly rules: RoutingRule[]
  private defaultProvider: string
  private defaultModel: string

  constructor(config: RouterConfig) {
    this.defaultProvider = config.defaultProvider || ''
    this.defaultModel = config.defaultModel || ''
    this.rules = config.rules || []

    // 注册所有 Provider
    for (const providerConfig of config.providers) {
      this.registerProvider(providerConfig)
    }

    // 设置默认 Provider
    if (!this.defaultProvider && this.providers.size > 0) {
      this.defaultProvider = Array.from(this.providers.keys())[0]
    }
  }

  /**
   * 注册 Provider
   */
  private registerProvider(config: any): void {
    let provider: Provider

    switch (config.name.toLowerCase()) {
      case 'openai':
      case 'openrouter':
        provider = new OpenAIProvider(config)
        break
      case 'anthropic':
        provider = new AnthropicProvider(config)
        break
      case 'ollama':
        provider = new OllamaProvider(config)
        break
      default:
        throw new Error(`不支持的 Provider: ${config.name}`)
    }

    this.providers.set(config.name, provider)
  }

  /**
   * 路由选择
   */
  route(input: LLMRequest): { provider: string; model: string } {
    // 1. 检查是否显式指定了 provider/model
    if (input.model?.includes('/')) {
      const [provider, ...modelParts] = input.model.split('/')
      return {
        provider,
        model: modelParts.join('/')
      }
    }

    // 2. 检查路由规则
    for (const rule of this.rules) {
      // 按任务类型匹配
      if (rule.task && input.task === rule.task) {
        return {
          provider: rule.provider,
          model: rule.model || this.defaultModel
        }
      }

      // 按模型模式匹配
      if (rule.pattern && input.model) {
        if (this.matchPattern(rule.pattern, input.model)) {
          return {
            provider: rule.provider,
            model: rule.model || input.model
          }
        }
      }
    }

    // 3. 使用默认配置
    return {
      provider: this.defaultProvider,
      model: input.model || this.defaultModel
    }
  }

  /**
   * 获取 Provider 实例
   */
  getProvider(name: string): Provider {
    const provider = this.providers.get(name)
    if (!provider) {
      throw new Error(`Provider 不存在：${name}`)
    }
    return provider
  }

  /**
   * 获取所有 Provider
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  /**
   * 测试所有 Provider 连接
   */
  async testConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.testConnection?.() || false
      } catch {
        results[name] = false
      }
    }

    return results
  }

  /**
   * 获取所有可用模型
   */
  async listModels(): Promise<any[]> {
    const allModels: any[] = []

    for (const [name, provider] of this.providers) {
      try {
        const models = await provider.listModels?.()
        if (models) {
          allModels.push(...models)
        }
      } catch {
        // 忽略错误
      }
    }

    return allModels
  }

  /**
   * 匹配模式（支持通配符）
   */
  private matchPattern(pattern: string, value: string): boolean {
    if (pattern === value) {
      return true
    }

    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
      return regex.test(value)
    }

    return false
  }
}

/**
 * 创建 Model Router
 */
export function createRouter(config: RouterConfig): ModelRouter {
  return new ModelRouter(config)
}
