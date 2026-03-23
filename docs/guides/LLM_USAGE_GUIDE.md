# LLM 层使用指南

## 📖 概述

LLM 层提供了统一的大语言模型接口，支持多个提供商（OpenAI、Anthropic、Ollama），实现了：

- ✅ **统一接口** - 所有提供商使用相同的调用方式
- ✅ **模型路由** - 根据配置自动路由到不同提供商
- ✅ **流式输出** - 支持 SSE 流式响应
- ✅ **工具调用** - 支持 Function Calling
- ✅ **错误处理** - 自动重试、超时控制
- ✅ **成本估算** - 实时计算 token 成本

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────┐
│          Application Code               │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│           ModelRouter                   │
│    (模型路由、负载均衡、故障转移)        │
└────────────────┬────────────────────────┘
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
┌───────────┬──────────┬──────────┐
│  OpenAI   │ Anthropic│  Ollama  │
│ Provider  │ Provider │ Provider │
└───────────┴──────────┴──────────┘
```

---

## 🚀 快速开始

### 1. 基础配置

```typescript
import { createModelRouter } from './server/llm'

// 创建模型路由器
const router = createModelRouter({
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o',
  providers: [
    {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
      defaultModel: 'gpt-4o'
    },
    {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      defaultModel: 'claude-3-sonnet-20240229'
    },
    {
      name: 'ollama',
      baseURL: 'http://localhost:11434/api',
      defaultModel: 'llama3.1'
    }
  ]
})
```

### 2. 简单对话

```typescript
import { router } from './llm-config'

const messages = [
  { role: 'user', content: '你好，请介绍一下自己' }
]

const response = await router.chat(messages)

console.log(response.choices[0].message.content)
```

### 3. 流式输出

```typescript
const messages = [
  { role: 'user', content: '写一首关于春天的诗' }
]

for await (const chunk of router.chatStream(messages)) {
  if (chunk.delta.content) {
    process.stdout.write(chunk.delta.content)
  }
  
  if (chunk.finish_reason) {
    console.log('\n完成')
    break
  }
}
```

---

## 📚 详细用法

### 使用 OpenAI

```typescript
import { OpenAIProvider } from './server/llm'

const openai = new OpenAIProvider({
  name: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1', // 可选，支持兼容 API
  defaultModel: 'gpt-4o',
  timeout: 60000,
  retries: 3
})

// 对话
const response = await openai.chat([
  { role: 'system', content: '你是一个有帮助的助手' },
  { role: 'user', content: '今天天气如何？' }
])

console.log(response.choices[0].message.content)

// 流式
for await (const chunk of openai.chatStream([
  { role: 'user', content: '讲个故事' }
])) {
  process.stdout.write(chunk.delta.content || '')
}
```

### 使用 Anthropic (Claude)

```typescript
import { AnthropicProvider } from './server/llm'

const anthropic = new AnthropicProvider({
  name: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  defaultModel: 'claude-3-sonnet-20240229'
})

const response = await anthropic.chat([
  { role: 'user', content: '你好' }
])

console.log(response.choices[0].message.content)
```

### 使用 Ollama (本地模型)

```typescript
import { OllamaProvider } from './server/llm'

const ollama = new OllamaProvider({
  name: 'ollama',
  baseURL: 'http://localhost:11434/api',
  defaultModel: 'llama3.1'
})

// 测试连接
const isConnected = await ollama.testConnection()
console.log('Ollama 连接状态:', isConnected)

// 获取可用模型
const models = await ollama.listModels()
console.log('可用模型:', models)

// 对话
const response = await ollama.chat([
  { role: 'user', content: '你好' }
])
```

---

## 🔧 高级功能

### 1. 工具调用 (Function Calling)

```typescript
import { router } from './llm-config'

// 定义工具
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: '获取天气信息',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: '城市名称'
          }
        },
        required: ['location']
      }
    }
  }
]

const messages = [
  { role: 'user', content: '北京今天天气如何？' }
]

const response = await router.chat(messages, {
  tools,
  tool_choice: 'auto'
})

// 检查是否有工具调用
const toolCalls = response.choices[0].message.tool_calls
if (toolCalls) {
  for (const call of toolCalls) {
    console.log('调用工具:', call.function.name)
    console.log('参数:', JSON.parse(call.function.arguments))
  }
}
```

### 2. 模型路由规则

```typescript
const router = createModelRouter({
  defaultProvider: 'openai',
  providers: [
    { name: 'openai', apiKey: 'sk-xxx', defaultModel: 'gpt-4o' },
    { name: 'anthropic', apiKey: 'sk-ant-xxx', defaultModel: 'claude-3-sonnet' },
    { name: 'ollama', baseURL: 'http://localhost:11434/api', defaultModel: 'llama3.1' }
  ],
  modelRoutes: [
    // 使用 Claude 处理长文本
    { pattern: 'claude-*', provider: 'anthropic' },
    
    // 使用 Ollama 处理简单任务
    { pattern: 'llama*', provider: 'ollama' },
    
    // 使用 GPT-4 处理复杂任务
    { pattern: 'gpt-4*', provider: 'openai' }
  ]
})

