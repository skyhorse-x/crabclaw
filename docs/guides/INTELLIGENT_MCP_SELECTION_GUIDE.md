# 🧠 AI 自主选择 MCP 工具的实现机制

## 📋 核心问题

**用户问：AI 自主选择 MCP 是不是在请求的时候将安装的 MCP 服务器名称提交给 AI？**

**答案**: ✅ **是的，但不止如此！** 需要提供更丰富的上下文信息。

---

## 🎯 正确的实现方式

### ❌ **错误做法（信息不足）**

```typescript
// 只告诉 AI 有哪些 MCP 服务器
const prompt = `
可用的 MCP 服务器:
- filesystem
- browser
- memory

请选择一个服务器来完成任务：帮我读取 config.json 文件
`

// 问题：
// 1. AI 不知道每个服务器具体有什么工具
// 2. AI 不知道工具的参数格式
// 3. AI 无法评估哪个工具最适合
// 4. 可能导致错误的选择
```

---

### ✅ **正确做法（完整上下文）**

```typescript
interface McpToolInfo {
  server: string      // 服务器名称
  tool: string        // 工具名称
  description: string // 工具描述
  inputSchema: any    // JSON Schema 参数定义
  examples: any[]     // 使用示例
}

// 构建完整的工具上下文
const availableTools: McpToolInfo[] = [
  {
    server: 'filesystem',
    tool: 'read_file',
    description: '读取本地文件内容，支持 txt、json、md 等格式',
    inputSchema: {
      type: 'object',
      properties: {
        path: { 
          type: 'string', 
          description: '文件路径（绝对路径或相对路径）' 
        },
        encoding: { 
          type: 'string', 
          default: 'utf-8',
          description: '文件编码格式'
        }
      },
      required: ['path']
    },
    examples: [
      {
        task: '读取配置文件',
        call: {
          server: 'filesystem',
          tool: 'read_file',
          args: { path: './config.json' }
        }
      }
    ]
  },
  {
    server: 'filesystem',
    tool: 'write_file',
    description: '写入内容到文件，如果文件存在则覆盖',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '要写入的内容' }
      },
      required: ['path', 'content']
    }
  },
  {
    server: 'browser',
    tool: 'navigate',
    description: '控制浏览器访问指定 URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要访问的网址' },
        waitForLoad: { type: 'boolean', default: true }
      },
      required: ['url']
    }
  },
  {
    server: 'browser',
    tool: 'click',
    description: '模拟鼠标点击页面元素',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS 选择器' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] }
      },
      required: ['selector']
    }
  }
]

// 构建智能提示词
const prompt = `
你是一个智能助手，需要根据用户任务选择最合适的 MCP 工具。

## 可用工具列表

${availableTools.map(tool => `
### ${tool.server}/${tool.tool}
**描述**: ${tool.description}
**参数**: ${JSON.stringify(tool.inputSchema, null, 2)}
**示例**: ${JSON.stringify(tool.examples[0])}
`).join('\n')}

## 用户任务

${userTask}

## 输出要求

请按以下 JSON 格式返回选择结果：
{
  "selectedTool": {
    "server": "服务器名称",
    "tool": "工具名称"
  },
  "confidence": 0.0-1.0,  // 置信度
  "reasoning": "选择理由",
  "parameters": { ... }   // 推断的参数值
}

## 选择策略

1. 优先选择最直接解决问题的工具
2. 如果单个工具不够，可以推荐工具组合
3. 如果信息不足，请说明需要什么额外信息
4. 如果不确定，降低置信度并建议人工确认
`
```

---

## 💡 完整实现方案

### 1️⃣ **MCP 工具注册与发现**

