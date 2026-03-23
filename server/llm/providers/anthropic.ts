/**
 * Anthropic Provider (Claude)
 */

import type { Provider, LLMRequest, LLMResponse, ProviderConfig } from '../types'

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic'
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly defaultModel: string
  private readonly timeout: number

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || ''
    this.baseURL = config.baseURL || 'https://api.anthropic.com/v1'
    this.defaultModel = config.defaultModel || 'claude-3-sonnet-20240229'
    this.timeout = config.timeout || 60000
  }

  async generate(input: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseURL}/messages`
    
    const systemMessages = input.messages.filter(m => m.role === 'system')
    const conversationMessages = input.messages.filter(m => m.role !== 'system')

    const body: any = {
      model: input.model || this.defaultModel,
      messages: conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })),
      max_tokens: input.max_tokens || 1024,
      stream: false
    }

    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => m.content).join('\n')
    }

    if (input.temperature !== undefined) {
      body.temperature = input.temperature
    }

    if (input.tools?.length) {
      body.tools = input.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters
      }))
    }

    const abortRunner = new AbortController()
    const timeoutId = setTimeout(() => abortRunner.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: abortRunner.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Anthropic API Error: ${response.status}`)
      }

      const data = await response.json()

      const textContent = data.content?.find((c: any) => c.type === 'text')?.text || ''
      const toolUses = data.content?.filter((c: any) => c.type === 'tool_use') || []

      const toolCalls = toolUses.map((tool: any) => ({
        id: tool.id,
        type: 'function' as const,
        function: {
          name: tool.name,
          arguments: JSON.stringify(tool.input)
        }
      }))

      return {
        id: data.id,
        model: data.model,
        text: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
          total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        },
        raw: data
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error(`Anthropic API request timed out after ${this.timeout}ms`)
      }
      throw error
    }
  }

  async listModels(): Promise<any[]> {
    return [
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: this.name,
        context_window: 200000,
        supports_tools: true,
        supports_vision: true
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        provider: this.name,
        context_window: 200000,
        supports_tools: true,
        supports_vision: true
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        provider: this.name,
        context_window: 200000,
        supports_tools: true,
        supports_vision: true
      }
    ]
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-3-haiku-20240307',
        max_tokens: 5
      })
      return true
    } catch {
      return false
    }
  }
}