// 自动路由到对应提供商
await router.chat(messages, { model: 'claude-3-sonnet' }) // → Anthropic
await router.chat(messages, { model: 'llama3.1' })        // → Ollama
await router.chat(messages, { model: 'gpt-4o' })          // → OpenAI
```

### 3. 多模型对比

```typescript
const providers = ['openai', 'anthropic', 'ollama']
const results: Record<string, string> = {}

for (const provider of providers) {
  router.setDefaultProvider(provider)
  
  const response = await router.chat([
    { role: 'user', content: '用一句话解释量子力学' }
  ])
  
  results[provider] = response.choices[0].message.content
}

console.log('不同模型的回答:')
console.log(results)
```

### 4. 成本估算

```typescript
import { estimateCost } from './server/llm'

const response = await router.chat(messages, {
  model: 'gpt-4o'
})

const cost = estimateCost(response.usage, 'gpt-4o')

console.log('Token 使用:', response.usage)
console.log('估算成本:', cost)
// { input: 0.0003, output: 0.0006, total: 0.0009 }
```

### 5. 错误处理

```typescript
import { LLMError, LLMRateLimitError, LLMAPIError } from './server/llm'

try {
  const response = await router.chat(messages)
} catch (error) {
  if (error instanceof LLMRateLimitError) {
    console.log('速率限制，请稍后重试')
    console.log('建议重试时间:', error.retryAfter)
  } else if (error instanceof LLMAPIError) {
    console.log('API 错误:', error.message)
    console.log('状态码:', error.statusCode)
    console.log('提供商:', error.provider)
  } else if (error instanceof LLMError) {
    console.log('LLM 错误:', error.message)
  } else {
    console.log('未知错误:', error)
  }
}
```

### 6. 自定义提供商

```typescript
import { BaseLLMClient } from './server/llm'
import type { ProviderConfig, ChatMessage, GenerationConfig, LLMResponse, StreamChunk, ModelInfo } from './server/llm'

class CustomProvider extends BaseLLMClient {
  constructor(config: ProviderConfig) {
    super(config)
  }

  get provider(): string {
    return 'custom'
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.custom-llm.com/v1'
  }

  async chat(messages: ChatMessage[], config?: GenerationConfig): Promise<LLMResponse> {
    // 实现聊天逻辑
    const url = `${this.baseURL}/chat`
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ messages, ...config })
    })
    
    const data = await response.json()
    
    return {
      id: data.id,
      model: data.model,
      choices: data.choices,
      usage: data.usage,
      created: data.created,
      provider: this.provider
    }
  }

  async *chatStream(messages: ChatMessage[], config?: GenerationConfig): AsyncGenerator<StreamChunk> {
    // 实现流式逻辑
  }

  async listModels(): Promise<ModelInfo[]> {
    // 实现模型列表
    return []
  }

  async testConnection(): Promise<boolean> {
    // 实现连接测试
    return true
  }
}

