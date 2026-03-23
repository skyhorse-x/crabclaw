/**
 * Ollama Provider (本地模型)
 */

import type { Provider, LLMRequest, LLMResponse, ProviderConfig } from '../types'

export class OllamaProvider implements Provider {
  readonly name = 'ollama'
  private readonly baseURL: string
  private readonly defaultModel: string
  private readonly timeout: number

  constructor(config: ProviderConfig) {
    this.baseURL = config.baseURL || 'http://localhost:11434/api'
    this.defaultModel = config.defaultModel || 'llama3.1'
    this.timeout = config.timeout || 60000
  }

  async generate(input: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseURL}/chat`
    
    const body = {
      model: input.model || this.defaultModel,
      messages: input.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false,
      options: {
        temperature: input.temperature,
        num_predict: input.max_tokens
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`Ollama API Error: ${response.status}`)
    }

    const data = await response.json()

    return {
      id: `ollama-${Date.now()}`,
      model: data.model,
      text: data.message?.content || '',
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      },
      raw: data
    }
  }

  async listModels(): Promise<any[]> {
    try {
      const url = `${this.baseURL.replace('/api', '')}/api/tags`
      const response = await fetch(url, {
        method: 'GET'
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return (data.models || []).map((model: any) => ({
        id: model.name,
        name: model.name,
        provider: this.name,
        context_window: this.getContextWindow(model.name),
        supports_tools: false,
        supports_vision: model.details?.family === 'llava'
      }))
    } catch {
      return []
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseURL.replace('/api', '')}/api/tags`
      const response = await fetch(url, {
        method: 'GET'
      })
      return response.ok
    } catch {
      return false
    }
  }

  private getContextWindow(modelName: string): number | undefined {
    const contextWindows: Record<string, number> = {
      'llama3': 8192,
      'llama3.1': 128000,
      'mistral': 8192,
      'mixtral': 32768,
      'gemma': 8192,
      'qwen': 32768
    }

    for (const [key, value] of Object.entries(contextWindows)) {
      if (modelName.includes(key)) {
        return value
      }
    }

    return undefined
  }
}