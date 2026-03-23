/**
 * Agent 路由
 * 提供代理的创建、启动、停止、查询等 HTTP API
 */

import { AgentStateManager } from '../state/agent-state-manager'
import { logger } from '../services/logger.service'
import { getConfigService } from '../services/config.service'

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const agentStateManager = new AgentStateManager()
const configService = getConfigService()

interface AgentConfig {
  id: string
  name: string
  role: string
  prompt?: string
  modelId?: string
  color: string
  status: 'idle' | 'running' | 'paused' | 'error'
  currentTask?: string
  progress: number
  runtime: number
  tasksCompleted: number
  createdAt: number
  updatedAt: number
}

const agents: Map<string, AgentConfig> = new Map()

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
      const agentList = Array.from(agents.values()).map(agent => ({
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
      const agent = agents.get(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      const state = agentStateManager.getState(id)
      return jsonResponse({ ...agent, state: state?.state || 'idle', activities: state?.activities || [] })
    }

    if (method === 'GET' && logsMatch) {
      const id = logsMatch[1]
      const state = agentStateManager.getState(id)
      if (!state) return jsonResponse({ error: 'Agent not found' }, 404)
      const logs = state.activities.map(activity => ({
        timestamp: activity.startedAt,
        level: 'info',
        message: activity.description
      }))
      return jsonResponse(logs)
    }

    if (method === 'POST' && pathname === '/api/agents') {
      const body = await parseBody(request)
      const { name, role, prompt, modelId, color } = body

      if (!name) return jsonResponse({ error: 'Agent name is required' }, 400)

      const id = generateId()
      const preset = rolePresets[role] || rolePresets.coder

      const config = await configService.getConfig()
      const defaultModel = config.models && config.models.length > 0 ? config.models[0].id : 'default'

      const agent: AgentConfig = {
        id, name,
        role: role || 'coder',
        prompt: prompt || preset.prompt,
        modelId: modelId || defaultModel,
        color: color || preset.color,
        status: 'idle',
        currentTask: '',
        progress: 0,
        runtime: 0,
        tasksCompleted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      agents.set(id, agent)
      agentStateManager.initialize(id)
      logger.info('[AgentRoute] Agent created', { id, name, role })

      return jsonResponse(agent, 201)
    }

    if (method === 'PUT' && agentMatch) {
      const id = agentMatch[1]
      const agent = agents.get(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)

      const body = await parseBody(request)
      const { name, role, prompt, modelId, color } = body

      if (name) agent.name = name
      if (role) {
        agent.role = role
        if (!prompt && rolePresets[role]) {
          agent.prompt = rolePresets[role].prompt
          agent.color = rolePresets[role].color
        }
      }
      if (prompt) agent.prompt = prompt
      if (modelId) agent.modelId = modelId
      if (color) agent.color = color
      agent.updatedAt = Date.now()

      return jsonResponse(agent)
    }

    if (method === 'DELETE' && agentMatch) {
      const id = agentMatch[1]
      if (!agents.has(id)) return jsonResponse({ error: 'Agent not found' }, 404)
      agents.delete(id)
      logger.info('[AgentRoute] Agent deleted', { id })
      return jsonResponse({ success: true })
    }

    if (method === 'POST' && startMatch) {
      const id = startMatch[1]
      const agent = agents.get(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      if (agent.status === 'running') return jsonResponse({ error: 'Agent is already running' }, 400)

      agent.status = 'running'
      agent.updatedAt = Date.now()
      agentStateManager.setState(id, 'running', 'User started agent')
      logger.info('[AgentRoute] Agent started', { id, name: agent.name })

      return jsonResponse({ ...agent, state: 'running' })
    }

    if (method === 'POST' && pauseMatch) {
      const id = pauseMatch[1]
      const agent = agents.get(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)
      if (agent.status !== 'running') return jsonResponse({ error: 'Agent is not running' }, 400)

      agent.status = 'paused'
      agent.updatedAt = Date.now()
      agentStateManager.setState(id, 'paused', 'User paused agent')
      logger.info('[AgentRoute] Agent paused', { id, name: agent.name })

      return jsonResponse({ ...agent, state: 'paused' })
    }

    if (method === 'POST' && stopMatch) {
      const id = stopMatch[1]
      const agent = agents.get(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)

      agent.status = 'idle'
      agent.currentTask = ''
      agent.progress = 0
      agent.updatedAt = Date.now()
      agentStateManager.setState(id, 'stopped', 'User stopped agent')
      logger.info('[AgentRoute] Agent stopped', { id, name: agent.name })

      return jsonResponse({ ...agent, state: 'stopped' })
    }

    if (method === 'POST' && taskMatch) {
      const id = taskMatch[1]
      const agent = agents.get(id)
      if (!agent) return jsonResponse({ error: 'Agent not found' }, 404)

      const body = await parseBody(request)
      const { task } = body
      if (!task) return jsonResponse({ error: 'Task content is required' }, 400)

      agent.currentTask = task
      agent.status = 'running'
      agent.progress = 0
      agent.updatedAt = Date.now()
      agentStateManager.setActivity(id, {
        type: 'task_execution',
        description: task,
        startedAt: Date.now()
      })
      agentStateManager.setState(id, 'running', 'Task assigned')
      logger.info('[AgentRoute] Task assigned to agent', { id, task })

      return jsonResponse(agent)
    }

    return null
  } catch (error: any) {
    logger.error('[AgentRoute] Error', { error: error.message })
    return jsonResponse({ error: error.message }, 500)
  }
}
