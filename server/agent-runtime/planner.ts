/**
 * Task Planner - 将复杂任务拆解为 DAG
 */

import type { TaskDAG, TaskNode, AgentType } from './types'
import { llm } from '../llm/client'
import type { LLMRequest } from '../llm/types'
import { createId } from '../shared/utils/common.util'

/** Planner 配置 */
interface PlannerConfig {
  maxParallelism: number
  registeredTypes: AgentType[]
}

/** LLM 输出的任务计划格式 */
interface PlannedTask {
  id: string
  task: string
  agent: string
  deps: string[]
}

export class TaskPlanner {
  private config: PlannerConfig

  constructor(config: PlannerConfig) {
    this.config = {
      maxParallelism: 3,
      ...config
    }
  }

  /** 规划任务，输出 DAG */
  async plan(userMessage: string): Promise<TaskDAG> {
    const prompt = this.buildPlannerPrompt(userMessage)
    const response = await llm.generate(prompt)
    
    try {
      const tasks = this.parsePlanResponse(response.text)
      return this.buildDAG(tasks)
    } catch (error) {
      // 解析失败时返回单任务 DAG
      return this.createSingleTaskDAG(userMessage)
    }
  }

  /** 构建 Planner 提示词 */
  private buildPlannerPrompt(userMessage: string): LLMRequest {
    const agentDescriptions = this.config.registeredTypes.map(type => {
      const descriptions: Record<string, string> = {
        frontend: 'frontend - 前端工程师，负责 Vue 组件、页面、UI 修改',
        backend: 'backend - 后端工程师，负责 API、服务、数据库操作',
        test: 'test - 测试工程师，负责生成单元测试、E2E 测试',
        review: 'review - 代码审查，负责检查前后端一致性、API 匹配',
        security: 'security - 安全专家，负责发现安全漏洞'
      }
      return descriptions[type] || type
    }).join('\n')

    return {
      messages: [
        {
          role: 'system',
          content: `你是任务规划器，负责将用户任务拆解为可并行执行的子任务。

## 可用 Agent 类型
${agentDescriptions}

## 规则
1. 每个任务必须指定一个 Agent 类型
2. deps 填入前置任务的 id（无依赖为空数组）
3. 最多 ${this.config.maxParallelism} 个任务可以并行执行
4. 任务描述要具体明确，包含文件路径和预期输出

## 输出格式
纯 JSON 数组，不要包含 Markdown 代码块：
[
  { "id": "1", "task": "具体任务描述", "agent": "agent类型", "deps": [] },
  { "id": "2", "task": "具体任务描述", "agent": "agent类型", "deps": ["1"] }
]`
        },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 2048,
      stream: false,
      temperature: 0.3
    }
  }

  /** 解析 LLM 响应 */
  private parsePlanResponse(response: string): PlannedTask[] {
    // 尝试从 Markdown 代码块提取
    let jsonStr = response
    const codeBlockMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1]
    }

    // 找到 JSON 数组
    const arrayStart = jsonStr.indexOf('[')
    const arrayEnd = jsonStr.lastIndexOf(']')
    if (arrayStart === -1 || arrayEnd === -1) {
      throw new Error('未找到 JSON 数组')
    }

    const tasks: PlannedTask[] = JSON.parse(jsonStr.slice(arrayStart, arrayEnd + 1))
    return tasks
  }

  /** 构建 DAG */
  private buildDAG(tasks: PlannedTask[]): TaskDAG {
    const nodes: TaskNode[] = tasks.map(t => ({
      id: t.id,
      task: t.task,
      agentType: this.validateAgentType(t.agent),
      deps: t.deps.filter(d => tasks.some(tt => tt.id === d))
    }))

    return {
      nodes,
      parallelism: this.config.maxParallelism
    }
  }

  /** 验证 Agent 类型 */
  private validateAgentType(type: string): AgentType {
    if (this.config.registeredTypes.includes(type)) {
      return type as AgentType
    }
    // 默认使用 frontend
    return 'frontend'
  }

  /** 回退：创建单任务 DAG */
  private createSingleTaskDAG(userMessage: string): TaskDAG {
    return {
      nodes: [{
        id: createId(),
        task: userMessage,
        agentType: 'frontend',
        deps: []
      }],
      parallelism: 1
    }
  }
}
