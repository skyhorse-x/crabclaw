// @ts-nocheck
/**
 * Pipeline 流水线路由
 * 支持多 Agent 按顺序协作完成同一项目
 */

import { Database } from 'bun:sqlite'
import { getUnifiedDbPath } from '../services/unified-db-path'
import { logger } from '../services/logger.service'
import { getAgentDatabase } from '../services/agent-database.service'
import { handleChatStream } from '../handlers/chat.handler'
import { getNow } from '../shared/utils/common.util'

const generateId = () => `${getNow()}-${Math.random().toString(36).substr(2, 9)}`


async function parseBody(request: Request): Promise<any> {
  try {
    const text = await request.text()
    return text ? JSON.parse(text) : {}
  } catch (e) {
    logger.warn('[Pipeline] Failed to parse request body', e)
    return {}
  }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// ===== 数据库 =====

export interface PipelineStep {
  id: string
  agentId: string
  agentName: string
  order: number
  promptTemplate: string  // 支持 {{output}} 引用上一步输出
  waitForApproval: boolean
}

export interface PipelineRecord {
  id: string
  name: string
  description: string
  modelId?: string  // 全局覆盖模型，留空则用各 Agent 自身模型
  steps: PipelineStep[]
  status: 'idle' | 'running' | 'done' | 'error' | 'paused'
  currentStepIndex: number
  context: Record<string, string>  // stepId -> output
  createdAt: number
  updatedAt: number
}

export interface PipelineRunLog {
  pipelineId: string
  stepId: string
  agentName: string
  input: string
  output: string
  status: 'pending' | 'running' | 'done' | 'error' | 'waiting_approval'
  startedAt: number
  finishedAt?: number
  error?: string
}

class PipelineDatabase {
  db: any

  constructor() {
    this.db = new Database(getUnifiedDbPath())
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipelines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        model_id TEXT DEFAULT '',
        steps TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'idle',
        current_step_index INTEGER NOT NULL DEFAULT 0,
        context TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pipeline_run_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pipeline_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        input TEXT NOT NULL DEFAULT '',
        output TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        error TEXT,
        FOREIGN KEY(pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
      );
    `)
    // 迁移：为已存在的表补加 model_id 列
    try { this.db.exec(`ALTER TABLE pipelines ADD COLUMN model_id TEXT DEFAULT ''`) } catch {}
  }

  private rowToRecord(row: any): PipelineRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      modelId: row.model_id || '',
      steps: JSON.parse(row.steps || '[]'),
      status: row.status,
      currentStepIndex: row.current_step_index,
      context: JSON.parse(row.context || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  list(): PipelineRecord[] {
    const rows = this.db.prepare('SELECT * FROM pipelines ORDER BY updated_at DESC').all()
    return rows.map((r: any) => this.rowToRecord(r))
  }

  get(id: string): PipelineRecord | null {
    const row = this.db.prepare('SELECT * FROM pipelines WHERE id = ?').get(id)
    return row ? this.rowToRecord(row) : null
  }

  create(data: Omit<PipelineRecord, 'createdAt' | 'updatedAt'>): PipelineRecord {
    const ts = getNow()
    this.db.prepare(`
      INSERT INTO pipelines (id, name, description, model_id, steps, status, current_step_index, context, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.name, data.description, data.modelId || '', JSON.stringify(data.steps), data.status, data.currentStepIndex, JSON.stringify(data.context), ts, ts)
    return this.get(data.id)!
  }

  update(id: string, patch: Partial<PipelineRecord>): PipelineRecord | null {
    const existing = this.get(id)
    if (!existing) return null
    const now = getNow()
    const merged = { ...existing, ...patch }
    this.db.prepare(`
      UPDATE pipelines SET name=?, description=?, model_id=?, steps=?, status=?, current_step_index=?, context=?, updated_at=? WHERE id=?
    `).run(merged.name, merged.description, merged.modelId || '', JSON.stringify(merged.steps), merged.status, merged.currentStepIndex, JSON.stringify(merged.context), now, id)
    return this.get(id)
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM pipelines WHERE id = ?').run(id)
    return result.changes > 0
  }

  addLog(log: Omit<PipelineRunLog, never>): void {
    this.db.prepare(`
      INSERT INTO pipeline_run_logs (pipeline_id, step_id, agent_name, input, output, status, started_at, finished_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(log.pipelineId, log.stepId, log.agentName, log.input, log.output, log.status, log.startedAt, log.finishedAt ?? null, log.error ?? null)
  }

  updateLog(pipelineId: string, stepId: string, patch: Partial<PipelineRunLog>): void {
    const sets: string[] = []
    const vals: any[] = []
    if (patch.output !== undefined) { sets.push('output=?'); vals.push(patch.output) }
    if (patch.status !== undefined) { sets.push('status=?'); vals.push(patch.status) }
    if (patch.finishedAt !== undefined) { sets.push('finished_at=?'); vals.push(patch.finishedAt) }
    if (patch.error !== undefined) { sets.push('error=?'); vals.push(patch.error) }
    if (sets.length === 0) return
    vals.push(pipelineId, stepId, pipelineId, stepId)
    this.db.prepare(`UPDATE pipeline_run_logs SET ${sets.join(',')} WHERE pipeline_id=? AND step_id=? AND id=(SELECT MAX(id) FROM pipeline_run_logs WHERE pipeline_id=? AND step_id=?)`).run(...vals)
  }

  getLogs(pipelineId: string): PipelineRunLog[] {
    return this.db.prepare('SELECT * FROM pipeline_run_logs WHERE pipeline_id=? ORDER BY started_at ASC').all(pipelineId)
  }
}

const pipelineDb = new PipelineDatabase()
const agentDb = getAgentDatabase()

// 正在运行的 pipeline（id -> AbortController）
const runningPipelines = new Map<string, AbortController>()

// ===== 流水线执行引擎 =====

function interpolate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '')
}

async function runPipeline(pipelineId: string, controller: AbortController) {
  const pipeline = pipelineDb.get(pipelineId)
  if (!pipeline) return

  const steps = pipeline.steps
  const context: Record<string, string> = { ...pipeline.context }
  let i = pipeline.currentStepIndex

  pipelineDb.update(pipelineId, { status: 'running', context })

  for (; i < steps.length; i++) {
    if (controller.signal.aborted) {
      pipelineDb.update(pipelineId, { status: 'paused', currentStepIndex: i })
      return
    }

    const step = steps[i]
    pipelineDb.update(pipelineId, { currentStepIndex: i })

    // 人工审批暂停
    if (step.waitForApproval) {
      pipelineDb.update(pipelineId, { status: 'paused', currentStepIndex: i })
      pipelineDb.addLog({
        pipelineId, stepId: step.id, agentName: step.agentName,
        input: '', output: '', status: 'waiting_approval',
        startedAt: getNow()
      })
      runningPipelines.delete(pipelineId)
      return
    }

    const agent = agentDb.getAgent(step.agentId)
    const input = interpolate(step.promptTemplate || '{{output}}', context)
    // 全局模型覆盖：流水线设置的 modelId 优先于 Agent 自身的 modelId
    const effectiveModelId = pipeline.modelId || agent?.modelId

    logger.info('[Pipeline] Running step', { pipelineId, step: step.agentName, order: i, model: effectiveModelId })

    pipelineDb.addLog({
      pipelineId, stepId: step.id, agentName: step.agentName,
      input, output: '', status: 'running', startedAt: getNow()
    })

    let output = ''
    let stepError = ''

    try {
      for await (const chunk of handleChatStream(input, {
        model: effectiveModelId,
        selectedSkillId: agent?.skillId,
        executionMode: agent?.executionMode || 'auto',
        promptInstruction: agent?.prompt || '',
        allowedMcpServers: Array.isArray(agent?.mcpServers) ? agent.mcpServers : [],
        signal: controller.signal
      }, [])) {
        if (controller.signal.aborted) break
        if (chunk.type === 'reply' && chunk.reply) {
          output += chunk.reply
        } else if (chunk.type === 'error') {
          const err = chunk.error
          if (err instanceof Error) stepError = err.message
          else if (err && typeof err === 'object') stepError = (err as any).message || JSON.stringify(err)
          else stepError = String(err || '执行失败')
          break
        }
      }
    } catch (e) {
      stepError = e instanceof Error ? e.message : (e && typeof e === 'object' ? JSON.stringify(e) : String(e))
    }

    if (stepError) {
      pipelineDb.updateLog(pipelineId, step.id, { output, status: 'error', error: stepError, finishedAt: getNow() })
      pipelineDb.update(pipelineId, { status: 'error', context })
      runningPipelines.delete(pipelineId)
      return
    }

    context[`step_${i}`] = output
    context['output'] = output  // 最新输出始终可用 {{output}}
    context[`${step.agentName}`] = output

    pipelineDb.updateLog(pipelineId, step.id, { output, status: 'done', finishedAt: getNow() })
    pipelineDb.update(pipelineId, { context, currentStepIndex: i + 1 })
  }

  pipelineDb.update(pipelineId, { status: 'done', currentStepIndex: steps.length })
  runningPipelines.delete(pipelineId)
  logger.info('[Pipeline] Completed', { pipelineId })
}

// ===== 路由处理 =====

export async function handlePipelineRoute(pathname: string, request: Request): Promise<Response | null> {
  const method = request.method

  const singleMatch = pathname.match(/^\/api\/pipelines\/([^\/]+)$/)
  const runMatch = pathname.match(/^\/api\/pipelines\/([^\/]+)\/run$/)
  const stopMatch = pathname.match(/^\/api\/pipelines\/([^\/]+)\/stop$/)
  const resumeMatch = pathname.match(/^\/api\/pipelines\/([^\/]+)\/resume$/)
  const logsMatch = pathname.match(/^\/api\/pipelines\/([^\/]+)\/logs$/)
  const approveMatch = pathname.match(/^\/api\/pipelines\/([^\/]+)\/approve$/)

  // GET /api/pipelines
  if (method === 'GET' && pathname === '/api/pipelines') {
    return jsonResponse(pipelineDb.list())
  }

  // POST /api/pipelines
  if (method === 'POST' && pathname === '/api/pipelines') {
    const body = await parseBody(request)
    if (!body?.name) return jsonResponse({ error: 'name required' }, 400)
    const pipeline = pipelineDb.create({
      id: generateId(),
      name: String(body.name),
      description: String(body.description || ''),
      modelId: String(body.modelId || ''),
      steps: Array.isArray(body.steps) ? body.steps : [],
      status: 'idle',
      currentStepIndex: 0,
      context: {}
    })
    return jsonResponse(pipeline, 201)
  }

  // GET /api/pipelines/:id
  if (method === 'GET' && singleMatch && !runMatch && !stopMatch && !resumeMatch && !logsMatch && !approveMatch) {
    const pipeline = pipelineDb.get(singleMatch[1])
    return pipeline ? jsonResponse(pipeline) : jsonResponse({ error: 'Not found' }, 404)
  }

  // PUT /api/pipelines/:id
  if (method === 'PUT' && singleMatch) {
    const body = await parseBody(request)
    const updatedPipeline = pipelineDb.update(singleMatch[1], {
      name: body.name,
      description: body.description,
      modelId: String(body.modelId || ''),
      steps: body.steps
    })
    return updatedPipeline ? jsonResponse(updatedPipeline) : jsonResponse({ error: 'Not found' }, 404)
  }

  // DELETE /api/pipelines/:id
  if (method === 'DELETE' && singleMatch) {
    const ok = pipelineDb.delete(singleMatch[1])
    return ok ? jsonResponse({ ok: true }) : jsonResponse({ error: 'Not found' }, 404)
  }

  // POST /api/pipelines/:id/run
  if (method === 'POST' && runMatch) {
    const id = runMatch[1]
    const pipeline = pipelineDb.get(id)
    if (!pipeline) return jsonResponse({ error: 'Not found' }, 404)
    if (runningPipelines.has(id)) return jsonResponse({ error: 'Already running' }, 409)
    const body = await parseBody(request)
    // 支持传入初始输入
    const initialInput = String(body?.input || '')
    if (initialInput) {
      pipelineDb.update(id, { context: { ...pipeline.context, input: initialInput, output: initialInput }, status: 'idle', currentStepIndex: 0 })
    } else {
      pipelineDb.update(id, { status: 'idle', currentStepIndex: 0, context: {} })
    }
    const controller = new AbortController()
    runningPipelines.set(id, controller)
    runPipeline(id, controller).catch(e => logger.error('[Pipeline] Run error', { e }))
    return jsonResponse({ ok: true, status: 'running' })
  }

  // POST /api/pipelines/:id/stop
  if (method === 'POST' && stopMatch) {
    const id = stopMatch[1]
    const ctrl = runningPipelines.get(id)
    if (ctrl) { ctrl.abort(); runningPipelines.delete(id) }
    pipelineDb.update(id, { status: 'paused' })
    return jsonResponse({ ok: true })
  }

  // POST /api/pipelines/:id/resume  (人工审批后继续)
  if (method === 'POST' && resumeMatch) {
    const id = resumeMatch[1]
    const pipeline = pipelineDb.get(id)
    if (!pipeline) return jsonResponse({ error: 'Not found' }, 404)
    if (runningPipelines.has(id)) return jsonResponse({ error: 'Already running' }, 409)
    const controller = new AbortController()
    runningPipelines.set(id, controller)
    runPipeline(id, controller).catch(e => logger.error('[Pipeline] Resume error', { e }))
    return jsonResponse({ ok: true })
  }

  // POST /api/pipelines/:id/approve  (批准当前等待审批步骤)
  if (method === 'POST' && approveMatch) {
    const id = approveMatch[1]
    const pipeline = pipelineDb.get(id)
    if (!pipeline) return jsonResponse({ error: 'Not found' }, 404)
    const step = pipeline.steps[pipeline.currentStepIndex]
    if (step) {
      // 跳过审批，直接进入下一步
      pipelineDb.update(id, { currentStepIndex: pipeline.currentStepIndex + 1, status: 'idle' })
    }
    const controller = new AbortController()
    runningPipelines.set(id, controller)
    runPipeline(id, controller).catch(e => logger.error('[Pipeline] Approve error', { e }))
    return jsonResponse({ ok: true })
  }

  // GET /api/pipelines/:id/logs
  if (method === 'GET' && logsMatch) {
    const logs = pipelineDb.getLogs(logsMatch[1])
    return jsonResponse(logs)
  }

  return null
}