```typescript
// server/services/mcp-tool-registry.ts

import { mcpService } from './mcp.service'
import { logger } from './logger.service'

/**
 * MCP 工具注册表
 */
export class McpToolRegistry {
  private tools: Map<string, McpToolDefinition> = new Map()
  
  /**
   * 初始化：从所有 MCP 服务器加载工具信息
   */
  async initialize(): Promise<void> {
    logger.info('[McpToolRegistry] Initializing...')
    
    // 获取所有已连接的 MCP 服务器
    const servers = await mcpService.getServers()
    
    for (const [serverName, serverInfo] of Object.entries(servers)) {
      // 获取该服务器的所有工具
      const serverTools = await mcpService.getTools(serverName)
      
      for (const tool of serverTools) {
        const toolKey = `${serverName}/${tool.name}`
        
        // 注册工具到全局注册表
        this.tools.set(toolKey, {
          server: serverName,
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
          capabilities: tool.capabilities || [],
          examples: [] // TODO: 从使用历史中学习
        })
        
        logger.debug(`[McpToolRegistry] Registered tool: ${toolKey}`)
      }
    }
    
    logger.info(`[McpToolRegistry] Initialized with ${this.tools.size} tools`)
  }
  
  /**
   * 获取所有可用工具（用于 AI 决策）
   */
  getAvailableTools(): McpToolDefinition[] {
    return Array.from(this.tools.values())
  }
  
  /**
   * 根据关键词搜索工具
   */
  searchTools(query: string): McpToolDefinition[] {
    const queryLower = query.toLowerCase()
    
    return Array.from(this.tools.values()).filter(tool => {
      return (
        tool.description.toLowerCase().includes(queryLower) ||
        tool.name.toLowerCase().includes(queryLower) ||
        tool.server.toLowerCase().includes(queryLower)
      )
    })
  }
  
  /**
   * 调用指定工具
   */
  async callTool(
    server: string, 
    tool: string, 
    args: Record<string, any>
  ): Promise<any> {
    const toolKey = `${server}/${tool}`
    
    if (!this.tools.has(toolKey)) {
      throw new Error(`工具未找到：${toolKey}`)
    }
    
    return await mcpService.callTool(server, tool, args)
  }
}

interface McpToolDefinition {
  server: string
  name: string
  description: string
  inputSchema: any
  capabilities: string[]
  examples: ToolExample[]
}

interface ToolExample {
  task: string
  call: {
    server: string
    tool: string
    args: Record<string, any>
  }
  result: any
}

export const mcpToolRegistry = new McpToolRegistry()
```

---

### 2️⃣ **AI 自主选择 MCP 工具的智能体**

```typescript
// server/agents/intelligent-mcp-agent.ts

import { BaseAgent, AgentContext, AgentResult } from './base.agent'
import { mcpToolRegistry } from '../services/mcp-tool-registry'
import { llm } from '../llm'
import { logger } from '../services/logger.service'

/**
 * 智能 MCP Agent
 * 负责 AI 驱动的 MCP 工具自主选择和调用
 */
export class IntelligentMcpAgent extends BaseAgent {
  readonly type = 'intelligent_mcp'
  
  /**
   * 执行智能工具选择流程
   */
  protected async doExecute(context: AgentContext): Promise<AgentResult> {
    const { task, variables } = context
    
    logger.info('[IntelligentMcpAgent] Starting intelligent tool selection', { 
      task 
    })
    
    try {
      // Step 1: 获取所有可用工具
      const availableTools = mcpToolRegistry.getAvailableTools()
      
      logger.debug(`[IntelligentMcpAgent] Found ${availableTools.length} available tools`)
      
      // Step 2: 构建 AI 决策提示词
      const prompt = this.buildDecisionPrompt(task, availableTools)
      
      // Step 3: 调用 LLM 进行决策
      const aiDecision = await this.makeAiDecision(prompt)
      
      logger.info('[IntelligentMcpAgent] AI decision made', {
        selectedTool: aiDecision.selectedTool,
        confidence: aiDecision.confidence
      })
      
      // Step 4: 置信度检查
      if (aiDecision.confidence < 0.7) {
        // 置信度低，建议人工确认
        return this.suggestHumanReview(aiDecision)
      }
      
      // Step 5: 自动执行工具调用
      const result = await this.executeToolCall(aiDecision)
      
      if (result.ok) {
        // Step 6: 记录成功经验
        await this.recordExperience(task, aiDecision, result.result, 'success')
        
        return this.success(result.result)
      } else {
        // 执行失败，记录教训
        await this.recordExperience(task, aiDecision, result.error, 'failure')
        
        return this.error(`工具执行失败：${result.error}`)
      }
      
    } catch (error: any) {
      logger.error('[IntelligentMcpAgent] Execution failed', error)
      return this.error(`智能工具选择异常：${error.message}`)
    }
  }
  
  /**
   * 构建 AI 决策提示词
   */
  private buildDecisionPrompt(
    task: string, 
    availableTools: McpToolDefinition[]
  ): string {
    const toolsDescription = availableTools.map(tool => `
