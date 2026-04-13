import { Database } from 'bun:sqlite'
import { getUnifiedDbPath } from './unified-db-path'
import { logger } from './logger.service'

export interface AgentRecord {
  id: string
  name: string
  role: string
  prompt?: string
  defaultTask?: string
  modelId?: string
  skillId?: string
  mcpServers?: string[]
  executionMode?: 'auto' | 'manual'
  color: string
  status: 'idle' | 'running' | 'paused' | 'error'
  currentTask?: string
  progress: number
  runtime: number
  tasksCompleted: number
  createdAt: number
  updatedAt: number
}

export interface AgentLogRecord {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
}

class AgentDatabaseService {
  private db: Database

  constructor() {
    this.db = new Database(getUnifiedDbPath())
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        prompt TEXT DEFAULT '',
        default_task TEXT DEFAULT '',
        model_id TEXT DEFAULT '',
        skill_id TEXT DEFAULT '',
        mcp_servers TEXT DEFAULT '[]',
        execution_mode TEXT DEFAULT 'auto',
        color TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        current_task TEXT DEFAULT '',
        progress INTEGER NOT NULL DEFAULT 0,
        runtime INTEGER NOT NULL DEFAULT 0,
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agents_updated_at
      ON agents(updated_at DESC);
    `)
    this.ensureAgentsDefaultTaskColumn()

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_time
      ON agent_logs(agent_id, timestamp DESC);
    `)

