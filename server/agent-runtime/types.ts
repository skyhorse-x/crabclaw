/**
 * Multi-Agent Runtime 类型定义
 */

/** Agent 类型标识 */
export type AgentType = 'frontend' | 'backend' | 'test' | 'review' | 'security' | string

/** Agent 配置 */
export interface AgentConfig {
  type: AgentType
  name: string
  systemPrompt: string
  tools: string[]
  context?: string[]
  maxTokens?: number
}

/** 任务节点（DAG 中的单个节点） */
export interface TaskNode {
  id: string
  task: string
  agentType: AgentType
  deps: string[]
  context?: Record<string, unknown>
}

/** 任务 DAG */
export interface TaskDAG {
  nodes: TaskNode[]
  parallelism: number
}

/** 文件变更 */
export interface FileChange {
  path: string
  action: 'create' | 'modify' | 'delete'
  diff?: string
}

/** 问题/建议 */
export interface Issue {
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
}

/** Worker Agent 执行结果 */
export interface TaskResult {
  taskId: string
  agentType: AgentType
  status: 'success' | 'partial' | 'failed'
  output: {
    files?: FileChange[]
    issues?: Issue[]
    suggestions?: string[]
    summary: string
  }
  usage: {
    promptTokens: number
    completionTokens: number
  }
  elapsedMs: number
}

/** 最终合并结果 */
export interface FinalResult {
  files: FileChange[]
  issues: Issue[]
  summary: string
  stats: {
    totalTokens: number
    totalAgents: number
    totalElapsedMs: number
  }
}

/** 执行事件（实时推送到前端） */
export type ExecutionEvent =
  | { type: 'planning_start' }
  | { type: 'planning_complete'; dag: TaskDAG }
  | { type: 'agent_start'; agentType: AgentType; taskId: string; task: string }
  | { type: 'agent_progress'; agentType: AgentType; taskId: string; progress: string }
  | { type: 'agent_complete'; agentType: AgentType; taskId: string; result: TaskResult }
  | { type: 'agent_error'; agentType: AgentType; taskId: string; error: string }
  | { type: 'review_start' }
  | { type: 'review_complete'; issues: Issue[] }
  | { type: 'merge_start' }
  | { type: 'merge_complete'; result: FinalResult }

/** 多 Agent 运行时配置 */
export interface RuntimeConfig {
  agentConfigPath: string
  maxParallelism: number
  taskTimeoutMs: number
  enableReview: boolean
}