## ${tool.server}/${tool.name}

**功能描述**: ${tool.description}

**参数规范**:
${JSON.stringify(tool.inputSchema, null, 2)}

**能力标签**: ${tool.capabilities.join(', ')}
`.trim()).join('\n\n')
    
    return `
你是一个智能 MCP 工具选择专家。你的任务是根据用户需求，从可用工具中选择最合适的工具并生成调用参数。

## 可用工具列表

${toolsDescription}

## 当前任务

${task}

## 输出要求

请严格按照以下 JSON 格式返回：

\`\`\`json
{
  "selectedTool": {
    "server": "选择的服务器名称",
    "tool": "选择的工具名称"
  },
  "parameters": {
    // 根据工具 inputSchema 填充参数
  },
  "confidence": 0.0-1.0,
  "reasoning": "详细说明选择理由",
  "alternatives": [
    // 备选方案（可选）
    {
      "server": "...",
      "tool": "...",
      "reason": "为什么不首选这个工具"
    }
  ],
  "warnings": [
    // 需要注意的事项（可选）
  ]
}
\`\`\`

## 选择策略

1. **直接匹配**: 如果有工具能直接解决问题，优先选择
2. **组合方案**: 如果单个工具不够，推荐工具组合（按顺序执行）
3. **信息不足**: 如果需要更多信息才能决定，请明确指出
4. **安全保守**: 如果不确定，降低置信度并建议人工确认

## 示例

### 示例 1: 简单的文件读取
任务："帮我读取 config.json 文件"
响应：
\`\`\`json
{
  "selectedTool": {
    "server": "filesystem",
    "tool": "read_file"
  },
  "parameters": {
    "path": "config.json",
    "encoding": "utf-8"
  },
  "confidence": 0.95,
  "reasoning": "这是一个简单的文件读取任务，filesystem/read_file 工具专门用于此目的"
}
\`\`\`

### 示例 2: 需要多步骤的任务
任务："帮我在淘宝搜索 iPhone 15，并把搜索结果保存到 results.txt"
响应：
\`\`\`json
{
  "selectedTool": {
    "server": "browser",
    "tool": "navigate"
  },
  "parameters": {
    "url": "https://www.taobao.com"
  },
  "confidence": 0.85,
  "reasoning": "这是多步骤任务的第 1 步：先打开淘宝网站。后续还需要搜索、保存等操作",
  "nextSteps": [
    {
      "server": "browser",
      "tool": "type",
      "description": "在搜索框输入'iPhone 15'"
    },
    {
      "server": "browser",
      "tool": "click",
      "description": "点击搜索按钮"
    }
  ]
}
\`\`\`

现在请为当前任务选择最合适的工具：
`
  }
  
  /**
   * 调用 LLM 进行决策
   */
  private async makeAiDecision(prompt: string): Promise<AiDecision> {
    const response = await llm.converse([
      {
        role: 'system',
        content: '你是一个专业的 MCP 工具选择专家。你需要根据用户任务和可用工具，选择最合适的工具并生成正确的调用参数。'
      },
      {
        role: 'user',
        content: prompt
      }
    ], {
      temperature: 0.3,  // 较低温度，保证稳定性
      max_tokens: 2000
    })
    
    // 解析 AI 响应
    const decision = this.parseAiResponse(response)
    
    // 验证决策合法性
    this.validateDecision(decision)
    
    return decision
  }
  
  /**
   * 解析 AI 响应
   */
  private parseAiResponse(response: string): AiDecision {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1].trim())
      }
      
      // 尝试直接解析
      return JSON.parse(response)
    } catch (error) {
      logger.error('[IntelligentMcpAgent] Failed to parse AI response', error)
      throw new Error('AI 响应解析失败')
    }
  }
  
  /**
   * 验证 AI 决策
   */
  private validateDecision(decision: AiDecision): void {
    // 检查工具是否存在
    const toolKey = `${decision.selectedTool.server}/${decision.selectedTool.tool}`
    const registeredTool = mcpToolRegistry.getAvailableTools().find(
      t => `${t.server}/${t.name}` === toolKey
    )
    
    if (!registeredTool) {
      throw new Error(`选择的工具不存在：${toolKey}`)
    }
    
    // 检查参数是否符合 schema
    this.validateParameters(
      decision.parameters, 
      registeredTool.inputSchema
    )
    
    // 检查置信度范围
    if (decision.confidence < 0 || decision.confidence > 1) {
      throw new Error('置信度必须在 0-1 之间')
    }
  }
  
  /**
   * 验证参数
   */
  private validateParameters(params: any, schema: any): void {
    // TODO: 实现 JSON Schema 验证
    // 这里可以使用 ajv 或其他 validation 库
  }
  
  /**
   * 执行工具调用
   */
  private async executeToolCall(decision: AiDecision): Promise<any> {
    const { server, tool } = decision.selectedTool
    
    logger.info('[IntelligentMcpAgent] Executing tool call', {
      server,
      tool,
      params: decision.parameters
    })
    
    return await mcpToolRegistry.callTool(server, tool, decision.parameters)
  }
  
  /**
   * 建议人工审核（置信度低时）
   */
  private suggestHumanReview(decision: AiDecision): AgentResult {
    return {
      success: false,
      data: {
        type: 'human_review_required',
        decision,
        reason: `置信度 ${decision.confidence} 低于阈值 0.7，建议人工确认`,
        suggestions: [
          '可以直接执行推荐的工具调用',
          '可以调整参数后重新执行',
          '可以选择其他备选方案'
        ]
      },
      message: '需要人工确认'
    }
  }
  
  /**
   * 记录经验（用于持续学习）
   */
  private async recordExperience(
    task: string,
    decision: AiDecision,
    outcome: any,
    resultType: 'success' | 'failure'
  ): Promise<void> {
    // TODO: 保存到经验数据库
    // 用于未来遇到类似任务时提供参考
    
    const experience = {
      task,
      decision,
      outcome,
      resultType,
      timestamp: new Date().toISOString()
    }
    
    logger.info('[IntelligentMcpAgent] Experience recorded', experience)
  }
}

