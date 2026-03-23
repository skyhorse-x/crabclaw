# LLM Gateway 使用指南

## 📖 架构设计

### 调用流程

```
Agent
  ↓
LLM Client (统一调用入口)
  ↓
LLM Gateway (标准化 API)
  ↓
Model Router (模型选择)
  ↓
Provider Adapter (调用具体 API)
  ↓
Model API (OpenAI / Claude / Ollama)
```

### 目录结构

```
llm/
├── client.ts          # Agent 调用入口
├── gateway.ts         # 统一 LLM API
├── router.ts          # 模型路由
├── provider/          # 各模型适配
│   ├── openai.ts
│   ├── anthropic.ts
│   └── ollama.ts
├── types.ts           # 类型定义
└── index.ts           # 统一导出
```

---

## 🚀 快速开始

### 1. 基础配置

```typescript
import { createClient } from './server/llm'

const client = createClient({
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
  ],
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o',
  logging: true
})
```

### 2. 简单对话

```typescript
// 方法 1: 使用 Client
const response = await client.chat('你好，请介绍一下自己')
console.log(response)

// 方法 2: 使用便捷函数
import { llm } from './server/llm'
const response = await llm.chat('你好')
```

### 3. 多轮对话

```typescript
const messages = [
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
  { role: 'user', content: '帮我写一个 Python 函数' }
]

const response = await client.converse(messages)
console.log(response)
```

---

## 🎯 核心功能

### 1. 任务规划（使用 GPT-4）

```typescript
const plan = await client.plan('帮我创建一个 Node.js 项目')
console.log(plan)

// 输出：
// 1. 创建项目目录
// 2. 初始化 package.json
// 3. 安装依赖
// ...
```

### 2. 代码生成（使用 Claude）

```typescript
const code = await client.code(
  '创建一个 Express.js 服务器',
  '需要支持 CORS 和 JSON 解析'
)
console.log(code)
```

### 3. 工具调用

```typescript
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取天气',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: '城市名' }
        },
        required: ['location']
      }
    }
  }
]

const result = await client.withTools(
  [
    { role: 'user', content: '北京今天天气如何？' }
  ],
  tools
)

console.log(result.text)
console.log(result.toolCalls) // 工具调用信息
```

---

## 🔧 高级功能

### 1. 模型路由规则

```typescript
const client = createClient({
  providers: [
    { name: 'openai', apiKey: 'xxx', defaultModel: 'gpt-4o' },
    { name: 'anthropic', apiKey: 'xxx', defaultModel: 'claude-3-sonnet' },
    { name: 'ollama', baseURL: 'http://localhost:11434/api', defaultModel: 'llama3.1' }
  ],
  rules: [
    // 按任务类型路由
    { task: 'planning', provider: 'openai', model: 'gpt-4o' },
    { task: 'coding', provider: 'anthropic', model: 'claude-3-sonnet' },
    { task: 'local', provider: 'ollama', model: 'llama3.1' },
    
    // 按模型模式路由
    { pattern: 'claude-*', provider: 'anthropic' },
    { pattern: 'gpt-4*', provider: 'openai' },
    { pattern: 'llama*', provider: 'ollama' }
  ]
})

// 自动路由
await client.plan('任务规划')      // → GPT-4
await client.code('写代码')        // → Claude
await client.chat('简单对话')      // → 默认 (OpenAI)
```

### 2. 显式指定模型

```typescript
// 使用 provider/model 格式
const response = await client.chat('你好', {
  model: 'anthropic/claude-3-sonnet-20240229'
})

// 或直接在 generate 中指定
await client.generate({
  messages: [{ role: 'user', content: '你好' }],
  model: 'openai/gpt-4o'
})
```

### 3. 限流控制

```typescript
const client = createClient({
  providers: [...],
  rateLimit: 100  // 每分钟最多 100 个请求
})
```

### 4. 成本估算

```typescript
const client = createClient({
  providers: [...],
  costEstimation: true,
  logging: true
})

// 日志会显示：
// LLM 响应 { provider: 'openai', model: 'gpt-4o', cost: '$0.001234' }
```

### 5. 测试连接

```typescript
const results = await client.testConnections()
console.log(results)
// { openai: true, anthropic: true, ollama: false }
```

