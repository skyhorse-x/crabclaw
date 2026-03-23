/**
 * OpenAI Provider
 */

import type { Provider, LLMRequest, LLMResponse, ProviderConfig } from '../types'

export class OpenAIProvider implements Provider {
  readonly name = 'openai'
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultModel: string
  private readonly timeout: number
  private readonly retries: number

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || ''
    this.baseURL = config.baseURL || 'https://api.openai.com/v1'
    this.defaultModel = config.defaultModel || 'gpt-4o'
    this.timeout = config.timeout || 60000
    this.retries = config.retries || 3
  }

  async generate(input: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseURL}/chat/completions`
    
    const body = {
      model: input.model || this.defaultModel,
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      tools: input.tools,
      tool_choice: input.tool_choice,
      stream: false
    }

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    return {
      id: data.id,
      model: data.model,
      text: data.choices[0]?.message?.content || '',
      toolCalls: data.choices[0]?.message?.tool_calls,
      usage: data.usage,
      raw: data
    }
  }

  async listModels(): Promise<any[]> {
    const url = `${this.baseURL}/models`
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    })

    const data = await response.json()
    return data.data.map((m: any) => ({
      id: m.id,
      name: m.id,
      provider: this.name,
      context_window: this.getContextWindow(m.id),
      supports_tools: m.id.includes('gpt-4') || m.id.includes('gpt-3.5'),
      supports_vision: m.id.includes('vision') || m.id.includes('gpt-4o')
    }))
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-3.5-turbo',
        max_tokens: 5
      })
      return true
    } catch {
      return false
    }
  }

  private async fetchWithRetry(url: string, options: RequestInit, retriesLeft: number = this.retries): Promise<Response> {
    try {
      const abortRunner = new AbortController()
      const timeoutId = setTimeout(() => abortRunner.abort(), this.timeout)

      const response = await fetch(url, {
        ...options,
        signal: abortRunner.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response
    } catch (error: any) {
      if (retriesLeft > 0 && this.isRetryable(error)) {
        await this.delay(1000 * (this.retries - retriesLeft + 1))
        return this.fetchWithRetry(url, options, retriesLeft - 1)
      }
      throw error
    }
  }

  private isRetryable(error: any): boolean {
    if (error.message?.includes('timeout') || error.message?.includes('network')) {
      return true
    }
    return false
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getContextWindow(modelId: string): number | undefined {
    const contextWindows: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385
    }

    for (const [key, value] of Object.entries(contextWindows)) {
      if (modelId.includes(key)) {
        return value
      }
    }

    return undefined
  }
}