interface AiDecision {
  selectedTool: {
    server: string
    tool: string
  }
  parameters: Record<string, any>
  confidence: number
  reasoning: string
  alternatives?: Array<{
    server: string
    tool: string
    reason: string
  }>
  warnings?: string[]
  nextSteps?: Array<{
    server: string
    tool: string
    description: string
  }>
}
```

---

### 3️⃣ **实际使用示例**

#### ✅ **场景 1: 简单任务 - 自动选择工具**

```typescript
// 用户任务
const task = '帮我读取 ./data/config.json 文件'

// 创建 Agent 上下文
const context: AgentContext = {
  task,
  variables: {}
}

// 执行智能选择
const agent = new IntelligentMcpAgent()
const result = await agent.execute(context)

console.log(result)
// 输出:
// {
//   success: true,
//   data: {
//     content: '{ "apiUrl": "https://...", "timeout": 5000 }',
//     metadata: {
//       size: 1024,
//       encoding: 'utf-8'
//     }
//   },
//   message: '成功读取配置文件'
// }

// AI 的内部决策过程：
// 1. 获取所有可用工具（10 个）
// 2. 分析任务关键词："读取" + "文件"
// 3. 匹配到 filesystem/read_file
// 4. 生成参数：{ path: './data/config.json' }
// 5. 置信度：0.95（很有把握）
// 6. 执行调用，成功返回
```

---

#### ✅ **场景 2: 复杂任务 - 多步骤规划**

```typescript
// 用户任务
const task = '帮我在淘宝搜索 iPhone 15 Pro Max，把前 10 个商品的价格保存到 prices.txt'

const context: AgentContext = { task }

const agent = new IntelligentMcpAgent()
const result = await agent.execute(context)