### 6. 获取可用模型

```typescript
const models = await client.listModels()
console.log(models)
// [
//   { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', ... },
//   { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', ... }
// ]
```

---

## 📊 使用场景

### 场景 1: Agent 任务规划

```typescript
import { BaseAgent } from './server/agents/base.agent'

class PlanningAgent extends BaseAgent {
  async plan(task: string) {
    const plan = await this.llm.plan(task)
    
    // 解析计划步骤
    const steps = this.parsePlan(plan)
    
    // 执行步骤
    for (const step of steps) {
      await this.executeStep(step)
    }
  }
}
```

### 场景 2: 代码生成 Agent

```typescript
class CodingAgent extends BaseAgent {
  async generateCode(requirements: string, context: string) {
    const code = await this.llm.code(requirements, context)
    
    // 写入文件
    await this.tools.execute('write_file', {
      path: './output.js',
      content: code
    })
  }
}
```

### 场景 3: 多模型对比

```typescript
const providers = client.getProviders()
const results: Record<string, string> = {}

for (const provider of providers) {
  const response = await client.chat('用一句话解释 AI', {
    model: `${provider}/default`
  })
  results[provider] = response
}

console.log('不同模型的回答:', results)
```

### 场景 4: 降级策略

```typescript
async function chatWithFallback(prompt: string) {
  const providers = ['openai', 'anthropic', 'ollama']
  
  for (const provider of providers) {
    try {
      return await client.chat(prompt, {
        model: provider === 'ollama' ? 'llama3.1' : undefined
      })
    } catch (error) {
      console.warn(`${provider} 失败，尝试下一个`)
    }
  }
  
  throw new Error('所有模型都不可用')
}
```

---

## ⚙️ 配置选项

### ClientConfig

```typescript
interface ClientConfig extends GatewayConfig {
  defaultTask?: string          // 默认任务类型
  defaultTemperature?: number   // 默认温度
  defaultMaxTokens?: number     // 默认最大 tokens
}
```

### GatewayConfig

```typescript
interface GatewayConfig extends RouterConfig {
  logging?: boolean             // 启用日志
  costEstimation?: boolean      // 启用成本估算
  rateLimit?: number            // 限流（每分钟请求数）
}
```

### RouterConfig

```typescript
interface RouterConfig {
  defaultProvider?: string      // 默认提供商
  defaultModel?: string         // 默认模型
  providers: ProviderConfig[]   // 提供商配置
  rules?: RoutingRule[]         // 路由规则
}
```

### ProviderConfig

```typescript
interface ProviderConfig {
  name: string                  // 提供商名称
  apiKey?: string               // API 密钥
  baseURL?: string              // API 基础 URL
  defaultModel?: string         // 默认模型
  timeout?: number              // 超时时间
  retries?: number              // 重试次数
}
```

---

## 🎯 最佳实践

### 1. 环境变量管理

```typescript
// .env
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，支持兼容 API

// config/llm.ts
export const llmConfig = {
  providers: [
    {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      defaultModel: 'gpt-4o'
    },
    {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-3-sonnet-20240229'
    }
  ]
}
```

### 2. 单例模式

```typescript
// lib/llm.ts
import { createClient } from './server/llm'

let _client: LLMClient | null = null

export function getLLMClient() {
  if (!_client) {
    _client = createClient(llmConfig)
  }
  return _client
}

// 使用
const llm = getLLMClient()
```

### 3. 日志记录

```typescript
import { logger } from './server/services/logger.service'

const client = createClient({
  providers: [...],
  logging: true
})

// 日志会自动记录：
// - 请求信息（provider, model, task, messagesCount）
// - 响应信息（duration, tokens, textLength）
// - 成本估算（如果启用）
// - 错误信息
```

### 4. 错误处理

```typescript
try {
  const response = await client.chat('你好')
} catch (error: any) {
  if (error.message.includes('rate limit')) {
    console.log('请求太频繁，请稍后重试')
  } else if (error.message.includes('timeout')) {
    console.log('请求超时')
  } else if (error.message.includes('API')) {
    console.log('API 错误:', error.message)
  } else {
    console.log('未知错误:', error)
  }
}
```

---