    logger.info('[AgentDB] Database initialized')
  }

  private ensureAgentsDefaultTaskColumn() {
    try {
      const columns = this.db.query('PRAGMA table_info(agents)').all() as Array<{ name?: string }>
      const hasDefaultTask = columns.some((column) => String(column?.name || '') === 'default_task')
      if (!hasDefaultTask) {
        this.db.exec(`ALTER TABLE agents ADD COLUMN default_task TEXT DEFAULT ''`)
      }
    } catch (error) {
      logger.warn('[AgentDB] Ensure default_task column failed', { error })
    }
  }

  listAgents(): AgentRecord[] {
    const rows = this.db.query(`
      SELECT
        id,
        name,
        role,
        prompt,
        default_task as defaultTask,
        model_id as modelId,
        skill_id as skillId,
        mcp_servers as mcpServersRaw,
        execution_mode as executionMode,
        color,
        status,
        current_task as currentTask,
        progress,
        runtime,
        tasks_completed as tasksCompleted,
        created_at as createdAt,
        updated_at as updatedAt
      FROM agents
      ORDER BY updated_at DESC
    `).all() as Array<Record<string, unknown>>

    return rows.map((row) => this.toAgentRecord(row))
  }

  getAgent(id: string): AgentRecord | null {
    const row = this.db.query(`
      SELECT
        id,
        name,
        role,
        prompt,
        default_task as defaultTask,
        model_id as modelId,
        skill_id as skillId,
        mcp_servers as mcpServersRaw,
        execution_mode as executionMode,
        color,
        status,
        current_task as currentTask,
        progress,
        runtime,
        tasks_completed as tasksCompleted,
        created_at as createdAt,
        updated_at as updatedAt
      FROM agents
      WHERE id = ?
      LIMIT 1
    `).get(id) as Record<string, unknown> | undefined

    return row ? this.toAgentRecord(row) : null
  }

  createAgent(agent: AgentRecord): void {
    this.db.query(`
      INSERT INTO agents (
        id, name, role, prompt, model_id, skill_id, mcp_servers, execution_mode,
        default_task, color, status, current_task, progress, runtime, tasks_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agent.id,
      agent.name,
      agent.role,
      agent.prompt || '',
      agent.modelId || '',
      agent.skillId || '',
      JSON.stringify(Array.isArray(agent.mcpServers) ? agent.mcpServers : []),
      agent.executionMode === 'manual' ? 'manual' : 'auto',
      agent.defaultTask || '',
      agent.color,
      agent.status,
      agent.currentTask || '',
      Math.max(0, Math.min(100, Number(agent.progress || 0))),
      Math.max(0, Number(agent.runtime || 0)),
      Math.max(0, Number(agent.tasksCompleted || 0)),
      agent.createdAt,
      agent.updatedAt
    )
  }

  updateAgent(id: string, patch: Partial<AgentRecord>): AgentRecord | null {
    const current = this.getAgent(id)
    if (!current) return null

    const next: AgentRecord = {
      ...current,
      ...patch,
      mcpServers: Array.isArray(patch.mcpServers) ? patch.mcpServers : current.mcpServers,
      updatedAt: patch.updatedAt || Date.now()
    }

    this.db.query(`
      UPDATE agents SET
        name = ?,
        role = ?,
        prompt = ?,
        default_task = ?,
        model_id = ?,
        skill_id = ?,
        mcp_servers = ?,
        execution_mode = ?,
        color = ?,
        status = ?,
        current_task = ?,
        progress = ?,
        runtime = ?,
        tasks_completed = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      next.name,
      next.role,
      next.prompt || '',
      next.defaultTask || '',
      next.modelId || '',
      next.skillId || '',
      JSON.stringify(Array.isArray(next.mcpServers) ? next.mcpServers : []),
      next.executionMode === 'manual' ? 'manual' : 'auto',
      next.color,
      next.status,
      next.currentTask || '',
      Math.max(0, Math.min(100, Number(next.progress || 0))),
      Math.max(0, Number(next.runtime || 0)),
      Math.max(0, Number(next.tasksCompleted || 0)),
      next.updatedAt,
      id
    )

    return this.getAgent(id)
  }

  deleteAgent(id: string): boolean {
    this.db.query('DELETE FROM agent_logs WHERE agent_id = ?').run(id)
    const result = this.db.query('DELETE FROM agents WHERE id = ?').run(id)
    return Number(result.changes || 0) > 0
  }

  addLog(agentId: string, level: AgentLogRecord['level'], message: string): void {
    this.db.query(`
      INSERT INTO agent_logs (agent_id, timestamp, level, message)
      VALUES (?, ?, ?, ?)
    `).run(agentId, Date.now(), level, message)

    this.db.query(`
      DELETE FROM agent_logs
      WHERE id IN (
        SELECT id FROM agent_logs
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT -1 OFFSET 300
      )
    `).run(agentId)
  }

  getLogs(agentId: string, limit = 300): AgentLogRecord[] {
    return this.db.query(`
      SELECT timestamp, level, message
      FROM agent_logs
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(agentId, limit) as AgentLogRecord[]
  }

  private toAgentRecord(row: Record<string, unknown>): AgentRecord {
    let mcpServers: string[] = []
    try {
      const parsed = JSON.parse(String(row.mcpServersRaw || '[]'))
      if (Array.isArray(parsed)) {
        mcpServers = parsed.map((v) => String(v || '').trim()).filter(Boolean)
      }
    } catch {
      mcpServers = []
    }

    return {
      id: String(row.id || ''),
      name: String(row.name || ''),
      role: String(row.role || 'coder'),
      prompt: String(row.prompt || ''),
      defaultTask: String(row.defaultTask || ''),
      modelId: String(row.modelId || ''),
      skillId: String(row.skillId || ''),
      mcpServers,
      executionMode: row.executionMode === 'manual' ? 'manual' : 'auto',
      color: String(row.color || '#4f46e5'),
      status: (['idle', 'running', 'paused', 'error'].includes(String(row.status)) ? row.status : 'idle') as AgentRecord['status'],
      currentTask: String(row.currentTask || ''),
      progress: Number(row.progress || 0),
      runtime: Number(row.runtime || 0),
      tasksCompleted: Number(row.tasksCompleted || 0),
      createdAt: Number(row.createdAt || Date.now()),
      updatedAt: Number(row.updatedAt || Date.now())
    }
  }
}

let agentDb: AgentDatabaseService | null = null

export function getAgentDatabase(): AgentDatabaseService {
  if (!agentDb) {
    agentDb = new AgentDatabaseService()
  }
  return agentDb
}
