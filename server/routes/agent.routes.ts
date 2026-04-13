/**
 * Agent 路由
 * 提供代理的创建、启动、停止、查询等 HTTP API
 */

import { AgentStateManager } from '../state/agent-state-manager'
import { logger } from '../services/logger.service'
import { getConfigService } from '../services/config.service'
import { handleChatStream } from '../handlers/chat.handler'
import { getAgentDatabase, type AgentRecord } from '../services/agent-database.service'

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const agentStateManager = new AgentStateManager()
const configService = getConfigService()

type AgentConfig = AgentRecord

const agentDb = getAgentDatabase()
const runningTasks: Map<string, Promise<void>> = new Map()

function appendAgentLog(agentId: string, level: 'info' | 'warn' | 'error', message: string) {
  agentDb.addLog(agentId, level, message)
}

function ensureAgentState(agentId: string) {
  if (!agentStateManager.getState(agentId)) {
    agentStateManager.initialize(agentId)
  }
}

for (const agent of agentDb.listAgents()) {
  ensureAgentState(agent.id)
}

const rolePresets: Record<string, { prompt: string; color: string }> = {
  coder: {
    prompt: '你是一个专业的程序员，负责编写、调试和优化代码。',
    color: '#4f46e5'
  },
  researcher: {
    prompt: '你是一个研究员，负责信息搜集、分析和总结。',
    color: '#22c55e'
  },
  designer: {
    prompt: '你是一个设计师，负责界面设计、用户体验优化。',
    color: '#ec4899'
  },
  tester: {
    prompt: '你是一个测试工程师，负责测试用例设计和缺陷检测。',
    color: '#f97316'
  },
  analyst: {
    prompt: '你是一个数据分析师，负责数据处理和洞察发现。',
    color: '#06b6d4'
  }
}