## 📊 支持的模型

### OpenAI

| 模型 | 上下文 | 工具 | 视觉 | 推荐用途 |
|------|--------|------|------|---------|
| gpt-4o | 128K | ✅ | ✅ | 综合任务 |
| gpt-4-turbo | 128K | ✅ | ✅ | 复杂任务 |
| gpt-3.5-turbo | 16K | ✅ | ❌ | 简单任务 |

### Anthropic

| 模型 | 上下文 | 工具 | 视觉 | 推荐用途 |
|------|--------|------|------|---------|
| claude-3-opus | 200K | ✅ | ✅ | 复杂推理 |
| claude-3-sonnet | 200K | ✅ | ✅ | 代码生成 |
| claude-3-haiku | 200K | ✅ | ✅ | 快速响应 |

### Ollama

| 模型 | 上下文 | 工具 | 视觉 | 推荐用途 |
|------|--------|------|------|---------|
| llama3.1 | 128K | ❌ | ❌ | 本地测试 |
| llama3 | 8K | ❌ | ❌ | 简单对话 |
| mistral | 8K | ❌ | ❌ | 快速响应 |

---

## 🔍 调试技巧

### 1. 启用详细日志

```typescript
const client = createClient({
  providers: [...],
  logging: true
})

// 设置日志级别为 debug
import { logger } from './server/services/logger.service'
logger.level = 'debug'
```

### 2. 查看原始响应

```typescript
const response = await client.generate({
  messages: [{ role: 'user', content: '你好' }]
})

console.log('原始响应:', response.raw)
console.log('文本:', response.text)
console.log('工具调用:', response.toolCalls)
console.log('使用统计:', response.usage)
```

### 3. 性能监控

```typescript
const startTime = Date.now()
await client.chat('你好')
const duration = Date.now() - startTime

console.log(`请求耗时：${duration}ms`)
```

---

## 🆚 对比旧架构

### 旧架构（Provider 模式）

```typescript
import { OpenAIProvider } from './llm/openai.provider'

const openai = new OpenAIProvider({ apiKey: 'xxx' })
const response = await openai.chat(messages)
```

### 新架构（Gateway 模式）

```typescript
import { createClient } from './server/llm'

const client = createClient({
  providers: [{ name: 'openai', apiKey: 'xxx' }]
})

const response = await client.chat('你好')
// 或
const response = await llm.chat('你好')  // 使用便捷函数
```

### 优势

| 特性 | 旧架构 | 新架构 |
|------|--------|--------|
| 统一接口 | ❌ | ✅ |
| 模型路由 | ❌ | ✅ |
| 成本控制 | ❌ | ✅ |
| 统一日志 | ❌ | ✅ |
| 限流 | ❌ | ✅ |
| 容灾 | ❌ | ✅ |

---

## 📝 常见问题

### Q: 如何切换模型？

```typescript
// 方法 1: 在请求时指定
await client.chat('你好', { model: 'claude-3-sonnet' })

// 方法 2: 使用 provider/model 格式
await client.chat('你好', { model: 'anthropic/claude-3-sonnet' })

// 方法 3: 设置路由规则
// 在配置中定义 rules
```

### Q: 如何添加新的 Provider？

1. 创建 `provider/custom.ts`
2. 实现 `Provider` 接口
3. 在 `router.ts` 中注册

```typescript
export class CustomProvider implements Provider {
  readonly name = 'custom'
  
  async generate(input: LLMRequest): Promise<LLMResponse> {
    // 实现逻辑
  }
}
```

### Q: 如何优化成本？

```typescript
const client = createClient({
  providers: [...],
  costEstimation: true,
  rules: [
    { task: 'simple', provider: 'ollama' },  // 简单任务用本地模型
    { task: 'complex', provider: 'openai' }   // 复杂任务用 GPT-4
  ]
})
```

---

## 🔗 相关文档

- [OpenAI API](https://platform.openai.com/docs)
- [Anthropic API](https://docs.anthropic.com/claude/docs)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

---

<div align="center">

**LLM Gateway v1.0.0**

*专业级 LLM 网关层 | 统一接口 | 智能路由*

[支持提供商：3] [核心功能：完整] [生产就绪：是]

</div>