// 使用自定义提供商
const router = createModelRouter({
  providers: [
    new CustomProvider({
      name: 'custom',
      apiKey: 'xxx'
    })
  ]
})
```

---

## ⚙️ 配置选项

### ProviderConfig

```typescript
interface ProviderConfig {
  name: string              // 提供商名称
  apiKey: string            // API 密钥
  baseURL?: string          // API 基础 URL
  defaultModel?: string     // 默认模型
  timeout?: number          // 超时时间（毫秒）
  retries?: number          // 重试次数
  [key: string]: any        // 额外配置
}
```

### GenerationConfig

```typescript
interface GenerationConfig {
  model?: string                      // 模型名称
  temperature?: number                // 温度 (0-2)
  max_tokens?: number                 // 最大 tokens
  top_p?: number                      // Top P
  frequency_penalty?: number          // 频率惩罚
  presence_penalty?: number           // 存在惩罚
  stop?: string[]                     // 停止序列
  stream?: boolean                    // 是否流式
  tools?: ToolDefinition[]            // 工具定义
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
}
```

---

## 📊 支持的模型

### OpenAI

| 模型 | 上下文窗口 | 工具支持 | 视觉支持 | 流式 |
|------|-----------|---------|---------|------|
| gpt-4o | 128K | ✅ | ✅ | ✅ |
| gpt-4-turbo | 128K | ✅ | ✅ | ✅ |
| gpt-4 | 8K | ✅ | ❌ | ✅ |
| gpt-3.5-turbo | 16K | ✅ | ❌ | ✅ |

### Anthropic

| 模型 | 上下文窗口 | 工具支持 | 视觉支持 | 流式 |
|------|-----------|---------|---------|------|
| claude-3-opus | 200K | ✅ | ✅ | ✅ |
| claude-3-sonnet | 200K | ✅ | ✅ | ✅ |
| claude-3-haiku | 200K | ✅ | ✅ | ✅ |

### Ollama

| 模型 | 上下文窗口 | 工具支持 | 视觉支持 | 流式 |
|------|-----------|---------|---------|------|
| llama3.1 | 128K | ❌ | ❌ | ✅ |
| llama3 | 8K | ❌ | ❌ | ✅ |
| mistral | 8K | ❌ | ❌ | ✅ |
| mixtral | 32K | ❌ | ❌ | ✅ |
| qwen2 | 32K | ❌ | ❌ | ✅ |

---

## 🎯 最佳实践

### 1. 环境变量管理

```typescript
// .env
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
OLLAMA_BASE_URL=http://localhost:11434/api

// llm-config.ts
import dotenv from 'dotenv'
dotenv.config()

export const router = createModelRouter({
  providers: [
    {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY!
    },
    {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!
    }
  ]
})
```

### 2. 连接池和缓存

```typescript
// 单例模式
let _router: ModelRouter | null = null

export function getRouter(): ModelRouter {
  if (!_router) {
    _router = createModelRouter({
      providers: [...]
    })
  }
  return _router
}
```

### 3. 日志记录

```typescript
import { logger } from './server/services/logger.service'

const router = createModelRouter({
  providers: [...]
})

// 订阅事件
router.on('request', (event) => {
  logger.info('LLM 请求', event)
})

router.on('response', (event) => {
  logger.info('LLM 响应', {
    provider: event.provider,
    model: event.model,
    tokens: event.usage.total_tokens
  })
})
```

### 4. 降级策略

```typescript
async function chatWithFallback(messages: ChatMessage[]) {
  const providers = ['openai', 'anthropic', 'ollama']
  
  for (const provider of providers) {
    try {
      router.setDefaultProvider(provider)
      return await router.chat(messages)
    } catch (error) {
      logger.warn(`${provider} 失败，尝试下一个`, { error })
    }
  }
  
  throw new Error('所有提供商都不可用')
}
```

---

## 🔍 调试技巧

### 1. 启用调试日志

```typescript
import { logger } from './server/services/logger.service'

// 设置日志级别为 debug
logger.level = 'debug'
```

### 2. 查看原始请求

```typescript
const router = createModelRouter({
  providers: [
    {
      name: 'openai',
      apiKey: 'xxx',
      debug: true  // 启用调试模式
    }
  ]
})
```

### 3. 测试连接

```typescript
const results = await router.testConnections()
console.log('连接状态:', results)
// { openai: true, anthropic: true, ollama: false }
```

---

## 📝 常见问题

### Q: 如何切换模型？

```typescript
// 方法 1: 在请求时指定
await router.chat(messages, { model: 'gpt-4o' })

// 方法 2: 设置默认模型
router.setDefaultModel('claude-3-sonnet')

// 方法 3: 使用提供商/模型格式
await router.chat(messages, { model: 'anthropic/claude-3-sonnet' })
```

### Q: 如何支持更多提供商？

创建新的 Provider 类继承 `BaseLLMClient`，参考 `openai.provider.ts` 实现。

### Q: 流式输出中断怎么办？

检查网络连接，增加 timeout 配置：

```typescript
{
  name: 'openai',
  apiKey: 'xxx',
  timeout: 120000  // 增加到 2 分钟
}
```

### Q: 如何计算实际成本？

```typescript
const response = await router.chat(messages)
const cost = estimateCost(response.usage, response.model)
console.log(`本次调用成本：$${cost.total}`)
```

---

## 🔗 相关文档

- [OpenAI API 文档](https://platform.openai.com/docs)
- [Anthropic API 文档](https://docs.anthropic.com/claude/docs)
- [Ollama API 文档](https://github.com/ollama/ollama/blob/main/docs/api.md)

---

<div align="center">

**LLM 层 v1.0.0**

*统一的多模型大语言模型接口*

[支持提供商：3] [核心功能：完整] [生产就绪：是]

</div>
