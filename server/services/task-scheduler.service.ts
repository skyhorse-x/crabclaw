/**
 * 任务调度服务
 * 支持定时和周期任务
 */

import { logger } from './logger.service'
import { builtinTools } from './builtin-tools.service'
import { callMcpTool, getMcpTools } from './mcp.service'
import { Database } from 'bun:sqlite'
import { getUnifiedDbPath } from './unified-db-path'
import { getConfigDatabase } from './config-database.service'

export interface ScheduledTask {
  id: string
  name: string
  type: 'interval' | 'cron'
  intervalMs?: number
  cronExpression?: string
  toolName: string
  toolInput: Record<string, unknown>
  enabled: boolean
  lastRun?: number
  nextRun?: number
  createdAt: number
}

export interface TaskLog {
  id: string
  taskId: string
  taskName: string
  status: 'success' | 'error'
  result?: string
  error?: string
  executedAt: number
}

class TaskSchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private db: Database
  private taskLogs: TaskLog[] = []
  private maxLogsPerTask: number = 50

  constructor() {
    this.db = new Database(getUnifiedDbPath())
    this.initSchema()
    this.loadTasks()
    this.loadLogs()
    this.startScheduler()
    this.registerTools()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        interval_ms INTEGER,
        cron_expression TEXT,
        tool_name TEXT NOT NULL,
        tool_input_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run INTEGER,
        next_run INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduled_task_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        error TEXT,
        executed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scheduled_task_logs_task_id
      ON scheduled_task_logs(task_id, executed_at DESC);
    `)
  }

  private registerTools() {
    builtinTools.register({
      name: 'create_scheduled_task',
      description: '创建定时任务。参数：name（任务名）、type（interval 或 cron）、intervalMs（间隔毫秒，如 120000=2分钟）、toolName（工具名）、toolInput（工具参数）',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名称' },
          type: { type: 'string', enum: ['interval', 'cron'], description: '任务类型：interval 或 cron' },
          intervalMs: { type: 'number', description: '间隔毫秒，如 120000 表示 2 分钟' },
          toolName: { type: 'string', description: '要调用的工具名，如 send_message' },
          toolInput: { type: 'object', description: '工具输入参数' }
        },
        required: ['name', 'type', 'toolName', 'toolInput']
      },
      execute: async (input: Record<string, unknown>) => {
        const { name, type, intervalMs, toolName, toolInput } = input as {
          name: string
          type: 'interval' | 'cron'
          intervalMs?: number
          toolName: string
          toolInput: Record<string, unknown>
        }

        if (type === 'interval' && !intervalMs) {
          return { success: false, error: 'interval 类型需要提供 intervalMs 参数' }
        }

        const validationError = await this.validateToolName(toolName)
        if (validationError) {
          return { success: false, error: validationError }
        }

        const id = this.createTask({
          name,
          type,
          intervalMs,
          toolName,
          toolInput,
          enabled: true
        })

        return { success: true, result: `定时任务已创建: ${name} (ID: ${id})` }
      }
    })

    builtinTools.register({
      name: 'list_scheduled_tasks',
      description: '列出所有定时任务',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        const tasks = this.getAllTasks()
        if (tasks.length === 0) {
          return { success: true, result: '暂无定时任务' }
        }

        const list = tasks.map(t => {
          const interval = t.intervalMs ? `每 ${Math.round(t.intervalMs / 60000)} 分钟` : ''
          const status = t.enabled ? '[启用]' : '[停用]'
          return `${t.id}: ${t.name} ${interval} ${status}`
        }).join('\n')

        return { success: true, result: `定时任务列表:\n${list}` }
      }
    })

    builtinTools.register({
      name: 'delete_scheduled_task',
      description: '删除定时任务。参数：id（任务ID）',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务ID' }
        },
        required: ['id']
      },
      execute: async (input: Record<string, unknown>) => {
        const { id } = input as { id: string }
        const deleted = this.deleteTask(id)
        if (deleted) {
          return { success: true, result: `任务已删除: ${id}` }
        } else {
          return { success: false, error: `任务不存在: ${id}` }
        }
      }
    })

    logger.info('[TaskScheduler] Tools registered')
  }

  private async validateToolName(toolName: string): Promise<string | null> {
    const normalized = String(toolName || '').trim()
    if (!normalized) return 'toolName 不能为空'

    if (!normalized.includes('/')) {
      return null
    }

    const [server, rawTool] = normalized.split('/', 2).map((v) => String(v || '').trim())
    if (!server || !rawTool) {
      return `工具格式错误：${normalized}，应为 server/tool`
    }

    try {
      const all = await getMcpTools()
      const serverTools = all[server] || []
      const names = serverTools.map((t) => t.name)
      const normalizedRaw = this.normalizeShellToolAlias(rawTool)
      if (names.includes(rawTool) || names.includes(normalizedRaw)) return null

      if (server === 'shell' && this.isShellAlias(rawTool)) {
        if (names.includes('shell_execute') || names.includes('run_process')) return null
      }

      return `工具「${normalized}」不存在。可用工具：${names.join(', ')}`
    } catch (error) {
      logger.warn('[TaskScheduler] validateToolName failed, skip strict validation', { toolName: normalized, error })
      return null
    }
  }

  private isShellAlias(toolName: string): boolean {
    return ['shell_execute', 'execute', 'run_shell', 'shell_execute_command', 'run_process'].includes(
      String(toolName || '').trim()
    )
  }

  private normalizeShellToolAlias(toolName: string): string {
    const name = String(toolName || '').trim()
    if (name === 'run_process') return 'shell_execute'
    if (['execute', 'run_shell', 'shell_execute_command'].includes(name)) return 'shell_execute'
    return name
  }

  private async resolveToolInvocation(
    server: string,
    rawTool: string,
    args: Record<string, any>
  ): Promise<{ tool: string; args: Record<string, any> }> {
    if (server !== 'shell') {
      return { tool: rawTool, args }
    }

    let selected = this.normalizeShellToolAlias(rawTool)
    try {
      const allTools = await getMcpTools()
      const names = (allTools[server] || []).map((item) => item.name)
      if (!names.includes(selected) && names.includes('run_process')) {
        selected = 'run_process'
      } else if (!names.includes(selected) && names.includes(rawTool)) {
        selected = rawTool
      }
    } catch (error) {
      logger.warn('[TaskScheduler] resolveToolInvocation failed to query MCP tools, fallback to alias', { server, rawTool, error })
    }

    const nextArgs = { ...args }
    if (selected === 'run_process' && !nextArgs.mode) {
      nextArgs.mode = 'shell'
    }
    if (selected === 'shell_execute' && nextArgs.mode) {
      delete nextArgs.mode
    }

    return { tool: selected, args: nextArgs }
  }

  private replaceMessagingPlaceholders(args: Record<string, any>): Record<string, any> {
    const remoteConfig = getConfigDatabase().getRemoteControlConfig()

    const result = { ...args }
    for (const key of Object.keys(result)) {
      if (typeof result[key] === 'string') {
        let value = result[key]

        if (remoteConfig.telegram.enabled) {
          const token = remoteConfig.telegram.botToken
          const chatId = remoteConfig.telegram.chatId
          if (token) {
            value = value.replace(/<YOUR_BOT_TOKEN>/gi, token)
            value = value.replace(/<YOUR_TELEGRAM_BOT_TOKEN>/gi, token)
            value = value.replace(/<REPLACE_WITH_YOUR_BOT_TOKEN>/gi, token)
            value = value.replace(/<TELEGRAM_BOT_TOKEN>/gi, token)
            value = value.replace(/botYOUR_TELEGRAM_BOT_TOKEN/g, `bot${token}`)
            value = value.replace(/bot<TELEGRAM_BOT_TOKEN>/g, `bot${token}`)
          }
          if (chatId) {
            value = value.replace(/<YOUR_CHAT_ID>/gi, chatId)
            value = value.replace(/<YOUR_TELEGRAM_CHAT_ID>/gi, chatId)
            value = value.replace(/<REPLACE_WITH_YOUR_CHAT_ID>/gi, chatId)
            value = value.replace(/<TARGET_CHAT_ID>/gi, chatId)
            value = value.replace(/chat_id=YOUR_CHAT_ID/g, `chat_id=${chatId}`)
            value = value.replace(/chat_id=<TARGET_CHAT_ID>/g, `chat_id=${chatId}`)
          }
        }

        if (remoteConfig.discord.enabled) {
          const token = remoteConfig.discord.botToken
          const channelId = remoteConfig.discord.channelId
          if (token) {
            value = value.replace(/<DISCORD_BOT_TOKEN>/gi, token)
            value = value.replace(/<YOUR_DISCORD_BOT_TOKEN>/gi, token)
          }
          if (channelId) {
            value = value.replace(/<DISCORD_CHANNEL_ID>/gi, channelId)
            value = value.replace(/<YOUR_DISCORD_CHANNEL_ID>/gi, channelId)
          }
        }

        if (remoteConfig.slack.enabled) {
          const token = remoteConfig.slack.botToken
          const channelId = remoteConfig.slack.channelId
          if (token) {
            value = value.replace(/<SLACK_BOT_TOKEN>/gi, token)
            value = value.replace(/<YOUR_SLACK_BOT_TOKEN>/gi, token)
          }
          if (channelId) {
            value = value.replace(/<SLACK_CHANNEL_ID>/gi, channelId)
            value = value.replace(/<YOUR_SLACK_CHANNEL_ID>/gi, channelId)
          }
        }

        if (remoteConfig.teams.enabled) {
          const webhook = remoteConfig.teams.webhook
          if (webhook) {
            value = value.replace(/<TEAMS_WEBHOOK>/gi, webhook)
            value = value.replace(/<YOUR_TEAMS_WEBHOOK>/gi, webhook)
          }
        }

        if (remoteConfig.whatsapp.enabled) {
          const accountSid = remoteConfig.whatsapp.accountSid
          const authToken = remoteConfig.whatsapp.authToken
          const fromNumber = remoteConfig.whatsapp.fromNumber
          if (accountSid) {
            value = value.replace(/<TWILIO_ACCOUNT_SID>/gi, accountSid)
          }
          if (authToken) {
            value = value.replace(/<TWILIO_AUTH_TOKEN>/gi, authToken)
          }
          if (fromNumber) {
            value = value.replace(/<WHATSAPP_FROM_NUMBER>/gi, fromNumber)
          }
        }

        result[key] = value
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = this.replaceMessagingPlaceholders(result[key])
      }
    }
    return result
  }

  private extractShellExecutionError(resultPayload: unknown): string | null {
    const text = String(resultPayload ?? '')
    if (!text) return null

    const exitCodeMatch = text.match(/"exit_code"\s*:\s*(\d+)/)
    if (!exitCodeMatch) return null

    const exitCode = Number(exitCodeMatch[1])
    if (!Number.isFinite(exitCode) || exitCode === 0) return null

    const stderrMatch = text.match(/"stderr"\s*:\s*"([\s\S]*?)"/)
    const stderr = stderrMatch ? String(stderrMatch[1]).replace(/\\n/g, '\n').trim() : ''
    if (stderr) {
      return `shell 命令执行失败(exit_code=${exitCode}): ${stderr}`
    }
    return `shell 命令执行失败(exit_code=${exitCode})`
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  createTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'lastRun' | 'nextRun'>): string {
    const id = this.generateId()
    const newTask: ScheduledTask = {
      ...task,
      id,
      createdAt: Date.now()
    }

    this.tasks.set(id, newTask)
    this.scheduleTask(newTask)
    this.saveTasks()

    logger.info('[TaskScheduler] Task created', { id, name: task.name })
    return id
  }

  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id)
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }

  deleteTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) {
      logger.warn('[TaskScheduler] Task not found for deletion', { id })
      return false
    }

    this.cancelTask(id)
    this.tasks.delete(id)
    this.timers.delete(id)

    try {
      const deleteTaskStmt = this.db.query('DELETE FROM scheduled_tasks WHERE id = ?')
      const deleteLogsStmt = this.db.query('DELETE FROM scheduled_task_logs WHERE task_id = ?')
      const tx = this.db.transaction(() => {
        deleteTaskStmt.run(id)
        deleteLogsStmt.run(id)
      })
      tx()

      this.taskLogs = this.taskLogs.filter(l => l.taskId !== id)
      logger.info('[TaskScheduler] Task fully deleted', { id, remainingTasks: this.tasks.size })
    } catch (err) {
      logger.error('[TaskScheduler] Failed to delete task from DB, in-memory deletion succeeded', { id, error: String(err) })
    }

    return true
  }

  enableTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    task.enabled = true
    this.scheduleTask(task)
    this.saveTasks()

    return true
  }

  disableTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    task.enabled = false
    this.cancelTask(id)
    this.saveTasks()

    return true
  }

  updateTask(id: string, updates: Partial<Omit<ScheduledTask, 'id' | 'createdAt'>>): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    const needReschedule = updates.enabled !== undefined || updates.intervalMs !== undefined || updates.type !== undefined

    Object.assign(task, updates)

    if (needReschedule) {
      if (task.enabled) {
        this.scheduleTask(task)
      } else {
        this.cancelTask(id)
      }
    }

    this.saveTasks()
    logger.info('[TaskScheduler] Task updated', { id, updates })
    return true
  }

  private scheduleTask(task: ScheduledTask) {
    if (!task.enabled) return

    this.cancelTask(task.id)

    if (task.type === 'interval' && task.intervalMs) {
      const runTask = async () => {
        task.lastRun = Date.now()
        task.nextRun = Date.now() + task.intervalMs!
        await this.executeTask(task)
        this.saveTasks()
      }

      const timer = setInterval(runTask, task.intervalMs)
      this.timers.set(task.id, timer)
      task.nextRun = Date.now() + task.intervalMs

      runTask()
      logger.info('[TaskScheduler] Interval task scheduled', { id: task.id, intervalMs: task.intervalMs })
    }
  }

  private cancelTask(id: string) {
    const timer = this.timers.get(id)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(id)
    }
  }

  public async executeTask(task: ScheduledTask) {
    logger.info('[TaskScheduler] Executing task', { id: task.id, name: task.name, toolName: task.toolName })

    try {
      let toolName = task.toolName
      if (toolName.startsWith('builtin/')) {
        toolName = toolName.replace('builtin/', '')
      }
      let result: { success: boolean; result?: string; error?: string }

      if (toolName.includes('/')) {
        const [server, rawTool] = toolName.split('/', 2).map((v) => String(v || '').trim())
        let resolvedArgs = task.toolInput as Record<string, any>
        if (server === 'shell') {
          resolvedArgs = this.replaceMessagingPlaceholders(resolvedArgs)
        }
        const resolved = await this.resolveToolInvocation(server, rawTool, resolvedArgs)
        let mcpResult = await callMcpTool(server, resolved.tool, resolved.args)
        if (
          !mcpResult.ok &&
          server === 'shell' &&
          resolved.tool !== rawTool &&
          /不存在|not found|-32601/i.test(String(mcpResult.error || ''))
        ) {
          logger.warn('[TaskScheduler] Shell tool fallback', {
            taskId: task.id,
            taskName: task.name,
            primaryTool: resolved.tool,
            fallbackTool: rawTool,
            error: mcpResult.error
          })
          mcpResult = await callMcpTool(server, rawTool || 'shell_execute', task.toolInput as Record<string, any>)
        }
        result = mcpResult.ok
          ? { success: true, result: String(mcpResult.result ?? '') }
          : { success: false, error: String(mcpResult.error || 'MCP 调用失败') }
        if (result.success && server === 'shell') {
          const shellError = this.extractShellExecutionError(result.result)
          if (shellError) {
            result = { success: false, error: shellError, result: result.result }
          }
        }
      } else {
        result = await builtinTools.callTool(toolName, task.toolInput)
      }
      logger.info('[TaskScheduler] Task executed', { id: task.id, toolName, result })

      this.addTaskLog({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        taskId: task.id,
        taskName: task.name,
        status: result.success ? 'success' : 'error',
        result: result.result,
        error: result.error,
        executedAt: Date.now()
      })

      return result
    } catch (error) {
      logger.error('[TaskScheduler] Task execution failed', { id: task.id, error })

      this.addTaskLog({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        taskId: task.id,
        taskName: task.name,
        status: 'error',
        error: String(error),
        executedAt: Date.now()
      })

      return { success: false, error: String(error) }
    }
  }

  private addTaskLog(log: TaskLog) {
    this.taskLogs.unshift(log)
    const taskLogs = this.taskLogs.filter(l => l.taskId === log.taskId)
    if (taskLogs.length > this.maxLogsPerTask) {
      const oldestToKeep = taskLogs[this.maxLogsPerTask - 1].executedAt
      this.taskLogs = this.taskLogs.filter(l => l.taskId !== log.taskId || l.executedAt >= oldestToKeep)
    }
    this.saveLogs()
  }

  getTaskLogs(taskId?: string): TaskLog[] {
    if (taskId) {
      return this.taskLogs.filter(l => l.taskId === taskId)
    }
    return this.taskLogs
  }

  clearTaskLogs(taskId?: string): number {
    const before = this.taskLogs.length
    if (taskId) {
      this.taskLogs = this.taskLogs.filter((log) => log.taskId !== taskId)
    } else {
      this.taskLogs = []
    }
    const removed = before - this.taskLogs.length
    this.saveLogs()
    logger.info('[TaskScheduler] Task logs cleared', { taskId: taskId || 'all', removed })
    return removed
  }

  private saveLogs() {
    try {
      const toPersist = this.taskLogs.slice(0, 200)
      const tx = this.db.transaction(() => {
        this.db.query('DELETE FROM scheduled_task_logs').run()
        const insertStmt = this.db.query(`
          INSERT INTO scheduled_task_logs (id, task_id, task_name, status, result, error, executed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        for (const log of toPersist) {
          insertStmt.run(
            log.id,
            log.taskId,
            log.taskName,
            log.status,
            log.result || null,
            log.error || null,
            log.executedAt
          )
        }
      })
      tx()
    } catch (error) {
      logger.error('[TaskScheduler] Failed to save logs', { error })
    }
  }

  private loadLogs() {
    try {
      const rows = this.db.query(`
        SELECT id, task_id, task_name, status, result, error, executed_at
        FROM scheduled_task_logs
        ORDER BY executed_at DESC
        LIMIT 200
      `).all() as Array<{
        id: string
        task_id: string
        task_name: string
        status: 'success' | 'error'
        result: string | null
        error: string | null
        executed_at: number
      }>

      this.taskLogs = rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        status: row.status,
        result: row.result || undefined,
        error: row.error || undefined,
        executedAt: row.executed_at
      }))
    } catch (error) {
      logger.error('[TaskScheduler] Failed to load logs', { error })
    }
  }

  private saveTasks() {
    try {
      const records = Array.from(this.tasks.values())
      const tx = this.db.transaction(() => {
        this.db.query('DELETE FROM scheduled_tasks').run()
        const insertStmt = this.db.query(`
          INSERT INTO scheduled_tasks (
            id, name, type, interval_ms, cron_expression, tool_name, tool_input_json,
            enabled, last_run, next_run, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const task of records) {
          insertStmt.run(
            task.id,
            task.name,
            task.type,
            task.intervalMs || null,
            task.cronExpression || null,
            task.toolName,
            JSON.stringify(task.toolInput || {}),
            task.enabled ? 1 : 0,
            task.lastRun || null,
            task.nextRun || null,
            task.createdAt
          )
        }
      })
      tx()
    } catch (error) {
      logger.error('[TaskScheduler] Failed to save tasks', { error })
    }
  }

  private loadTasks() {
    try {
      const rows = this.db.query(`
        SELECT
          id, name, type, interval_ms, cron_expression, tool_name, tool_input_json,
          enabled, last_run, next_run, created_at
        FROM scheduled_tasks
      `).all() as Array<{
        id: string
        name: string
        type: 'interval' | 'cron'
        interval_ms: number | null
        cron_expression: string | null
        tool_name: string
        tool_input_json: string
        enabled: number
        last_run: number | null
        next_run: number | null
        created_at: number
      }>

      const tasks: ScheduledTask[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        intervalMs: row.interval_ms || undefined,
        cronExpression: row.cron_expression || undefined,
        toolName: row.tool_name,
        toolInput: (() => {
          try {
            const parsed = JSON.parse(row.tool_input_json || '{}')
            return parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            return {}
          }
        })(),
        enabled: Boolean(row.enabled),
        lastRun: row.last_run || undefined,
        nextRun: row.next_run || undefined,
        createdAt: row.created_at
      }))

      for (const task of tasks) {
        this.tasks.set(task.id, task)
        if (task.enabled) {
          this.scheduleTask(task)
        }
      }

      logger.info('[TaskScheduler] Tasks loaded', { count: tasks.length })
    } catch (error) {
      logger.error('[TaskScheduler] Failed to load tasks', { error })
    }
  }

  private startScheduler() {
    logger.info('[TaskScheduler] Scheduler started')
  }

  shutdown() {
    for (const timer of this.timers.values()) {
      clearInterval(timer)
    }
    this.timers.clear()
    try {
      this.db.close()
    } catch {
      // ignore close error
    }
    logger.info('[TaskScheduler] Scheduler shutdown')
  }
}

export const taskScheduler = new TaskSchedulerService()
