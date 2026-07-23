/**
 * DAG Executor - 按拓扑排序并行执行任务
 */

import type { TaskDAG, TaskNode, TaskResult, ExecutionEvent } from './types'
import { AgentPool } from './agent-pool'

export class DAGExecutor {
  private pool: AgentPool
  private abortController: AbortController | null = null

  constructor(pool: AgentPool) {
    this.pool = pool
  }

  /** 执行 DAG，返回 AsyncGenerator 以支持实时事件推送 */
  async *execute(dag: TaskDAG): AsyncGenerator<ExecutionEvent, Map<string, TaskResult>> {
    this.abortController = new AbortController()
    
    const results = new Map<string, TaskResult>()
    const running = new Set<string>()
    const failed = new Set<string>()

    yield { type: 'planning_complete', dag }

    let ready = dag.nodes.filter(n => n.deps.length === 0)
    
    while (ready.length > 0 || running.size > 0) {
      if (this.abortController.signal.aborted) {
        throw new Error('DAG execution aborted')
      }

      const toExecute = ready.slice(0, dag.parallelism - running.size)
      ready = ready.slice(toExecute.length)

      if (toExecute.length > 0) {
        const promises = toExecute.map(node => this.executeNode(node, results, running, failed))

        const batchResults = await Promise.all(promises)

        for (const events of batchResults) {
          for (const event of events) {
            yield event
          }
        }
      }

      const completedIds = new Set(results.keys())
      ready = dag.nodes.filter(n => 
        !completedIds.has(n.id) && 
        !running.has(n.id) &&
        n.deps.every(d => completedIds.has(d))
      )

      if (failed.size > 0) {
        for (const node of dag.nodes) {
          if (node.deps.some(d => failed.has(d)) && !completedIds.has(node.id)) {
            failed.add(node.id)
            results.set(node.id, {
              taskId: node.id,
              agentType: node.agentType,
              status: 'failed',
              output: { summary: '跳过：前置任务失败' },
              usage: { promptTokens: 0, completionTokens: 0 },
              elapsedMs: 0
            })
          }
        }
      }
    }

    return results
  }

  /** 执行单个节点，返回事件列表 */
  private async executeNode(
    node: TaskNode,
    results: Map<string, TaskResult>,
    running: Set<string>,
    failed: Set<string>
  ): Promise<ExecutionEvent[]> {
    const events: ExecutionEvent[] = []
    running.add(node.id)
    
    try {
      events.push({ type: 'agent_start', agentType: node.agentType, taskId: node.id, task: node.task })
      
      const agent = await this.pool.getAgent(node.agentType)
      
      events.push({ type: 'agent_progress', agentType: node.agentType, taskId: node.id, progress: '执行中...' })
      
      const result = await agent.execute(node, results)
      results.set(node.id, result)
      
      if (result.status === 'failed') {
        failed.add(node.id)
      }
      
      events.push({ type: 'agent_complete', agentType: node.agentType, taskId: node.id, result })
    } catch (error) {
      failed.add(node.id)
      const errorResult: TaskResult = {
        taskId: node.id,
        agentType: node.agentType,
        status: 'failed',
        output: {
          summary: `执行失败: ${error instanceof Error ? error.message : String(error)}`
        },
        usage: { promptTokens: 0, completionTokens: 0 },
        elapsedMs: 0
      }
      results.set(node.id, errorResult)
      events.push({ type: 'agent_error', agentType: node.agentType, taskId: node.id, error: error instanceof Error ? error.message : String(error) })
    } finally {
      running.delete(node.id)
    }

    return events
  }

  /** 中止执行 */
  abort(): void {
    this.abortController?.abort()
  }

  /** 获取执行状态摘要 */
  getStatus(results: Map<string, TaskResult>): {
    total: number
    success: number
    failed: number
    pending: number
  } {
    const all = Array.from(results.values())
    return {
      total: all.length,
      success: all.filter(r => r.status === 'success').length,
      failed: all.filter(r => r.status === 'failed').length,
      pending: all.filter(r => r.status === 'partial').length
    }
  }
}
