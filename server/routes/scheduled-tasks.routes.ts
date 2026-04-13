/**
 * 定时任务路由
 */

import { taskScheduler, type ScheduledTask } from '../services/task-scheduler.service'
import { logger } from '../services/logger.service'

export async function handleScheduledTasksRoute(pathname: string, request: Request): Promise<Response | null> {
  if (!pathname.startsWith('/api/scheduled-tasks')) {
    return null
  }

  if (pathname === '/api/scheduled-tasks/logs' && request.method === 'GET') {
    const url = new URL(request.url)
    const taskId = url.searchParams.get('taskId') || undefined
    const logs = taskScheduler.getTaskLogs(taskId)
    return new Response(JSON.stringify({ ok: true, logs }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  if (pathname === '/api/scheduled-tasks' && request.method === 'GET') {
    const tasks = taskScheduler.getAllTasks()
    const logs = taskScheduler.getTaskLogs()
    const tasksWithRuntime = tasks.map((task) => {
      const latestLog = logs.find((log) => log.taskId === task.id)
      return {
        ...task,
        runtimeStatus: latestLog?.status || null,
        lastResult: latestLog?.result || null,
        lastError: latestLog?.error || null,
        lastExecutedAt: latestLog?.executedAt || task.lastRun || null
      }
    })
    return new Response(JSON.stringify({ ok: true, tasks: tasksWithRuntime }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }

  if (pathname === '/api/scheduled-tasks' && request.method === 'POST') {
    try {
      const body = await request.json() as {
        action: 'create' | 'delete' | 'enable' | 'disable' | 'update' | 'clear_logs'
        task?: Omit<ScheduledTask, 'id' | 'createdAt' | 'lastRun' | 'nextRun'>
        id?: string
        taskId?: string
        updates?: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>
      }

      if (body.action === 'create' && body.task) {
        const id = taskScheduler.createTask({
          name: body.task.name,
          type: body.task.type,
          intervalMs: body.task.intervalMs,
          toolName: body.task.toolName,
          toolInput: body.task.toolInput,
          enabled: body.task.enabled ?? true
        })
        return new Response(JSON.stringify({ ok: true, id, task: taskScheduler.getTask(id) || null }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (body.action === 'delete' && body.id) {
        const deleted = taskScheduler.deleteTask(body.id)
        return new Response(JSON.stringify({ ok: deleted }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (body.action === 'enable' && body.id) {
        const enabled = taskScheduler.enableTask(body.id)
        return new Response(JSON.stringify({ ok: enabled }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (body.action === 'disable' && body.id) {
        const disabled = taskScheduler.disableTask(body.id)
        return new Response(JSON.stringify({ ok: disabled }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (body.action === 'update' && body.id && body.updates) {
        const updated = taskScheduler.updateTask(body.id, body.updates)
        return new Response(JSON.stringify({ ok: updated }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (body.action === 'clear_logs') {
        const removed = taskScheduler.clearTaskLogs(body.taskId)
        return new Response(JSON.stringify({ ok: true, removed }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ ok: false, error: 'Invalid action' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[ScheduledTasks] Route error', { error })
      return new Response(JSON.stringify({ ok: false, error: String(error) }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
