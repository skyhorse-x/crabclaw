/**
 * Result Merger - 合并多个 Agent 的执行结果
 */

import type { TaskResult, FinalResult, Issue, FileChange, ExecutionEvent } from './types'
import { AgentPool } from './agent-pool'

export class ResultMerger {
  private pool: AgentPool
  private enableReview: boolean

  constructor(pool: AgentPool, enableReview: boolean = true) {
    this.pool = pool
    this.enableReview = enableReview
  }

  /** 合并结果，可选择性地运行 Review Agent */
  async *mergeWithEvents(results: Map<string, TaskResult>): AsyncGenerator<ExecutionEvent, FinalResult> {
    const allResults = Array.from(results.values())

    // 1. 收集所有文件变更
    const fileMap = new Map<string, FileChange>()
    const allIssues: Issue[] = []
    let totalTokens = 0
    let totalElapsedMs = 0

    for (const result of allResults) {
      totalTokens += result.usage.promptTokens + result.usage.completionTokens
      totalElapsedMs += result.elapsedMs

      // 收集文件变更
      for (const file of result.output.files || []) {
        const existing = fileMap.get(file.path)
        if (existing && existing.action !== 'create') {
          // 冲突检测：多个 Agent 修改了同一文件
          allIssues.push({
            severity: 'warning',
            message: `文件 ${file.path} 被多个 Agent 修改 (${existing.action} → ${file.action})`,
            file: file.path
          })
        }
        fileMap.set(file.path, file)
      }

      // 收集问题
      allIssues.push(...(result.output.issues || []))
    }

    // 2. 如果有 Review Agent，运行审查
    if (this.enableReview && this.pool.hasType('review')) {
      yield { type: 'review_start' }
      try {
        const reviewAgent = await this.pool.getAgent('review')
        const reviewResult = await reviewAgent.execute(
          {
            id: 'review',
            task: '审查所有变更的一致性',
            agentType: 'review',
            deps: [],
            context: {
              files: Array.from(fileMap.values()),
              issues: allIssues
            }
          },
          results
        )
        allIssues.push(...(reviewResult.output.issues || []))
        yield { type: 'review_complete', issues: reviewResult.output.issues || [] }
      } catch (error) {
        // Review 失败不阻塞主流程
        allIssues.push({
          severity: 'warning',
          message: `审查失败: ${error instanceof Error ? error.message : String(error)}`
        })
        yield { type: 'review_complete', issues: [] }
      }
    }

    // 3. 生成最终摘要
    const summary = this.generateSummary(allResults, Array.from(fileMap.values()), allIssues)
    const finalResult: FinalResult = {
      files: Array.from(fileMap.values()),
      issues: allIssues,
      summary,
      stats: {
        totalTokens,
        totalAgents: allResults.length,
        totalElapsedMs
      }
    }

    yield { type: 'merge_complete', result: finalResult }
    return finalResult
  }

  /** 生成执行摘要 */
  private generateSummary(results: TaskResult[], files: FileChange[], issues: Issue[]): string {
    const lines: string[] = []

    // 执行概况
    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length
    lines.push(`## 执行完成`)
    lines.push(`- 成功: ${successCount}/${results.length} 个任务`)
    if (failedCount > 0) {
      lines.push(`- 失败: ${failedCount} 个任务`)
    }
    lines.push('')

    // 文件变更
    if (files.length > 0) {
      lines.push('## 文件变更')
      for (const file of files) {
        const icon = file.action === 'create' ? '🆕' : file.action === 'delete' ? '🗑️' : '✏️'
        lines.push(`- ${icon} ${file.path} (${file.action})`)
      }
      lines.push('')
    }

    // 问题汇总
    const errors = issues.filter(i => i.severity === 'error')
    const warnings = issues.filter(i => i.severity === 'warning')
    if (errors.length > 0 || warnings.length > 0) {
      lines.push('## 注意事项')
      for (const issue of [...errors, ...warnings]) {
        const icon = issue.severity === 'error' ? '❌' : '⚠️'
        lines.push(`- ${icon} ${issue.message}`)
      }
    }

    return lines.join('\n')
  }
}