console.log(result.data)
// AI 返回的多步骤计划：
{
  "currentStep": {
    "server": "browser",
    "tool": "navigate",
    "parameters": {
      "url": "https://www.taobao.com"
    }
  },
  "fullPlan": [
    {
      "step": 1,
      "server": "browser",
      "tool": "navigate",
      "description": "打开淘宝首页"
    },
    {
      "step": 2,
      "server": "browser",
      "tool": "type",
      "description": "在搜索框输入'iPhone 15 Pro Max'"
    },
    {
      "step": 3,
      "server": "browser",
      "tool": "click",
      "description": "点击搜索按钮"
    },
    {
      "step": 4,
      "server": "browser",
      "tool": "scrape",
      "description": "提取前 10 个商品价格"
    },
    {
      "step": 5,
      "server": "filesystem",
      "tool": "write_file",
      "description": "保存价格到 prices.txt"
    }
  ],
  "confidence": 0.85,
  "reasoning": "这是多步骤任务，需要依次执行浏览器操作和文件保存"
}
```

---

#### ✅ **场景 3: 低置信度 - 请求人工介入**

```typescript
// 模糊的任务
const task = '帮我处理一下那个数据'

const context: AgentContext = { task }

const agent = new IntelligentMcpAgent()
const result = await agent.execute(context)

console.log(result)
// AI 返回需要人工确认：
{
  "success": false,
  "data": {
    "type": "human_review_required",
    "decision": {
      "selectedTool": null,
      "confidence": 0.3,
      "reasoning": "任务描述过于模糊，无法确定具体需求"
    },
    "questions": [
      "什么类型的数据？（文件、网页、数据库？）",
      "需要如何处理？（转换格式、分析、清理？）",
      "输入来源是什么？",
      "期望输出是什么？"
    ]
  },
  "message": "需要人工确认任务细节"
}
```

---

## 📊 关键要点总结

### ✅ **正确的 MCP 工具自主选择流程**

```
1. 收集完整上下文
   ├─ 所有 MCP 服务器名称 ✅
   ├─ 每个服务器的工具列表 ✅
   ├─ 每个工具的详细描述 ✅
   ├─ 工具的参数 Schema ✅
   └─ 历史使用示例（可选）✅

2. 构建 AI 决策提示词
   ├─ 清晰的任务描述 ✅
   ├─ 完整的工具信息 ✅
   ├─ 明确的输出格式 ✅
   └─ 合理的约束条件 ✅

3. AI 推理决策
   ├─ 理解任务意图 ✅
   ├─ 匹配最佳工具 ✅
   ├─ 生成调用参数 ✅
   ├─ 评估置信度 ✅
   └─ 提供选择理由 ✅

4. 执行与反馈
   ├─ 自动执行（高置信度）✅
   ├─ 人工确认（低置信度）✅
   ├─ 记录成功经验 ✅
   └─ 持续学习优化 ✅
```

---

### ⚠️ **常见误区**

#### ❌ **误区 1: 只告诉 AI 服务器名称**

```typescript
// 错误示范
const prompt = `
可用 MCP 服务器：filesystem, browser, memory
任务：读取 config.json
选择哪个？
`

// 问题：
// - AI 不知道 filesystem 有 read_file 工具
// - AI 不知道 read_file 需要什么参数
// - AI 只能瞎猜
```

---

#### ❌ **误区 2: 工具信息不完整**

```typescript
// 不完整的信息
const tools = [
  { server: 'filesystem', tools: ['read_file', 'write_file'] }
  // 缺少描述、参数 schema、示例
]

// 问题：
// - AI 不知道 read_file 和 write_file 的区别
// - AI 不知道参数格式
// - 容易生成错误的调用
```

---

#### ❌ **误区 3: 缺少置信度评估**

```typescript
// AI 总是很自信
const decision = {
  selectedTool: 'filesystem/read_file',
  parameters: { path: 'unknown' }
  // 没有 confidence 字段
}

