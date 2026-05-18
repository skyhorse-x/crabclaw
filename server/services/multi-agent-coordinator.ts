/**
 * 多Agent协作管理器
 * 负责任务分解、子Agent调度和结果汇总
 */

import { logger } from './logger.service'
import { reflectionService, type ExecutionRecord, type ReflectionResult } from './reflection.service'
import { experienceStore, type Experience } from './experience-store'

export interface SubTask {
  id: string
  description: string
  assignedAgent?: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: any
  error?: string
  dependencies: string[]
}

export interface TaskResult {
  taskId: string
  overallSuccess: boolean
  subTasks: SubTask[]
  reflection?: ReflectionResult
  learnedFromPast?: Experience[]
  summary: string
  suggestions: string[]
}

export class MultiAgentCoordinator {
  private static instance: MultiAgentCoordinator
  private activeTasks: Map<string, {
    subTasks: SubTask[]
    startTime: number
    results: any[]
  }> = new Map()

  private constructor() {}

  static getInstance(): MultiAgentCoordinator {
    if (!MultiAgentCoordinator.instance) {
      MultiAgentCoordinator.instance = new MultiAgentCoordinator()
    }
    return MultiAgentCoordinator.instance
  }

  /**
   * 分解任务为子任务
   */
  async decomposeTask(goal: string, _availableTools: string[]): Promise<SubTask[]> {
    const subTasks: SubTask[] = []

    const hasFileOperation = goal.includes('文件') || goal.includes('创建') || goal.includes('写入')
    const hasBrowserOperation = goal.includes('浏览器') || goal.includes('网页') || goal.includes('搜索')
    const hasShellOperation = goal.includes('命令') || goal.includes('终端') || goal.includes('执行')
    const hasNetworkOperation = goal.includes('搜索') || goal.includes('获取') || goal.includes('请求')

    if (hasFileOperation) {
      subTasks.push({
        id: 'file_task',
        description: '文件操作任务',
        status: 'pending',
        dependencies: []
      })
    }

    if (hasBrowserOperation) {
      subTasks.push({
        id: 'browser_task',
        description: '浏览器自动化任务',
        status: 'pending',
        dependencies: hasFileOperation ? ['file_task'] : []
      })
    }

    if (hasShellOperation) {
      subTasks.push({
        id: 'shell_task',
        description: 'Shell命令执行任务',
        status: 'pending',
        dependencies: []
      })
    }

    if (hasNetworkOperation) {
      subTasks.push({
        id: 'network_task',
        description: '网络请求任务',
        status: 'pending',
        dependencies: []
      })
    }

    if (subTasks.length === 0) {
      subTasks.push({
        id: 'default_task',
        description: goal,
        status: 'pending',
        dependencies: []
      })
    }

    logger.info('[MultiAgent] Task decomposed', {
      goal,
      subTaskCount: subTasks.length,
      taskIds: subTasks.map(t => t.id)
    })

    return subTasks
  }

  /**
   * 调度子任务并行执行
   */
  async executeSubTasksParallel(
    taskId: string,
    subTasks: SubTask[],
    executor: (task: SubTask) => Promise<any>
  ): Promise<SubTask[]> {
    const taskInfo = {
      subTasks: subTasks.map(t => ({ ...t })),
      startTime: Date.now(),
      results: [] as any[]
    }

    this.activeTasks.set(taskId, taskInfo)

    const executeWithDeps = async (task: SubTask): Promise<void> => {
      if (task.status !== 'pending') {
        return
      }

      const deps = task.dependencies || []
      const depsMet = deps.every(depId => {
        const dep = taskInfo.subTasks.find(t => t.id === depId)
        return dep && dep.status === 'done'
      })

      if (!depsMet) {
        await new Promise(resolve => setTimeout(resolve, 100))
        if (deps.every(depId => {
          const dep = taskInfo.subTasks.find(t => t.id === depId)
          return dep && dep.status === 'done'
        })) {
          await executeWithDeps(task)
        }
        return
      }

      task.status = 'running'
      logger.info('[MultiAgent] SubTask started', { taskId, subTaskId: task.id })

      try {
        const result = await executor(task)
        task.status = 'done'
        task.result = result
        taskInfo.results.push({ taskId: task.id, success: true, result })
        logger.info('[MultiAgent] SubTask completed', { taskId, subTaskId: task.id })
      } catch (error: any) {
        task.status = 'failed'
        task.error = error.message
        taskInfo.results.push({ taskId: task.id, success: false, error: error.message })
        logger.error('[MultiAgent] SubTask failed', { taskId, subTaskId: task.id, error: error.message })
      }
    }

    const pendingTasks = taskInfo.subTasks.filter(t => t.status === 'pending')
    await Promise.all(pendingTasks.map(task => executeWithDeps(task)))

    return taskInfo.subTasks
  }

  /**
   * 执行后反思
   */
  async reflectOnExecution(
    taskId: string,
    goal: string,
    subTasks: SubTask[],
    duration: number
  ): Promise<ReflectionResult> {
    const record: ExecutionRecord = {
      taskId,
      goal,
      steps: subTasks.map(t => ({
        tool: t.id,
        server: 'coordinator',
        success: t.status === 'done',
        error: t.error,
        duration: 0
      })),
      overallSuccess: subTasks.every(t => t.status === 'done'),
      duration,
      timestamp: Date.now()
    }

    const reflection = await reflectionService.reflect(record)

    if (!reflection.shouldRetry && reflection.errorPatterns.length > 0) {
      await experienceStore.add(
        this.categorizeTask(goal),
        goal,
        reflection.improvedApproach || '',
        false,
        reflection.errorPatterns,
        reflection.suggestions
      )
    }

    return reflection
  }

  /**
   * 分类任务
   */
  private categorizeTask(goal: string): string {
    if (goal.includes('文件') || goal.includes('创建')) return 'file_operation'
    if (goal.includes('浏览器') || goal.includes('网页')) return 'browser_automation'
    if (goal.includes('搜索')) return 'search'
    if (goal.includes('命令') || goal.includes('终端')) return 'shell'
    return 'general'
  }

  /**
   * 获取历史经验
   */
  async getRelevantExperience(goal: string): Promise<Experience[]> {
    return await experienceStore.search(goal, 3)
  }

  /**
   * 汇总结果
   */
  summarizeResults(subTasks: SubTask[], reflection: ReflectionResult): {
    summary: string
    suggestions: string[]
    overallSuccess: boolean
  } {
    const successCount = subTasks.filter(t => t.status === 'done').length
    const totalCount = subTasks.length

    let summary = ''
    if (successCount === totalCount) {
      summary = `全部 ${totalCount} 个子任务执行成功`
    } else if (successCount === 0) {
      summary = `全部 ${totalCount} 个子任务执行失败`
    } else {
      summary = `${totalCount} 个子任务中 ${successCount} 个执行成功`
    }

    if (reflection.learnedLessons.length > 0) {
      summary += `。经验：${reflection.learnedLessons[0]}`
    }

    return {
      summary,
      suggestions: reflection.suggestions,
      overallSuccess: successCount === totalCount
    }
  }

  /**
   * 清理任务
   */
  cleanup(taskId: string): void {
    this.activeTasks.delete(taskId)
    logger.debug('[MultiAgent] Task cleaned up', { taskId })
  }
}

export const multiAgentCoordinator = MultiAgentCoordinator.getInstance()
