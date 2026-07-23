/**
 * Worker Agent - 执行单个子任务
 */

import type { AgentConfig, TaskNode, TaskResult, FileChange, Issue } from './types'
import { llm } from '../llm/client'
import type { LLMRequest } from '../llm/types'

/** Worker Agent 执行上下文 */
interface WorkerContext {
  taskId: string
  task: string
  agentType: string
  deps: Map<string, TaskResult>
  globalContext?: Record<string, unknown>
}

export class WorkerAgent {
  public readonly type: string
  private config: AgentConfig

  constructor(config: AgentConfig) {
    this.type = config.type
    this.config = config
  }

  /** 初始化 Agent（建立 MCP 会话等） */
  async initialize(): Promise<void> {
    // 预留：未来可为每个 Agent 建立独立的 MCP 会话
  }

  /** 清理资源 */
  async cleanup(): Promise<void> {
    // 预留：释放 MCP 会话
  }

  /** 执行任务 */
  async execute(
    node: TaskNode,
    completedTasks: Map<string, TaskResult>
  ): Promise<TaskResult> {
    const startTime = Date.now()

    try {
      // 1. 构建上下文
      const depContext = this.buildDependencyContext(node, completedTasks)
      const userMessage = depContext
        ? `${node.task}\n\n## 依赖任务结果\n${depContext}`
        : node.task

      // 2. 构建系统提示词
      const systemPrompt = this.buildSystemPrompt(node)

      // 3. 调用 LLM
      const response = await this.callLLM(systemPrompt, userMessage)

      // 4. 解析结构化输出
      const result = this.parseResponse(response, node, startTime)

      return result
    } catch (error) {
      return {
        taskId: node.id,
        agentType: this.type,
        status: 'failed',
        output: {
          summary: `执行失败: ${error instanceof Error ? error.message : String(error)}`
        },
        usage: { promptTokens: 0, completionTokens: 0 },
        elapsedMs: Date.now() - startTime
      }
    }
  }

  /** 构建依赖任务上下文 */
  private buildDependencyContext(
    node: TaskNode,
    completedTasks: Map<string, TaskResult>
  ): string | null {
    if (node.deps.length === 0) return null

    const parts: string[] = []
    for (const depId of node.deps) {
      const depResult = completedTasks.get(depId)
      if (depResult) {
        parts.push(`### 任务 ${depId} (${depResult.agentType})\n${depResult.output.summary}`)
        if (depResult.output.files?.length) {
          parts.push(`修改文件: ${depResult.output.files.map(f => f.path).join(', ')}`)
        }
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null
  }

  /** 构建系统提示词 */
  private buildSystemPrompt(node: TaskNode): string {
    let prompt = this.config.systemPrompt

    // 添加工具提示
    if (this.config.tools.length > 0) {
      prompt += `\n\n## 可用工具\n${this.config.tools.join(', ')}`
    }

    // 添加上下文路径
    if (this.config.context?.length) {
      prompt += `\n\n## 相关文件路径\n${this.config.context.join('\n')}`
    }

    // 输出格式要求
    prompt += `\n\n## 输出要求\n请以 JSON 格式返回结果：\n\`\`\`json\n{\n  "summary": "执行摘要",\n  "files": [{ "path": "文件路径", "action": "create|modify|delete", "diff": "变更内容（可选）" }],\n  "issues": [{ "severity": "error|warning|info", "message": "问题描述", "file": "相关文件（可选）" }],\n  "suggestions": ["建议1", "建议2"]\n}\n\`\`\``

    return prompt
  }

  /** 调用 LLM */
  private async callLLM(systemPrompt: string, userMessage: string): Promise<string> {
    const request: LLMRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: this.config.maxTokens || 4096,
      stream: false
    }
    const response = await llm.generate(request)
    return response.text
  }

  /** 解析 LLM 响应为结构化输出 */
  private parseResponse(
    response: string,
    node: TaskNode,
    startTime: number
  ): TaskResult {
    let parsed: {
      summary?: string
      files?: FileChange[]
      issues?: Issue[]
      suggestions?: string[]
    }

    try {
      // 尝试从 Markdown 代码块中提取 JSON
      const codeBlockMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
      if (codeBlockMatch) {
        parsed = JSON.parse(codeBlockMatch[1])
      } else {
        // 尝试直接解析为 JSON
        parsed = JSON.parse(response)
      }
    } catch {
      // 解析失败时，将整个响应作为 summary
      parsed = {
        summary: response.slice(0, 500),
        issues: [],
        suggestions: []
      }
    }

    return {
      taskId: node.id,
      agentType: this.type,
      status: 'success',
      output: {
        summary: parsed.summary || '执行完成',
        files: parsed.files || [],
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || []
      },
      usage: { promptTokens: 0, completionTokens: 0 },
      elapsedMs: Date.now() - startTime
    }
  }
}