// 风险：
// - 即使不确定也自动执行
// - 可能执行错误操作
// - 缺少安全检查
```

---

## 🎯 最佳实践建议

### ✅ **提供给 AI 的 MCP 工具信息应该包括**:

```typescript
const completeToolInfo = {
  // 1. 基础信息
  server: 'filesystem',
  name: 'read_file',
  
  // 2. 功能描述（自然语言）
  description: '读取本地文本文件内容，支持 UTF-8 和 GBK 编码',
  
  // 3. 参数规范（JSON Schema）
  inputSchema: {
    type: 'object',
    properties: {
      path: { 
        type: 'string', 
        description: '文件路径',
        examples: ['./config.json', '/home/user/data.txt']
      },
      encoding: { 
        type: 'string', 
        default: 'utf-8',
        enum: ['utf-8', 'gbk', 'ascii'],
        description: '文件编码格式'
      }
    },
    required: ['path']
  },
  
  // 4. 能力边界
  capabilities: [
    '读取小文件 (<10MB)',
    '支持多种编码',
    '自动检测编码'
  ],
  limitations: [
    '不能读取二进制文件',
    '不能读取超大文件',
    '需要文件读权限'
  ],
  
  // 5. 使用示例
  examples: [
    {
      task: '读取 JSON 配置文件',
      call: {
        server: 'filesystem',
        tool: 'read_file',
        args: { path: './config.json' }
      }
    }
  ],
  
  // 6. 相关工具
  relatedTools: [
    'filesystem/write_file (写入文件)',
    'filesystem/delete_file (删除文件)',
    'filesystem/list_directory (列出目录)'
  ]
}
```

---

### ✅ **AI 决策输出应该包括**:

```typescript
const aiDecisionOutput = {
  // 1. 选择的工具
  selectedTool: {
    server: 'filesystem',
    tool: 'read_file'
  },
  
  // 2. 调用参数
  parameters: {
    path: './config.json',
    encoding: 'utf-8'
  },
  
  // 3. 置信度（必须 0-1）
  confidence: 0.95,
  
  // 4. 选择理由（透明化）
  reasoning: `
    1. 任务关键词"读取"和"文件"直接匹配 read_file 工具
    2. .json 后缀表明是文本文件，适合用 read_file
    3. 这是最常见的使用场景，历史成功率很高
  `,
  
  // 5. 备选方案（可选）
  alternatives: [
    {
      server: 'filesystem',
      tool: 'read_file_binary',
      reason: '备用方案，但通常不需要'
    }
  ],
  
  // 6. 警告和注意事项（可选）
  warnings: [
    '确保文件存在且可读',
    '大文件可能需要较长时间'
  ],
  
  // 7. 下一步建议（多步骤任务）
  nextSteps: [
    {
      server: 'memory',
      tool: 'save_to_context',
      description: '将读取的内容保存到上下文变量'
    }
  ]
}
```

---

## 🏆 最终结论

### 回答用户问题：

**Q: AI 自主选择 MCP 是不是在请求的时候将安装的 MCP 服务器名称提交给 AI？**

**A**: 

✅ **是的，需要提交服务器名称，但这远远不够！**

**完整的 MCP 工具信息应该包括**:

| 信息层级 | 内容 | 必要性 |
|---------|------|--------|
| **L1: 服务器名称** | `filesystem`, `browser` | ✅ 必需 |
| **L2: 工具列表** | `read_file`, `write_file` | ✅ 必需 |
| **L3: 功能描述** | 自然语言说明用途 | ✅ 必需 |
| **L4: 参数 Schema** | JSON Schema 定义 | ✅ 必需 |
| **L5: 使用示例** | 典型场景和调用示例 | ⭐ 强烈推荐 |
| **L6: 能力边界** | 能做什么、不能做什么 | ⭐ 推荐 |
| **L7: 历史经验** | 成功率和失败案例 | 🔥 进阶 |

**AI 决策输出应该包括**:

- ✅ 选择的工具和参数
- ✅ 置信度评估（0-1）
- ✅ 透明的选择理由
- ✅ 备选方案
- ✅ 警告和注意事项

**这样才能实现真正的智能自主选择！** 🧠

---

<div align="center">

**MiniMonkey MCP 智能调用实现指南 v1.0**

*从"手动指定"到"AI 自主选择"的进化之路*

[手动指定 20%] → [规则匹配 50%] → [AI 辅助 80%] → [完全自主 100%]

</div>