async function parseBody(request: Request): Promise<any> {
  try {
    const text = await request.text()
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

export async function handleAgentRoute(
  pathname: string,
  request: Request
): Promise<Response | null> {
  const method = request.method

  try {
    const agentMatch = pathname.match(/^\/api\/agents\/([^\/]+)$/)
    const logsMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/logs$/)
    const startMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/start$/)
    const pauseMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/pause$/)
    const stopMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/stop$/)
    const taskMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/task$/)

    if (method === 'GET' && pathname === '/api/agents') {
      const agentList = agentDb.listAgents().map(agent => ({
        ...agent,
        state: agentStateManager.getState(agent.id)?.state || 'idle'
      }))
      return jsonResponse(agentList)
    }

    if (method === 'GET' && pathname === '/api/agent-models') {
      try {
        const config = await configService.getConfig()
        const models = (config.models || []).map((m: any) => ({
          value: m.id,
          label: m.name || m.id
        }))
        return jsonResponse(models.length > 0 ? models : [{ value: 'default', label: '默认模型' }])
      } catch {
        return jsonResponse([{ value: 'default', label: '默认模型' }])
      }
    }

    if (method === 'GET' && pathname === '/api/agents/roles') {
      return jsonResponse(Object.entries(rolePresets).map(([key, value]) => ({
        value: key,
        label: { coder: '程序员', researcher: '研究员', designer: '设计师', tester: '测试员', analyst: '分析师' }[key] || key,
        ...value
      })))
    }

    if (method === 'GET' && agentMatch) {
      const id = agentMatch[1]
      if (id === 'models' || id === 'roles') {
        return jsonResponse({ error: 'Not found' }, 404)
      }
      const agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      ensureAgentState(id)
      const state = agentStateManager.getState(id)
      return jsonResponse({ ...agent, state: state?.state || 'idle', activities: state?.activities || [] })
    }

    if (method === 'GET' && logsMatch) {
      const id = logsMatch[1]
      const agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      ensureAgentState(id)
      const state = agentStateManager.getState(id)
      const activityLogs = (state?.activities || []).map(activity => ({
        timestamp: activity.startedAt,
        level: 'info',
        message: activity.description
      }))
      const runtimeLogs = agentDb.getLogs(id)
      const logs = [...runtimeLogs, ...activityLogs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 300)
      return jsonResponse(logs)
    }

    if (method === 'POST' && pathname === '/api/agents') {
      const body = await parseBody(request)
      const { name, role, prompt, defaultTask, modelId, color, skillId, mcpServers, executionMode } = body

      if (!name) return jsonResponse({ error: 'Agent name is required' }, 400)

      const id = generateId()
      const preset = rolePresets[role] || rolePresets.coder

      const config = await configService.getConfig()
      const defaultModel = config.models && config.models.length > 0 ? config.models[0].id : 'default'

      const agent: AgentConfig = {
        id, name,
        role: role || 'coder',
        prompt: prompt || preset.prompt,
        defaultTask: typeof defaultTask === 'string' ? defaultTask : '',
        modelId: modelId || defaultModel,
        skillId: typeof skillId === 'string' ? skillId : '',
        mcpServers: Array.isArray(mcpServers) ? mcpServers.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [],
        executionMode: executionMode === 'manual' ? 'manual' : 'auto',
        color: color || preset.color,
        status: 'idle',
        currentTask: '',
        progress: 0,
        runtime: 0,
        tasksCompleted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      agentDb.createAgent(agent)
      ensureAgentState(id)
      appendAgentLog(id, 'info', `代理已创建：${name}`)
      logger.info('[AgentRoute] Agent created', { id, name, role })

      return jsonResponse(agent, 201)
    }

    if (method === 'PUT' && agentMatch) {
      const id = agentMatch[1]
      const agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)

      const body = await parseBody(request)
      const { name, role, prompt, defaultTask, modelId, color, skillId, mcpServers, executionMode } = body

      const patch: Partial<AgentConfig> = { updatedAt: Date.now() }
      if (name) patch.name = name
      if (role) {
        patch.role = role
        if (!prompt && rolePresets[role]) {
          patch.prompt = rolePresets[role].prompt
          patch.color = rolePresets[role].color
        }
      }
      if (prompt) patch.prompt = prompt
      if (typeof defaultTask === 'string') patch.defaultTask = defaultTask
      if (modelId) patch.modelId = modelId
      if (typeof skillId === 'string') patch.skillId = skillId
      if (Array.isArray(mcpServers)) {
        patch.mcpServers = mcpServers.map((v: unknown) => String(v || '').trim()).filter(Boolean)
      }
      if (executionMode === 'manual' || executionMode === 'auto') {
        patch.executionMode = executionMode
      }
      if (color) patch.color = color

      const updated = agentDb.updateAgent(id, patch)
      if (!updated) return jsonResponse({ error: 'Agent not found' }, 404)
      return jsonResponse(updated)
    }

    if (method === 'DELETE' && agentMatch) {
      const id = agentMatch[1]
      if (!agentDb.getAgent(id)) return jsonResponse({ error: 'Agent not found' }, 404)
      runningTasks.delete(id)
      agentStateManager.remove(id)
      agentDb.deleteAgent(id)
      logger.info('[AgentRoute] Agent deleted', { id })
      return jsonResponse({ success: true })
    }

    if (method === 'POST' && startMatch) {
      const id = startMatch[1]
      const agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      if (agent.status === 'running') return jsonResponse({ error: 'Agent is already running' }, 400)

      const updated = agentDb.updateAgent(id, { status: 'running', updatedAt: Date.now() })
      if (!updated) return jsonResponse({ error: 'Agent not found' }, 404)
      ensureAgentState(id)
      agentStateManager.setState(id, 'running', 'User started agent')
      appendAgentLog(id, 'info', '代理已启动')
      logger.info('[AgentRoute] Agent started', { id, name: agent.name })

      return jsonResponse({ ...updated, state: 'running' })
    }

    if (method === 'POST' && pauseMatch) {
      const id = pauseMatch[1]
      const agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      if (agent.status !== 'running') return jsonResponse({ error: 'Agent is not running' }, 400)

      const updated = agentDb.updateAgent(id, { status: 'paused', updatedAt: Date.now() })
      if (!updated) return jsonResponse({ error: 'Agent not found' }, 404)
      ensureAgentState(id)
      agentStateManager.setState(id, 'paused', 'User paused agent')
      appendAgentLog(id, 'info', '代理已暂停')
      logger.info('[AgentRoute] Agent paused', { id, name: agent.name })

      return jsonResponse({ ...updated, state: 'paused' })
    }

    if (method === 'POST' && stopMatch) {
      const id = stopMatch[1]
      const agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)

      const updated = agentDb.updateAgent(id, {
        status: 'idle',
        currentTask: '',
        progress: 0,
        updatedAt: Date.now()
      })
      if (!updated) return jsonResponse({ error: 'Agent not found' }, 404)
      ensureAgentState(id)
      agentStateManager.setState(id, 'stopped', 'User stopped agent')
      appendAgentLog(id, 'info', '代理已停止')
      logger.info('[AgentRoute] Agent stopped', { id, name: agent.name })

      return jsonResponse({ ...updated, state: 'stopped' })
    }

    if (method === 'POST' && taskMatch) {
      const id = taskMatch[1]
      let agent = agentDb.getAgent(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)

      const body = await parseBody(request)
      const rawTask = typeof body?.task === 'string' ? body.task : ''
      const task = String(rawTask || agent.defaultTask || '').trim()
      if (!task) return jsonResponse({ error: 'Task content is required' }, 400)
      if (runningTasks.has(id)) {
        return jsonResponse({ error: 'Agent is already executing a task' }, 409)
      }

      if (String(rawTask || '').trim()) {
        agent = agentDb.updateAgent(id, {
          defaultTask: String(rawTask).trim(),
          updatedAt: Date.now()
        }) || agent
      }

      agent = agentDb.updateAgent(id, {
        currentTask: task,
        status: 'running',
        progress: 5,
        updatedAt: Date.now()
      })
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      ensureAgentState(id)
      agentStateManager.setActivity(id, {
        type: 'task_execution',
        description: task,
        startedAt: Date.now()
      })
      agentStateManager.setState(id, 'running', 'Task assigned')
      appendAgentLog(id, 'info', `收到任务：${String(task).slice(0, 120)}`)
      logger.info('[AgentRoute] Task assigned to agent', { id, task })

      const runPromise = (async () => {
        let replyText = ''
        const startedAt = Date.now()
        const initialRuntime = Number(agent?.runtime || 0)
        let currentProgress = 5
        const getRuntimeSeconds = () => initialRuntime + Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
        const syncRunningSnapshot = () => {
          agentDb.updateAgent(id, {
            status: 'running',
            progress: currentProgress,
            runtime: getRuntimeSeconds(),
            updatedAt: Date.now()
          })
        }
        const runtimeTicker = setInterval(() => {
          if (currentProgress < 65) {
            currentProgress = Math.min(65, currentProgress + 1)
          }
          syncRunningSnapshot()
        }, 1000)
        try {
          for await (const chunk of handleChatStream(String(task), {
            model: agent.modelId,
            selectedSkillId: agent.skillId,
            executionMode: agent.executionMode || 'auto',
            promptInstruction: agent.prompt || '',
            allowedMcpServers: Array.isArray(agent.mcpServers) ? agent.mcpServers : []
          }, [])) {
            if (chunk.type === 'detail' && chunk.detail?.text) {
              if (currentProgress < 65) {
                currentProgress = Math.min(65, currentProgress + 2)
              }
              syncRunningSnapshot()
              appendAgentLog(id, 'info', chunk.detail.text)
            } else if (chunk.type === 'reply' && chunk.reply) {
              replyText += String(chunk.reply)
              currentProgress = Math.max(currentProgress, 70)
              syncRunningSnapshot()
            } else if (chunk.type === 'error') {
              appendAgentLog(id, 'error', String(chunk.error || '执行失败'))
              throw new Error(String(chunk.error || '执行失败'))
            } else if (chunk.type === 'done') {
              currentProgress = 100
              agentDb.updateAgent(id, { progress: 100, runtime: getRuntimeSeconds(), updatedAt: Date.now() })
            }
          }

          const latest = agentDb.getAgent(id)
          agentDb.updateAgent(id, {
            status: 'idle',
            currentTask: '',
            progress: 0,
            runtime: getRuntimeSeconds(),
            tasksCompleted: Number(latest?.tasksCompleted || 0) + 1,
            updatedAt: Date.now()
          })
          agentStateManager.incrementTaskCount(id)
          agentStateManager.setState(id, 'idle', 'Task completed')
          agentStateManager.clearActivity(id)
          appendAgentLog(id, 'info', `任务完成：${replyText.slice(0, 200) || '无文本输出'}`)
        } catch (error: any) {
          agentDb.updateAgent(id, {
            status: 'error',
            progress: 0,
            runtime: getRuntimeSeconds(),
            updatedAt: Date.now()
          })
          agentStateManager.setError(id, String(error?.message || error))
          agentStateManager.clearActivity(id)
          appendAgentLog(id, 'error', `任务失败：${String(error?.message || error)}`)
        } finally {
          clearInterval(runtimeTicker)
          runningTasks.delete(id)
        }
      })()

      runningTasks.set(id, runPromise)
      return jsonResponse({ ...agent, accepted: true, state: 'running' })
    }

    return null
  } catch (error: any) {
    logger.error('[AgentRoute] Error', { error: error.message })
    return jsonResponse({ error: error.message }, 500)
  }
}
