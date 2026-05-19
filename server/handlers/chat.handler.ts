import { getConfigService } from '../services/config.service'
import { skillRegistry } from '../skills/skill-registry'
import { getEncryptionService } from '../services/encryption.service'
import { getMcpTools, callMcpTool } from '../services/mcp.service'
import { builtinTools } from '../services/builtin-tools.service'
import { logger } from '../services/logger.service'
import { getChatHistoryService } from '../services/chat-history.service'
import { randomUUID } from 'node:crypto'
import os from 'os'
import path from 'path'
import { PATHS } from '../shared/constants'
import type { AppConfig, ModelConfig } from '../shared/types'
import type { SkillConfig } from '../shared/types'
import { HTTP } from '../shared/constants'
import { buildToolProgressMessage } from './chat-progress'
import { memoryManager } from '../memory/memory-manager'
import { sanitizeJson, tryRepairJsonText } from '../agent'

const sharedMemoryManager = memoryManager

let memoryInitialized = false

async function ensureMemoryInitialized() {
  if (!memoryInitialized) {
    await sharedMemoryManager.initialize()
    memoryInitialized = true
    logger.info('[Chat] Memory system initialized')
  }
}

interface UserProfile {
  name?: string
  age?: number | string
  gender?: string
  location?: string
  job?: string
  family?: string[]
  preferences?: string[]
  otherInfo?: Record<string, string>
}

async function extractAndStoreUserInfo(
  message: string,
  _reply: string,
  conversationHistory: Array<{ role: string; text: string }>
): Promise<void> {
  await ensureMemoryInitialized()

  const userMessages = conversationHistory
    .filter(m => m.role === 'user')
    .map(m => m.text)
    .concat(message)

  const fullContext = userMessages.join('\n')

  const profilePatterns: Array<{ key: keyof UserProfile; patterns: RegExp[] }> = [
    {
      key: 'name',
      patterns: [
        /(?:我叫|名字是|叫我|是\s*)([^\s啊呀呢呀!！]{2,10})/,
        /(?:I am|I'm|call me)\s+([A-Za-z]{2,20})/i
      ]
    },
    {
      key: 'age',
      patterns: [
        /(?:我今年?|AGE|年龄|岁)(?:数)?(\d+)(?:岁)?/,
        /(\d+)\s*(?:years?\s*old|岁)/
      ]
    },
    {
      key: 'gender',
      patterns: [
        /(?:我是|性别)([男女])/,
        /(?:I am|I'm)\s*(male|female|man|woman)/i
      ]
    },
    {
      key: 'location',
      patterns: [
        /(?:在|住在|位于)([^\s]{2,10})(?:工作|居住|生活|市|省)?/,
        /(?:I live in|work in|based in)\s+([A-Za-z\u4e00-\u9fa5]{2,20})/i
      ]
    },
    {
      key: 'job',
      patterns: [
        /(?:我是|做|当|职业是)([^\s]{2,20})(?:工作|师|员|家|工)/,
        /(?:I work as|I'm a|position:)\s*([A-Za-z\u4e00-\u9fa5]{2,20})/i
      ]
    }
  ]

  const foundInfo: Partial<UserProfile> = {}

  for (const { key, patterns } of profilePatterns) {
    for (const pattern of patterns) {
      const match = fullContext.match(pattern)
      if (match && match[1]) {
        const value: string | number = key === 'age' ? parseInt(match[1], 10) : match[1].trim()
        ;(foundInfo as Record<string, string | number | undefined>)[key] = value
        break
      }
    }
  }

  if (Object.keys(foundInfo).length > 0) {
    const allMemories = await sharedMemoryManager.export()
    const userProfileMemory = allMemories.find(
      (m) => m.metadata?.type === 'user_profile'
    )

    let profile: UserProfile = {}
    if (userProfileMemory?.content) {
      try {
        profile = JSON.parse(userProfileMemory.content)
      } catch {
        profile = {}
      }
    }

    Object.assign(profile, foundInfo)

    if (userProfileMemory) {
      await sharedMemoryManager.deleteLong(userProfileMemory.id)
    }

    await sharedMemoryManager.addLong(JSON.stringify(profile), {
      type: 'user_profile',
      updatedAt: Date.now()
    })

    logger.info('[Chat] User profile updated', profile)
  }
}

async function getUserProfile(): Promise<UserProfile | null> {
  await ensureMemoryInitialized()

  const allMemories = await sharedMemoryManager.export()
  const userProfileMemory = allMemories.find(
    (m) => m.metadata?.type === 'user_profile'
  )

  if (!userProfileMemory?.content) {
    return null
  }

  try {
    return JSON.parse(userProfileMemory.content)
  } catch {
    return null
  }
}

async function buildUserContextPrompt(): Promise<string> {
  const profile = await getUserProfile()
  const recentContext = await buildRecentConversationContext()
  
  if (!profile && !recentContext) {
    return ''
  }

  const parts: string[] = []
  
  if (recentContext) {
    parts.push('【最近对话上下文】')
    parts.push(recentContext)
    parts.push('')
  }

  if (profile && Object.keys(profile).length > 0) {
    parts.push('【用户信息】')
    
    for (const [key, value] of Object.entries(profile)) {
      if (value !== undefined && value !== null && value !== '') {
        let displayValue: string
        if (key === 'family' && Array.isArray(value)) {
          displayValue = (value as string[]).join(', ')
        } else if (key === 'age' && typeof value === 'number') {
          displayValue = `${value}岁`
        } else if (typeof value === 'object') {
          displayValue = JSON.stringify(value)
        } else {
          displayValue = String(value)
        }
        parts.push(`- ${key}: ${displayValue}`)
      }
    }
  }

  return parts.join('\n')
}

async function buildRecentConversationContext(): Promise<string | null> {
  await ensureMemoryInitialized()
  
  const recent = await sharedMemoryManager.getContext('', 5)
  if (!recent.short || recent.short.length === 0) {
    return null
  }

  const lines: string[] = ['【重要】以下是你和用户之前的对话记录，请基于这些信息理解和回答后续问题：']
  lines.push('')
  
  for (const entry of recent.short) {
    if (entry.metadata?.type === 'conversation_turn') {
      try {
        const turns = JSON.parse(entry.content) as Array<{ role: string; text: string }>
        for (const turn of turns) {
          const roleLabel = turn.role === 'user' ? '用户' : '助手'
          const content = turn.text.length > 300 
            ? turn.text.substring(0, 300) + '...' 
            : turn.text
          lines.push(`[${roleLabel}]: ${content}`)
        }
        lines.push('---')
      } catch {
        const content = entry.content.length > 200 
          ? entry.content.substring(0, 200) + '...' 
          : entry.content
        lines.push(`对话: ${content}`)
      }
    } else {
      const content = entry.content.length > 200 
        ? entry.content.substring(0, 200) + '...' 
        : entry.content
      lines.push(`[记忆]: ${content}`)
    }
  }
  
  return lines.join('\n')
}

async function storeConversationTurn(
  userMessage: string,
  assistantReply: string,
  conversationHistory: Array<{ role: string; text: string }>
): Promise<void> {
  await ensureMemoryInitialized()

  const fullContext = [
    ...conversationHistory.map(m => ({ role: m.role, text: m.text })),
    { role: 'user', text: userMessage },
    { role: 'assistant', text: assistantReply }
  ]

  const contextJson = JSON.stringify(fullContext.slice(-10))
  
  await sharedMemoryManager.addShort(contextJson, {
    type: 'conversation_turn',
    roles: ['user', 'assistant'],
    createdAt: Date.now()
  })
  
  logger.debug('[Memory] Stored conversation turn', { 
    historyLength: fullContext.length,
    userMsgLength: userMessage.length,
    assistantMsgLength: assistantReply.length
  })
}

interface CausalNode {
  action: string
  result: string
  cause: string
  effect: string
}

interface ErrorDetail {
  code: string
  message: string
  severity: 'recoverable' | 'fatal'
  suggestion: string
  alternativeTools?: string[]
  retryable: boolean
  rootCause?: string
}

interface LearningFeedback {
  experienceGained: boolean
  patternExtracted?: string
  confidenceUpdated?: number
  recommendations?: string[]
}

interface ProgressDetail {
  percent: number
  currentStep: string
  estimatedTimeRemaining?: number
  steps: {
    total: number
    completed: number
    failed: number
    pending: number
  }
}

// 流式响应类型
interface StreamChunk {
  type: 'plan' | 'reply' | 'error' | 'done' | 'detail' | 'mcp' | 'confirm' | 'task' | 'step' | 'reasoning' | 'learning'
  plan?: SimpleStep[]
  reply?: string
  delta?: boolean
  error?: ErrorDetail | string
  detail?: {
    stage: string
    text: string
    time: string
    reasoning?: string
  }
  mcp?: {
    server: string
    tool: string
    status: 'start' | 'success' | 'error'
    error?: string
    time: string
    duration?: number
    input?: Record<string, unknown>
    result?: unknown
    confidence?: number
    causalChain?: CausalNode[]
  }
  confirm?: {
    server: string
    tool: string
    args: Record<string, unknown>
    message: string
    reasoning?: string
  }
  task?: {
    taskId: string
    status: 'pending' | 'running' | 'waiting_tool' | 'done' | 'error'
    stepId?: string
    stepStatus?: 'pending' | 'running' | 'done' | 'error'
    title?: string
    error?: string
    retries?: number
    time: string
    causalChain?: CausalNode[]
  }
  step?: {
    status: 'start' | 'done' | 'error'
    text: string
    duration?: number
    causalChain?: CausalNode[]
    errorRisk?: 'low' | 'medium' | 'high'
    expected_result?: string
  }
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  reasoning?: {
    type: 'tool_selection' | 'task_planning' | 'error_recovery' | 'optimization'
    text: string
    confidence: number
  }
  learning?: LearningFeedback
  progress?: ProgressDetail
}

interface ImageAttachment {
  name: string
  type: string
  dataUrl: string  // base64 data URL
}

interface ChatStreamOptions {
  selectedSkillId?: string
  selectedSkillIds?: string[]
  model?: string
  executionMode?: 'auto' | 'manual'
  promptInstruction?: string
  allowedMcpServers?: string[]
  signal?: AbortSignal
  images?: ImageAttachment[]
}

interface PlannerToolCall {
  server: string
  tool: string
  args: Record<string, unknown>
}

interface SimpleStep {
  id?: string
  title: string
  description: string
  input?: string
  output?: string
  depends_on?: string[]
  tool?: string
  status?: 'pending' | 'running' | 'done' | 'failed'
  completed?: boolean
  active?: boolean
  priority?: 'high' | 'medium' | 'low'
  retry?: { max: number; backoff_ms: number }
  timeout_ms?: number
  success_criteria?: string
  artifacts?: string[]
  logs?: string[]
  tool_call?: PlannerToolCall
  expected_result?: string
  fallback?: string
  requires_confirmation?: boolean
  side_effects?: string[]
  rollback?: string
}

interface PlannerStep {
  id: string
  title: string
  description: string
  input: string
  output: string
  depends_on: string[]
  tool: string
  status?: 'pending' | 'running' | 'done' | 'failed'
  priority?: 'high' | 'medium' | 'low'
  retry?: { max: number; backoff_ms: number }
  timeout_ms?: number
  success_criteria?: string
  artifacts?: string[]
  logs?: string[]
  tool_call?: PlannerToolCall
  expected_result?: string
  fallback?: string
  requires_confirmation?: boolean
  side_effects?: string[]
  rollback?: string
}

interface PlannerOutput {
  ok: boolean
  analysis: {
    goal: string
    assumptions: string[]
    constraints: string[]
    risks: string[]
  }
  steps: PlannerStep[]
  plan_id?: string
  version?: string
  created_at?: string
  updated_at?: string
  execution_order?: string[]
}

type AgentResponseType = 'plan' | 'action' | 'actions' | 'message' | 'done' | 'error'

interface AgentEnvelope {
  type: AgentResponseType
  data: Record<string, any>
}

interface AgentRuntimeState {
  targetUrl?: string
  currentUrl: string
  openedTargetUrl: boolean
  hasSnapshot: boolean
  selectedPageClosed: boolean
  inputFilled: boolean
  submitted: boolean
  lastActionFingerprint: string
  repeatActionCount: number
  stagnationTurns: number
  lastToolResultText: string
}

const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses'
const DEFAULT_ARK_MODEL = 'doubao-seed-2-0-lite-260215'
const MCP_CALL_RETRY_MAX = 1

function compactText(input: string, maxChars = 6000): string {
  const text = String(input || '')
  if (text.length <= maxChars) return text
  const head = text.slice(0, Math.floor(maxChars * 0.55))
  const tail = text.slice(-Math.floor(maxChars * 0.35))
  const omitted = text.length - head.length - tail.length
  return `${head}\n...[truncated ${omitted} chars]...\n${tail}`
}

function buildTaskEvent(
  taskId: string,
  status: 'pending' | 'running' | 'waiting_tool' | 'done' | 'error',
  options: {
    stepId?: string
    stepStatus?: 'pending' | 'running' | 'done' | 'error'
    title?: string
    error?: string
    retries?: number
  } = {}
): StreamChunk {
  return {
    type: 'task',
    task: {
      taskId,
      status,
      stepId: options.stepId,
      stepStatus: options.stepStatus,
      title: options.title,
      error: options.error,
      retries: options.retries,
      time: new Date().toISOString()
    }
  }
}

// 内部辅助工具，不向用户展示进度
const SILENT_TOOLS = new Set([
  'list_pages', 'select_page', 'take_snapshot', 'get_snapshot',
  'close_page', 'get_page_info', 'wait_for_element', 'wait_for_navigation'
])

function isSilentTool(server: string, tool: string): boolean {
  return server === 'chrome-devtools' && SILENT_TOOLS.has(tool)
}

async function executeMcpToolWithPolicy(server: string, tool: string, args: Record<string, any>) {
  let attempt = 0
  while (attempt <= MCP_CALL_RETRY_MAX) {
    attempt += 1
    const startedAt = Date.now()
    const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) => {
      setTimeout(() => resolve({ ok: false, error: `MCP 调用超时（>${HTTP.MCP_TIMEOUT_MS}ms）` }), HTTP.MCP_TIMEOUT_MS)
    })

    const result = await Promise.race([
      callMcpTool(server, tool, args),
      timeoutPromise
    ]) as { ok: boolean; result?: unknown; error?: string }

    if (result.ok) {
      return { ...result, attempts: attempt, elapsedMs: Date.now() - startedAt }
    }

    const canRetry = attempt <= MCP_CALL_RETRY_MAX
    if (!canRetry) {
      return { ...result, attempts: attempt, elapsedMs: Date.now() - startedAt }
    }
    const backoff = 250 * attempt
    await new Promise((resolve) => setTimeout(resolve, backoff))
  }

  return { ok: false, error: 'MCP 调用失败', attempts: MCP_CALL_RETRY_MAX + 1, elapsedMs: 0 }
}

function stripBearerPrefix(token: string): string {
  return String(token || '').replace(/^Bearer\s+/i, '').trim()
}

function resolveApiKey(activeModel: ModelConfig | null, encryptionService: { decrypt: (text: string) => string }): { apiKey: string; error?: string } {
  let apiKey = stripBearerPrefix(activeModel?.apiKey || '')

  if (activeModel?.apiKeyEncrypted) {
    try {
      apiKey = stripBearerPrefix(encryptionService.decrypt(activeModel.apiKeyEncrypted))
    } catch {
      return { apiKey: '', error: 'API Key 解密失败。请重新配置模型。' }
    }
  }

  if (!apiKey) {
    apiKey = stripBearerPrefix(process.env.ARK_API_KEY || '')
  }

  if (!apiKey) {
    return { apiKey: '', error: '模型 API Key 未配置。请在设置中完善模型配置。' }
  }

  return { apiKey }
}

function resolveModelRuntime(activeModel: ModelConfig | null, _config: AppConfig): { apiBaseUrl: string; modelName: string } {
  return {
    apiBaseUrl: String(activeModel?.apiBaseUrl || DEFAULT_ARK_API_URL),
    modelName: String(activeModel?.modelName || DEFAULT_ARK_MODEL)
  }
}

function summarizeForLog(input: unknown, limit = 500): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input)
  const safe = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!safe) return ''
  return safe.length > limit ? `${safe.slice(0, limit)}...` : safe
}

function buildCausalChain(
  server: string,
  tool: string,
  input: Record<string, unknown>,
  result: unknown
): CausalNode[] {
  const nodes: CausalNode[] = []
  const cause = `基于任务需求选择 ${server}/${tool} 工具`
  const effect = (result as { ok?: boolean })?.ok === false ? '操作失败，需要错误恢复' : '操作成功执行'
  nodes.push({
    action: `${server}/${tool}`,
    result: effect,
    cause,
    effect
  })
  if (input.url) {
    nodes.push({
      action: '参数解析',
      result: 'URL 参数已提取',
      cause: `解析输入参数`,
      effect: `将访问 ${String(input.url).slice(0, 30)}...`
    })
  }
  return nodes
}

type LlmResponse = { reply: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }

interface McpCallResult {
  ok: boolean
  result?: unknown
  error?: string
  attempts?: number
  elapsedMs?: number
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('The user aborted a request')
    ;(error as Error).name = 'AbortError'
    throw error
  }
}

function isAbortError(error: unknown): boolean {
  if (!error) return false
  const err = error as Error
  return err?.name === 'AbortError' || String(err?.message || '').includes('aborted')
}

function attachAbortSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => {}
  const onAbort = () => controller.abort()
  if (signal.aborted) {
    controller.abort()
  } else {
    signal.addEventListener('abort', onAbort, { once: true })
  }
  return () => signal.removeEventListener('abort', onAbort)
}

async function requestModelReply(
  apiBaseUrl: string,
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string,
  conversationHistory?: Array<{ role: string; text: string }>,
  signal?: AbortSignal,
  images?: ImageAttachment[],
  maxTokens?: number
): Promise<LlmResponse> {
  throwIfAborted(signal)
  const safeSystemPrompt = compactText(systemPrompt, HTTP.MAX_SYSTEM_PROMPT_CHARS)
  const safeUserMessage = compactText(userMessage, HTTP.MAX_USER_MESSAGE_CHARS)
  const historyWindow = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : []
  const historyChars = historyWindow.reduce((sum, msg) => sum + String(msg?.text || '').length, 0)

  const isAnthropicFormat = (apiBaseUrl.includes('/v1/messages') || apiBaseUrl.includes('/v1beta/messages'))
  const isOpenAIFormat = !isAnthropicFormat

  const input: Array<{ role: string; content: any }> = [
    isOpenAIFormat
      ? { role: 'system', content: safeSystemPrompt }
      : { role: 'system', content: [{ type: 'input_text', text: safeSystemPrompt }] }
  ]

  if (historyWindow.length > 0) {
    for (const msg of historyWindow) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        input.push(
          isOpenAIFormat
            ? { role: msg.role, content: msg.text }
            : { role: msg.role, content: [{ type: 'input_text', text: msg.text }] }
        )
      }
    }
  }

  const safeImages = Array.isArray(images) ? images : []

  if (isOpenAIFormat && safeImages.length === 0) {
    input.push({ role: 'user', content: safeUserMessage })
  } else if (isOpenAIFormat) {
    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: safeUserMessage }]
    for (const img of safeImages) {
      const base64 = img.dataUrl.split(',')[1]
      if (base64) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${img.type};base64,${base64}` }
        })
      }
    }
    input.push({ role: 'user', content: userContent })
  } else {
    const userContent: Array<Record<string, unknown>> = [{ type: 'input_text', text: safeUserMessage }]
    for (const img of safeImages) {
      const base64 = img.dataUrl.split(',')[1]
      if (base64) {
        userContent.push({
          type: 'input_image',
          image_url: `data:${img.type};base64,${base64}`
        })
      }
    }
    input.push({ role: 'user', content: userContent })
  }

  const resolvedMaxTokens = maxTokens ?? 4096
  const requestPayload = isOpenAIFormat
    ? { model: modelName, messages: input, max_tokens: resolvedMaxTokens }
    : { model: modelName, input, max_tokens: resolvedMaxTokens }

  void logger.info('[AI] LLM request', {
    apiBaseUrl,
    model: modelName,
    requestFormat: isOpenAIFormat ? 'OpenAI { model, messages }' : 'Anthropic { model, input }',
    inputMessageCount: input.length,
    systemPromptLength: safeSystemPrompt.length,
    userMessageLength: safeUserMessage.length,
    historyLength: conversationHistory?.length || 0,
    historyWindowLength: historyWindow.length,
    historyWindowChars: historyChars
  })

  const timeoutMs = HTTP.TIMEOUT_MS
  const maxAttempts = 2
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const abortRunner = new AbortController()
    const detachAbort = attachAbortSignal(signal, abortRunner)
    const timeout = setTimeout(() => abortRunner.abort(), timeoutMs)

    try {
      void logger.info('[AI] LLM request attempt', { attempt, maxAttempts, timeoutMs })
      const response = await fetch(apiBaseUrl, {
        method: 'POST',
        signal: abortRunner.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      })
    
      if (!response.ok) {
        const err = await response.text()
        void logger.error('[AI] LLM request failed', {
          model: modelName,
          status: response.status,
          body: summarizeForLog(err, 300),
          attempt
        })
        throw new Error(err)
      }

      const data = await response.json()
      void logger.info('[AI] LLM raw response', {
        apiBaseUrl,
        model: modelName,
        responseId: data?.id || '',
        status: data?.status || '',
        outputItems: Array.isArray(data?.output) ? data.output.length : 0,
        hasChoices: Array.isArray(data?.choices),
        choicesLength: Array.isArray(data?.choices) ? data.choices.length : 0,
        firstChoiceContent: data?.choices?.[0]?.message?.content || '',
        firstChoiceContentLength: (data?.choices?.[0]?.message?.content || '').length,
        usage: data?.usage
          ? {
              inputTokens: data.usage?.input_tokens || 0,
              outputTokens: data.usage?.output_tokens || 0,
              totalTokens: data.usage?.total_tokens || 0
            }
          : undefined,
        attempt
      })
      let reply = ''

      if (Array.isArray(data?.output)) {
        for (const item of data.output) {
          if (item?.type === 'message' && Array.isArray(item?.content)) {
            for (const contentItem of item.content) {
              if (contentItem?.type === 'output_text' && contentItem?.text) {
                reply = contentItem.text
                break
              }
            }
            if (reply) break
          }
        }
      }

      if (!reply) {
        reply = data?.output_text || data?.choices?.[0]?.message?.content || ''
        void logger.info('[AI] Reply extraction', {
          fromOutputText: data?.output_text || '',
          fromChoices: data?.choices?.[0]?.message?.content || '',
          finalReply: reply,
          replyLength: reply.length
        })
      }

      if (!reply && Array.isArray(data?.output) && data.output.length > 1) {
        const secondItem = data.output[1]
        if (secondItem?.content?.[0]?.text) {
          reply = secondItem.content[0].text
        }
      }

      const finalReply = reply || 'AI 未返回有效内容'
      void logger.info('[AI] LLM response', {
        model: modelName,
        replyLength: finalReply.length,
        attempt
      })

      const promptTokens = data?.usage?.input_tokens || 0
      const completionTokens = data?.usage?.output_tokens || 0
      const totalTokens = data?.usage?.total_tokens || (promptTokens + completionTokens)
      if (totalTokens > 0) {
        try {
          const configService = getConfigService()
          const config = await configService.getConfig()
          const historyService = getChatHistoryService(config.settings?.userDataDir)
          historyService.recordTokenUsage(modelName, promptTokens, completionTokens, totalTokens)
        } catch (e) {
          void logger.warn('[AI] Failed to record token usage', e)
        }
      }

      return { reply: finalReply, usage: { promptTokens, completionTokens, totalTokens } }
    } catch (error: unknown) {
      lastError = error
      if (signal?.aborted) {
        const abortError = new Error('The user aborted a request')
        ;(abortError as Error).name = 'AbortError'
        throw abortError
      }
      const isAbort = (error as Error)?.name === 'AbortError' || String((error as Error)?.message || '').includes('aborted')
      if (isAbort && attempt < maxAttempts) {
        void logger.warn('[AI] LLM request aborted, retrying', { attempt, nextAttempt: attempt + 1, timeoutMs })
        continue
      }
      throw error
    } finally {
      clearTimeout(timeout)
      detachAbort()
    }
  }

  throw lastError || new Error('LLM request failed')
}

function* streamReplyChunks(reply: string, chunkSize = 60): Generator<StreamChunk> {
  const text = String(reply || '')
  if (!text) {
    yield { type: 'reply', reply: '', delta: false }
    return
  }

  for (let i = 0; i < text.length; i += chunkSize) {
    yield {
      type: 'reply',
      reply: text.slice(i, i + chunkSize),
      delta: true
    }
  }
}

function buildDetail(stage: string, text: string): StreamChunk {
  return {
    type: 'detail',
    detail: {
      stage,
      text,
      time: new Date().toISOString()
    }
  }
}

function buildMcpDisplayReply(server: string, tool: string, result: unknown): string {
  void tool
  let rawResult: unknown = result
  if (result && typeof result === 'object' && 'result' in result) {
    rawResult = (result as { result: unknown }).result
  }

  let resultText = ''
  if (typeof rawResult === 'string' && rawResult.trim()) {
    resultText = rawResult.trim()
    try {
      const parsed = JSON.parse(rawResult)
      if (parsed.stdout) {
        resultText = parsed.stdout
      } else if (parsed.output) {
        resultText = parsed.output
      } else if (parsed.result) {
        resultText = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result)
      }
    } catch {
    }
  } else if (rawResult && typeof rawResult === 'object') {
    const candidate = rawResult as Record<string, unknown>
    const pick = ['output', 'stdout', 'text', 'content', 'data']
      .map((key) => (typeof candidate[key] === 'string' ? String(candidate[key]) : ''))
      .find((value) => value.trim().length > 0)
    if (pick) {
      resultText = pick.trim()
    }
  }

  if (!resultText) {
    return '运行结束，已完成。'
  }

  if (server === 'shell') {
    return resultText
  }

  // 浏览器 MCP 原始输出通常较长（例如 pages 列表），前端只显示完成状态即可
  if (server === 'chrome-devtools') {
    return '运行结束，已完成。'
  }

  // 其它 MCP 保留简短输出，避免刷屏
  return resultText.length > 200 ? `${resultText.slice(0, 200)}…` : resultText
}

function userWantsTable(message: string): boolean {
  const text = String(message || '').toLowerCase()
  return /表格|table|表格式/.test(text)
}

function isMarkdownTable(text: string): boolean {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 2) return false
  const header = lines[0]
  const divider = lines[1]
  return header.includes('|') && /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?$/.test(divider)
}

function containsMarkdownTable(text: string): boolean {
  const pattern = /\|.+\|\s*\n\|[-:| ]+\|\s*\n/;
  return pattern.test(String(text || ''));
}

function tryConvertKeyValueToTable(text: string): string | null {
  const lines = String(text || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('$') && !/^执行命令结果/.test(line))

  const rows: Array<{ key: string; value: string }> = []
  for (const rawLine of lines) {
    const line = rawLine.replace(/^[\-\*\u2022]\s+/, '').trim()
    const sectionMatch = /^-+\s*(.+?)\s*-+$/.exec(line)
    if (sectionMatch) {
      rows.push({ key: `**${sectionMatch[1].trim()}**`, value: '' })
      continue
    }
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      if (key && value) {
        rows.push({ key, value })
        continue
      }
    }
    const spaced = /^(.+?)\s{2,}(.+)$/.exec(line)
    if (spaced) {
      rows.push({ key: spaced[1].trim(), value: spaced[2].trim() })
    }
  }

  const usableRows = rows.filter(row => row.key && row.value)
  if (usableRows.length < 2) return null

  const tableRows = rows.map(row => `| ${row.key} | ${row.value} |`).join('\n')
  return `| 项目 | 值 |\n| --- | --- |\n${tableRows}`
}

function formatReplyForUser(message: string, replyText: string): string {
  const text = String(replyText || '').trim()
  if (!text) return text
  if (!userWantsTable(message)) return text
  if (isMarkdownTable(text) || containsMarkdownTable(text)) return text
  const table = tryConvertKeyValueToTable(text)
  return table || text
}

function getPlatformInfo(platform: string): string {
  const platformMap: Record<string, string> = {
    'darwin': 'macOS (Apple)',
    'linux': 'Linux',
    'win32': 'Windows'
  }
  return platformMap[platform] || platform
}

function getPlatformCommands(platform: string): { shell: string; systemInfo: string } {
  const commands: Record<string, { shell: string; systemInfo: string }> = {
    'darwin': {
      shell: 'zsh/bash',
      systemInfo: 'vm_stat (内存), uptime (运行时长), df -h (磁盘)'
    },
    'linux': {
      shell: 'bash/sh',
      systemInfo: 'free -h (内存), uptime -p (运行时长), df -h (磁盘)'
    },
    'win32': {
      shell: 'powershell/cmd',
      systemInfo: 'systeminfo (系统信息), wmic (硬件信息)'
    }
  }
  return commands[platform] || { shell: 'bash', systemInfo: 'df -h' }
}

function buildAgentSystemPrompt(
  skills: SkillConfig[],
  mcpToolsDesc: string,
  selectedSkillHint = '',
  promptInstruction = ''
): string {
  const customPromptBlock = String(promptInstruction || '').trim()
    ? `\n\n【用户专属提示词（最高优先级，必须严格遵循）】\n${String(promptInstruction || '').trim()}`
    : ''

  const platform = os.platform()
  const platformInfo = getPlatformInfo(platform)
  const platformCommands = getPlatformCommands(platform)
  const homeDir = os.homedir()
  const desktopDir = path.join(homeDir, 'Desktop')
  const documentsDir = path.join(homeDir, 'Documents')
  const downloadsDir = path.join(homeDir, 'Downloads')

  return `你是一个 AI Agent，但只有在任务需要时才进入 Agent 模式。

==============================
[系统环境] 当前运行环境
==============================
- 操作系统：${platformInfo}
- 执行 Shell 命令时必须使用 ${platformCommands.shell} 命令
${platformCommands.systemInfo ? `- 系统监控命令：${platformCommands.systemInfo}` : ''}
- 用户主目录：${homeDir}
- 桌面路径：${desktopDir}
- 文稿路径：${documentsDir}
- 下载路径：${downloadsDir}
- 项目工作区：${PATHS.WORKSPACE_DIR}
【重要】操作文件时必须使用以上绝对路径，禁止使用 ~ 或 $HOME 等符号路径，filesystem 工具不支持路径展开。
【默认保存位置】
- 用户创建网站/应用/项目 → 保存到工作区 ${PATHS.WORKSPACE_DIR}/<项目名>/
- 用户未指定路径的单个文件 → 保存到工作区根目录 ${PATHS.WORKSPACE_DIR}/
- 用户明确说"桌面" → 保存到 ${desktopDir}

==============================
[重要] 【文件路径规范（必须严格遵守）】
==============================
1. 创建/操作文件后，必须返回完整的绝对路径，禁止使用相对路径
2. 完整路径格式示例：/Users/用户名/Desktop/project/crabclaw/test.php
3. 路径必须包含完整的 /Users/xxx/ 前缀，禁止使用 ~ 或 $HOME
4. 返回结果时，路径单独放在一行，方便系统识别为可点击链接
5. 如果是目录，返回格式：📁 目录：/Users/用户名/Desktop/project
6. 如果是文件，返回格式：📄 文件：/Users/用户名/Desktop/project/file.php
==============================
调用 shell/shell_execute 时必须遵守以下规则：

1. 【内存信息获取】
   - macOS: 使用 "vm_stat" 或 "top -l 1 | grep Phys"
   - Linux: 使用 "free -m" (注意: 不是 free -h，Linux 支持 -m)
   - Windows: 不需要单独获取，系统信息通过 systeminfo

2. 【CPU 负载】
   - macOS: "uptime" 显示负载均值
   - Linux: "uptime" 或 "cat /proc/loadavg"
   - Windows: "wmic cpu get loadpercentage"

3. 【磁盘使用】
   - macOS/Linux: "df -h" (跨平台兼容)
   - Windows: "wmic logicaldisk get size,freespace,caption"

4. 【进程列表】
   - macOS: "ps aux"
   - Linux: "ps aux" 或 "ps -ef"
   - Windows: "tasklist"

5. 【网络连接】
   - macOS: "netstat -an"
   - Linux: "ss -tuln" (比 netstat 更现代)
   - Windows: "netstat -an"

【禁止】
- 禁止: free -h (macOS 不支持 -h 参数)
- 禁止: /proc/loadavg (仅 Linux)
- 禁止: pgrep (macOS 使用 ps + grep 替代)
- 禁止调用 shell/read_execution_output（该工具不需要，shell_execute 已直接返回结果）
- 禁止调用任何不存在的工具

==============================
[核心目标] 核心目标
==============================
- 理解用户意图
- 判断是否需要执行任务
- 能直接回答就直接回答
- 必要时才拆解步骤和调用工具（MCP）
- 避免过度执行

==============================
[最高优先级] 【最高优先级规则：意图判断】
==============================
在执行任何 plan 或 action 前，必须先判断用户意图：

1. 如果是简单对话（问候 / 闲聊 / 无明确任务）
   → 直接输出 type="message"
   → 严禁调用任何 MCP 工具
   → 不要生成 plan

2. 如果问题可以直接回答（无需工具）
   → 直接输出 type="message"
   → 不要调用 MCP
   → 不要生成 plan

3. 只有在以下情况才允许进入 Agent 模式：
   - 用户明确要求执行任务（如：写代码、执行命令、访问网页、处理数据）
   - 或任务必须依赖外部工具（浏览器 / shell / API）

否则：
→ 一律禁止调用 MCP 工具

==============================
[禁止] 【禁止过度执行】
==============================
- 不要为简单问题生成 plan
- 不要把单步任务拆成多步骤
- 不要调用无关工具
- 不要"假装很智能"而执行多余操作

【系统查询命令规则】
- 执行 ps aux、free、df 等全量系统命令前，必须先明确用户需求
- 例如：用户问"内存占用" → 应该用 system_info 或 free -m，不是 ps aux
- 如果用户意图不明确，先询问再执行，不要直接返回海量原始数据
- 返回结果应该是用户需要的信息，而不是命令的原始输出格式

【失败处理规则】
- 工具调用失败后，如果错误信息已明确说明原因，禁止重复调用相同工具
- 如果遇到 "Access denied" 或 "path outside allowed directories"：
  1. 如果是 filesystem 工具：切换到 shell/shell_execute 使用系统命令执行
  2. 桌面路径已在系统环境中提供，直接使用上方 [系统环境] 中的桌面路径，禁止自行猜测路径
  3. 如果 shell 也不可用，再告知用户

==============================
[任务反馈] 【任务执行实时反馈（必须遵守）】
==============================
当用户要求执行任务（如创建网站、编写代码、操作文件等）时，必须分步骤实时反馈进度：

- 每执行一个操作前，先输出简要说明：
   - "正在读取 index.html..."
   - "正在创建 styles.css..."
   - "正在写入 package.json..."
   - "正在安装依赖 npm install..."

- 反馈内容要具体：
   - 包含文件名、操作类型
   - 让用户知道当前进度

- 示例场景（创建 Vue 项目）：
   1. "正在读取项目结构..."
   2. "正在创建 src/App.vue..."
   3. "正在创建 src/components/Header.vue..."
   4. "正在安装依赖 npm install..."
   5. "项目创建完成！"

X 禁止：只输出"任务完成"，不说明中间步骤

==============================
[浏览器] 【浏览器使用规则（强约束）】
==============================
只有在以下情况才允许调用 chrome-devtools：

- 用户明确要求：
  - 打开某个 URL
  - 搜索网页内容
  - 操作网页（点击 / 输入）

X 以下情况禁止调用：
  - 问候（你好 / hello）
  - 普通问答
  - 未提及网页操作

【打开网站（最高优先级规则）】
- 用户说"打开 xxx" / "访问 xxx" / "帮我看一下 xxx" → 立即用 new_page 直接跳转目标 URL，一步完成！
- ⚠️ 禁止先打开百度再搜索 —— 你知道网站域名就直接跳转，绝不绕路！
- ⚠️ 每次对话都是全新任务，不要参考上一轮对话的浏览器操作历史
- 常见网站对应域名：小红书=www.xiaohongshu.com, 抖音=www.douyin.com, 微博=weibo.com, 淘宝=taobao.com, 京东=jd.com, B站=www.bilibili.com, 知乎=www.zhihu.com, YouTube=www.youtube.com, GitHub=github.com
- 导航超时（"Navigation timeout of 10000ms exceeded"）= 页面正在加载中，属于正常 → 立刻输出 type="done" 告知用户已打开，禁止重试！
- "Navigating frame was detached" = 页面跳转中，属于正常 → 立刻输出 type="done"，禁止继续操作！
- new_page 成功返回页面列表（"## Pages ..."）→ 说明已打开，立刻输出 type="done"

【跨对话浏览器状态维护（重要）】
- chrome-devtools 维护的是真实浏览器状态，页面不会在对话间关闭
- 当用户要求在"已打开的页面"中操作时，必须先调用 list_pages 获取当前页面列表
- 如果 list_pages 显示页面已存在，应使用 select_page 切换到该页面，而不是新建页面
- 只有当 list_pages 返回空列表或找不到目标页面时，才使用 new_page

【evaluate_script 参数规范（强制）】
- 必须传 "function" 字段，值为箭头函数字符串，例如：{"function": "() => document.title"}
- 如需返回多个值：{"function": "() => ({ title: document.title, url: location.href })"}
- 禁止传 "expression" 字段
- 禁止传裸代码字符串（如 "document.title"）
- 禁止在箭头函数内使用分号结束表达式语句（会导致语法错误）
- 错误示例（禁止）：{"expression": "document.title"} 或 {"function": "document.title;"}
- 正确示例：{"function": "() => document.title"}

==============================
[工具调用] 【工具调用前检查（必须全部满足）】
==============================
调用 MCP 前必须确认：

- 用户明确提出执行需求
- 该任务无法通过纯文本完成
- 目标明确（URL / 命令 / 参数）

否则：
→ 禁止调用工具

==============================
[真实性约束] 【真实性约束（必须遵守）】
==============================
- 未通过工具获取的本机信息，禁止编造为“当前运行环境/本机/实时”
- 如果无法获取真实数据，必须明确说明“无法访问本机数据”，并给出用户自查方法

==============================
[Truthfulness] 【Truthfulness Rules (Must Follow)】
==============================
- Do NOT claim “local/real-time/current environment” data unless obtained via tools.
- If real data cannot be accessed, explicitly say you cannot access it and provide user self-check steps.

==============================
[输出格式] 输出格式（严格 JSON，这是强制要求）
==============================
你的每一次回复必须是且只能是一个合法的 JSON 对象，格式如下：
{
  “type”: “plan | action | message | done | error”,
  “data”: {}
}

⚠️ 警告：绝对禁止在 JSON 之外输出任何自然语言文字、解释、表情符号或 Markdown。
⚠️ 警告：如果你输出了 JSON 之外的内容，系统将无法解析并导致任务失败。
⚠️ 警告：即使是”正在处理...”这样的提示语也禁止出现在 JSON 外部。

【正确示例】
{“type”:”message”,”data”:{“content”:”你好！有什么可以帮你？”}}

【错误示例（绝对禁止）】
“好的，我来帮你...”
“正在创建文件...”

==============================
[输出规则] 输出规则
==============================
1. 不允许输出任何 JSON 以外的文本（包括 Markdown、表情、说明文字）
2. 每次只输出一个 JSON 对象
3. 能 message 解决 → 不要 plan
4. 能一步完成 → 不要拆步骤
5. 【重要】执行完工具后必须把结果告诉用户，禁止只输出”运行结束”
6. 默认只输出”可读的结果摘要/结构化信息”，不要展示命令行、日志或原始终端输出；除非用户明确要求查看原始输出

==============================
[类型说明] 类型说明
==============================

【message】
用于：
- 问候
- 直接回答
- 简单说明

回复格式要求：
- 优先使用表情符号（微笑、点赞、庆祝、灯泡、放大镜等）
- 支持 Markdown 格式（**加粗**、*斜体*、列表、引用等）
- 使用有序/无序列表组织信息
- 友好亲切的语气

content 内容示例：
"你好呀！我是你的 AI 助手，可以帮你：\n- 搜索网页信息\n- 打开和管理网页\n- 执行命令和代码\n\n有什么需要帮忙的吗？"

【plan】
仅用于复杂任务拆解：
{
  "type": "plan",
  "data": {
    "steps": [
      { "id": "step_1", "description": "..." }
    ]
  }
}

【action】
调用单个 MCP 工具：
{
  "type": "action",
  "data": {
    "tool": "mcp",
    "name": "工具名",
    "input": {}
  }
}

【actions】（批量顺序执行，减少来回次数，优先使用）
当多个步骤不依赖彼此的返回结果时，一次性输出所有步骤：
{
  "type": "actions",
  "data": {
    "steps": [
      { "tool": "mcp", "name": "工具名1", "input": {} },
      { "tool": "mcp", "name": "工具名2", "input": {} }
    ]
  }
}
[警告] 只有当后一步不需要前一步的返回结果时才使用 actions；否则用单步 action。

【done】
任务完成：
{
  "type": "done",
  "data": {
    "result": "最终结果，必须包含任务执行获取的信息"
  }
}

【error】
执行失败：
{
  "type": "error",
  "data": {
    "message": "错误信息"
  }
}

==============================
[技能] 可用技能
==============================
${skills.map(s => `- ${s.id}`).join('\n')}

==============================
[MCP工具] 可用 MCP 工具（按平台分组）
==============================
${mcpToolsDesc}

【重要】调用任何工具前必须先判断当前平台：
- process.platform 返回值：'darwin'(macOS), 'linux', 'win32'
- 根据平台选择对应的工具和命令

【平台判断与工具选择流程】
1. 系统信息查询（内存、CPU、磁盘、进程概览）：优先使用 builtin/system_info
2. 网络连接查询：使用 netstat -an 或 ss -tuln
3. 详细进程查询：使用 ps aux（仅在用户明确要求时才用）

工具命名规范（必须严格遵守）：
- 格式：server/tool（斜杠分隔）
- 示例：shell/shell_execute, fetch/fetch_readable, filesystem/read_file, chrome-devtools/navigate_page
- X 禁止：不要使用下划线连接（如 fetch_readable）
- X 禁止：不要使用重复前缀（如 fetch_fetch_readable）

==============================
[额外提示] 额外提示
==============================
${selectedSkillHint || '无'}

${customPromptBlock}
`
}

function formatMcpToolHint(tool: { name?: string; inputSchema?: { required?: unknown[] } }): string {
  const name = String(tool?.name || '').trim()
  if (!name) return ''
  const schema = tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema as { required?: unknown[] } : {}
  const required = Array.isArray(schema.required) ? schema.required.map((v: unknown) => String(v)).filter(Boolean) : []
  if (!required.length) {
    return name
  }
  return `${name}(required: ${required.join(', ')})`
}

function tryBalanceJsonObject(text: string): string | null {
  const raw = String(text || '').trim()
  if (!raw || !raw.includes('{')) return null

  let depth = 0
  let inString = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"' && (i === 0 || raw[i - 1] !== '\\')) {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') depth--
  }

  if (inString || depth <= 0) return null
  return `${raw}${'}'.repeat(depth)}`
}

function parseAgentEnvelope(reply: string): AgentEnvelope | null {
  const text = String(reply || '').trim()
  if (!text) return null

  const candidates: string[] = [text]
  const balancedText = tryBalanceJsonObject(text)
  if (balancedText && !candidates.includes(balancedText)) {
    candidates.unshift(balancedText)
  }
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const fencedText = String(fenced[1]).trim()
    candidates.unshift(fencedText)
    const balancedFenced = tryBalanceJsonObject(fencedText)
    if (balancedFenced && !candidates.includes(balancedFenced)) {
      candidates.unshift(balancedFenced)
    }
  }

  // 提取第一个完整的 JSON 对象（支持多 JSON 对象并列的情况）
  const jsonObjects: string[] = []
  let searchPos = 0
  while (searchPos < text.length) {
    const firstBrace = text.indexOf('{', searchPos)
    if (firstBrace < 0) break
    let depth = 0
    let inString = false
    let endPos = -1
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"' && (i === 0 || text[i - 1] !== '\\')) inString = !inString
      if (!inString) {
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { endPos = i; break }
        }
      }
    }
    if (endPos > firstBrace) {
      jsonObjects.push(text.slice(firstBrace, endPos + 1))
      searchPos = endPos + 1
    } else {
      searchPos = firstBrace + 1
    }
  }

  // 把独立 JSON 对象加入候选列表
  for (const obj of jsonObjects) {
    if (!candidates.includes(obj)) candidates.push(obj)
  }

  // 添加经过修复的候选字符串（sanitizeJson / tryRepairJsonText）
  for (const rawCandidate of [text, ...candidates]) {
    const repaired = tryRepairJsonText(rawCandidate)
    if (repaired && !candidates.includes(repaired)) candidates.push(repaired)
    const sanitized = sanitizeJson(rawCandidate)
    if (sanitized && !candidates.includes(sanitized)) candidates.push(sanitized)
    const repairedSanitized = tryRepairJsonText(sanitized)
    if (repairedSanitized && !candidates.includes(repairedSanitized)) candidates.push(repairedSanitized)
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      const type = String(parsed.type || '').trim() as AgentResponseType
      if (!['plan', 'action', 'actions', 'message', 'done', 'error'].includes(type)) continue
      let data: Record<string, any> = {}
      if (parsed.data && typeof parsed.data === 'object') {
        data = parsed.data
      } else if (typeof parsed.data === 'string') {
        try { data = JSON.parse(parsed.data) } catch { data = {} }
      }
      void logger.info('[AI] Agent envelope parsed', {
        type,
        data: summarizeForLog(data, 800)
      })
      return { type, data }
    } catch {
      // try next candidate
    }
  }
  // 最后兜底：在修复后的完整文本中搜索有效的 type 字段
  try {
    const repairedFull = tryRepairJsonText(text)
    if (repairedFull) {
      const looseMatch = repairedFull.match(/"type"\s*:\s*"(plan|action|actions|message|done|error)"/i)
      if (looseMatch) {
        const matchedType = looseMatch[1] as AgentResponseType
        const sanitizedFull = sanitizeJson(repairedFull)
        if (sanitizedFull) {
          try {
            const parsed = JSON.parse(sanitizedFull)
            if (parsed && typeof parsed === 'object') {
              return {
                type: matchedType,
                data: (parsed.data && typeof parsed.data === 'object') ? parsed.data : {}
              }
            }
          } catch {
            // 无法解析修复后的内容
          }
        }
      }
    }
  } catch {
    // 兜底处理失败
  }

  void logger.warn('[AI] Agent envelope parse failed', {
    reply: summarizeForLog(text, 900)
  })
  return null
}

/**
 * 当 parseAgentEnvelope 失败时，尝试从 JSON 文本中提取可读内容。
 * AI 可能返回了合法的 JSON 但不是标准 envelope 格式，直接展示原始 JSON 给用户不友好。
 */
export function ensureReadableText(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return raw

  const parseCandidates = [raw]
  const balancedRaw = tryBalanceJsonObject(raw)
  if (balancedRaw && !parseCandidates.includes(balancedRaw)) {
    parseCandidates.unshift(balancedRaw)
  }
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const fencedText = String(fenced[1]).trim()
    parseCandidates.unshift(fencedText)
    const balancedFenced = tryBalanceJsonObject(fencedText)
    if (balancedFenced && !parseCandidates.includes(balancedFenced)) {
      parseCandidates.unshift(balancedFenced)
    }
  }

  let searchPos = 0
  while (searchPos < raw.length) {
    const firstBrace = raw.indexOf('{', searchPos)
    if (firstBrace < 0) break
    let depth = 0
    let inString = false
    let endPos = -1
    for (let i = firstBrace; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === '"' && (i === 0 || raw[i - 1] !== '\\')) inString = !inString
      if (!inString) {
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            endPos = i
            break
          }
        }
      }
    }
    if (endPos < 0) {
      searchPos = firstBrace + 1
      continue
    }

    const candidate = raw.slice(firstBrace, endPos + 1)
    if (!parseCandidates.includes(candidate)) {
      parseCandidates.push(candidate)
    }
    searchPos = endPos + 1
  }

  const balancedCandidates = parseCandidates
    .map((candidate) => tryBalanceJsonObject(candidate))
    .filter((candidate): candidate is string => Boolean(candidate) && !parseCandidates.includes(candidate as string))
  parseCandidates.unshift(...balancedCandidates)

  for (const candidate of parseCandidates) {
    let parsed: any
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }

    if (typeof parsed === 'string') {
      const unwrapped = String(parsed || '').trim()
      if (unwrapped && unwrapped !== candidate) {
        const sub = ensureReadableText(unwrapped)
        if (sub) return sub
      }
      continue
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue
    }

    const readableFields = ['content', 'message', 'text', 'result', 'output', 'reply', 'data']
    for (const field of readableFields) {
      const val = parsed[field]
      if (typeof val === 'string' && val.trim()) {
        const trimmed = val.trim()
        const sub = ensureReadableText(trimmed)
        return sub || trimmed
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const sub = ensureReadableText(JSON.stringify(val))
        if (sub) return sub
      }
    }
  }

  const quotedFieldPatterns = [
    /"content"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"result"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"message"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"text"\s*:\s*"((?:\\.|[^"\\])*)"/,
  ]

  for (const pattern of quotedFieldPatterns) {
    const match = raw.match(pattern)
    if (!match?.[1]) continue
    try {
      const extracted = JSON.parse(`"${match[1]}"`)
      if (typeof extracted === 'string' && extracted.trim()) {
        return extracted.trim()
      }
    } catch {
      const fallback = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
        .trim()
      if (fallback) return fallback
    }
  }

  return raw
}

function resolveActionTarget(
  actionName: string,
  mcpToolsMap: Record<string, Array<{ name: string }>>
): { server: string; tool: string } | null {
  const raw = String(actionName || '').trim()
  if (!raw) return null

  const normalizeToolAlias = (server: string, tool: string): string => {
    const safeServer = String(server || '').trim()
    const safeTool = String(tool || '').trim()
    const availableTools = mcpToolsMap[safeServer] || []

    // 兼容旧提示词中的 shell/shell_execute，实际 MCP 工具名是 run_process
    if (
      safeServer === 'shell' &&
      ['shell_execute', 'execute', 'run_shell', 'shell_execute_command'].includes(safeTool) &&
      availableTools.some((t) => t.name === 'run_process')
    ) {
      return 'run_process'
    }

    return safeTool
  }

  if (raw.includes('/')) {
    const [server, tool] = raw.split('/', 2).map((v) => v.trim())
    if (server && tool) return { server, tool: normalizeToolAlias(server, tool) }
  }

  const found: Array<{ server: string; tool: string }> = []
  for (const [server, tools] of Object.entries(mcpToolsMap)) {
    if ((tools || []).some((t) => t.name === raw)) {
      found.push({ server, tool: raw })
    }
  }
  if (found.length === 1) return found[0]

  // 降级处理：移除可能的重复前缀（如 fetch_fetch_readable -> fetch_readable）
  if (raw.includes('_')) {
    const parts = raw.split('_')
    if (parts.length >= 2) {
      // 尝试合并前两部分作为 server，剩余作为 tool
      const possibleServer = parts[0]
      const possibleTool = parts.slice(1).join('_')
      for (const [server, tools] of Object.entries(mcpToolsMap)) {
        if (server === possibleServer && (tools || []).some((t) => t.name === possibleTool)) {
          void logger.info('[Action Target] Resolved with deduplication', { 
            original: raw, 
            resolved: `${server}/${possibleTool}` 
          })
          return { server, tool: possibleTool }
        }
      }
      // 如果不行，尝试原始 server 和 tool（去掉第一段前缀）
      for (const [server, tools] of Object.entries(mcpToolsMap)) {
        if ((tools || []).some((t) => t.name === possibleTool)) {
          void logger.info('[Action Target] Resolved with tool-only match', { 
            original: raw, 
            server,
            tool: possibleTool 
          })
          return { server, tool: possibleTool }
        }
      }
    }
  }

  return null
}

function getAgentMessageText(data: Record<string, any> | string): string {
  let parsedData: Record<string, any> = {}
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data)
    } catch {
      return data
    }
  } else {
    parsedData = data
  }
  return (
    String(parsedData?.result || '').trim() ||
    String(parsedData?.message || '').trim() ||
    String(parsedData?.content || '').trim() ||
    String(parsedData?.text || '').trim()
  )
}

function truncateForPrompt(value: unknown, limit = 800): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean
}

function summarizeEnvelopeForPrompt(envelope: AgentEnvelope): string {
  if (!envelope || typeof envelope !== 'object') return '{}'
  if (envelope.type !== 'action') {
    return JSON.stringify({
      type: envelope.type,
      data: envelope.data || {}
    })
  }
  const data = envelope.data || {}
  const compactAction = {
    type: 'action',
    data: {
      tool: String(data.tool || ''),
      name: String(data.name || ''),
      input: truncateForPrompt(data.input || {}, 260)
    }
  }
  return JSON.stringify(compactAction)
}

function buildAgentFollowupPrompt(
  originalTask: string,
  previousEnvelope: AgentEnvelope,
  options: { toolResult?: string; extra?: string; server?: string } = {}
): string {
  const previousEnvelopeSummary = summarizeEnvelopeForPrompt(previousEnvelope)
  const isShellCommand = options.server === 'shell'
  const toolResultLimit = isShellCommand ? Number.MAX_SAFE_INTEGER : 4000
  const toolResultSummary = options.toolResult ? truncateForPrompt(options.toolResult, toolResultLimit) : ''
  const extraSummary = options.extra ? truncateForPrompt(options.extra, HTTP.MAX_EXTRA_SUMMARY_CHARS) : ''
  const lines = [
    `原始任务：${truncateForPrompt(originalTask, 260)}`,
    `你上一轮输出（摘要）：${previousEnvelopeSummary}`,
    toolResultSummary ? `工具执行结果：${toolResultSummary}` : '',
    extraSummary ? extraSummary : '',
    '请继续推进任务。',
    '⚠️ 重要：你的回复必须是且只能是一个 JSON 对象，格式必须严格符合以下之一：',
    '  - 推进任务：{"type":"action","data":{"tool":"mcp","name":"工具名","input":{...}}}',
    '  - 批量执行：{"type":"actions","data":{"steps":[{"tool":"mcp","name":"工具1","input":{}},{"tool":"mcp","name":"工具2","input":{}}]}}',
    '  - 直接回答：{"type":"message","data":{"content":"你的回答"}}',
    '  - 任务完成：{"type":"done","data":{"result":"执行结果"}}',
    '⚠️ 绝对禁止输出任何 JSON 之外的文字、Markdown、代码块、表情符号或自然语言。',
    '如果后续多个步骤不依赖彼此返回结果，优先用 type="actions" 批量输出所有步骤，减少来回次数。',
    '如果任务未完成且步骤有依赖，用 type="action" 输出单步。',
    '只有全部完成后才输出 type="done"。'
  ].filter(Boolean)
  return lines.join('\n')
}

function normalizeCompactText(text: string): string {
  return String(text || '').replace(/\s+/g, '')
}

function extractCurrentUrlFromMcpText(text: string): string {
  const compact = normalizeCompactText(text)
  const selected = compact.match(/\d+:https?:\/\/[^\]]+\[selected\]/i)
  if (selected) {
    return selected[0]
      .replace(/^\d+:/, '')
      .replace(/\[selected\]$/i, '')
      .trim()
  }

  const snapshot = compact.match(/url="(https?:\/\/[^"]+)"/i)
  if (snapshot?.[1]) {
    return snapshot[1]
  }

  const plain = compact.match(/https?:\/\/[^\s"'`<>]+/i)
  return plain?.[0] || ''
}

function extractTargetUrlFromMessage(message: string): string {
  const text = String(message || '')
  // 直接 URL
  const urlMatch = text.match(/https?:\/\/[^\s"'<>，。！？]+/)
  if (urlMatch) return urlMatch[0]
  // 常见网站名映射
  const siteMap: Record<string, string> = {
    '小红书': 'xiaohongshu.com',
    '抖音': 'douyin.com',
    '微博': 'weibo.com',
    '淘宝': 'taobao.com',
    '京东': 'jd.com',
    '百度': 'baidu.com',
    'bilibili': 'bilibili.com',
    'b站': 'bilibili.com',
    'youtube': 'youtube.com',
    'github': 'github.com',
    '知乎': 'zhihu.com',
    '微信': 'weixin.qq.com',
  }
  for (const [name, domain] of Object.entries(siteMap)) {
    if (text.toLowerCase().includes(name.toLowerCase())) return domain
  }
  return ''
}

function createInitialRuntimeState(userMessage: string): AgentRuntimeState {
  return {
    targetUrl: extractTargetUrlFromMessage(userMessage),
    currentUrl: '',
    openedTargetUrl: false,
    hasSnapshot: false,
    selectedPageClosed: false,
    inputFilled: false,
    submitted: false,
    lastActionFingerprint: '',
    repeatActionCount: 0,
    stagnationTurns: 0,
    lastToolResultText: ''
  }
}

function buildActionFingerprint(server: string, tool: string, input: Record<string, any>): string {
  const payload = JSON.stringify(input || {})
  return `${server}/${tool}:${payload}`
}

function snapshotRuntimeState(state: AgentRuntimeState): string {
  return JSON.stringify({
    currentUrl: state.currentUrl,
    openedTargetUrl: state.openedTargetUrl,
    hasSnapshot: state.hasSnapshot,
    selectedPageClosed: state.selectedPageClosed,
    inputFilled: state.inputFilled,
    submitted: state.submitted
  })
}

function updateRuntimeStateAfterAction(
  state: AgentRuntimeState,
  server: string,
  tool: string,
  input: Record<string, any>
): void {
  const fingerprint = buildActionFingerprint(server, tool, input)
  if (fingerprint === state.lastActionFingerprint) {
    state.repeatActionCount += 1
  } else {
    state.repeatActionCount = 1
    state.lastActionFingerprint = fingerprint
  }
}

function updateRuntimeStateAfterResult(
  state: AgentRuntimeState,
  server: string,
  tool: string,
  input: Record<string, any>,
  mcpText: string
): void {
  const compact = normalizeCompactText(mcpText)
  const currentUrl = extractCurrentUrlFromMcpText(mcpText)
  if (currentUrl) {
    state.currentUrl = currentUrl
  }
  if (state.targetUrl && state.currentUrl && state.currentUrl.includes(normalizeCompactText(state.targetUrl))) {
    state.openedTargetUrl = true
  }
  if (tool === 'take_snapshot') {
    state.hasSnapshot = /Latestpagesnapshot/i.test(compact) || /RootWebArea/i.test(compact)
    state.selectedPageClosed = /selectedpagehasbeenclosed/i.test(compact)
  } else {
    state.selectedPageClosed = /selectedpagehasbeenclosed/i.test(compact)
  }

  const inputText = normalizeCompactText(JSON.stringify(input || {})).toLowerCase()
  if (server === 'chrome-devtools' && ['fill', 'type_text', 'evaluate_script'].includes(tool)) {
    if (inputText.includes('minimonkey') || inputText.includes('wd=') || inputText.includes('%e6%8a%96')) {
      state.inputFilled = true
    }
  }

  if (server === 'chrome-devtools') {
    if (tool === 'press_key' && String(input?.key || '').toLowerCase() === 'enter') {
      state.submitted = true
    }
    if (tool === 'evaluate_script' && /form\.submit\(\)|location\.href|window\.open|search/i.test(String(input?.function || ''))) {
      state.submitted = true
    }
  }

  if (/[\?&]wd=/i.test(state.currentUrl) || /\/s\?/i.test(state.currentUrl)) {
    state.submitted = true
  }

  state.lastToolResultText = String(mcpText || '')
}

function buildRuntimeStateHint(state: AgentRuntimeState): string {
  return [
    '执行状态（由系统维护，必须遵守）：',
    `- targetUrl: ${state.targetUrl || 'unknown'}`,
    `- currentUrl: ${state.currentUrl || 'unknown'}`,
    `- openedTargetUrl: ${state.openedTargetUrl}`,
    `- hasSnapshot: ${state.hasSnapshot}`,
    `- selectedPageClosed: ${state.selectedPageClosed}`,
    `- inputFilled: ${state.inputFilled}`,
    `- submitted: ${state.submitted}`,
    `- repeatActionCount: ${state.repeatActionCount}`,
    `- stagnationTurns: ${state.stagnationTurns}`,
    '',
    '决策约束：',
    '1. openedTargetUrl=true 时，禁止重复 new_page/navigate_page 到同一 URL。',
    '2. hasSnapshot=true 且页面未变化时，禁止连续再次 take_snapshot。',
    '3. 允许直接用 evaluate_script 完成输入与提交，避免无效循环。',
    '4. selectedPageClosed=true 时，先 list_pages，再 select_page，再继续。',
    '5. 仅当 submitted=true 或已确认任务目标达成时，才输出 done。'
  ].join('\n')
}

function parsePageIndexes(text: string): number[] {
  const indexes = new Set<number>()
  const raw = String(text || '')
  const regex = /\b(\d+)\s*:/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 0) {
      indexes.add(value)
    }
  }
  return Array.from(indexes).sort((a, b) => a - b)
}

function buildSelectPagePayloads(
  requiredFields: string[],
  pageIndex: number
): Array<Record<string, any>> {
  const payloads: Array<Record<string, any>> = []
  if (requiredFields.length > 0) {
    const requiredPayload: Record<string, any> = {}
    for (const field of requiredFields) {
      const key = String(field || '')
      const lower = key.toLowerCase()
      if (lower.includes('id')) {
        requiredPayload[key] = String(pageIndex)
      } else {
        requiredPayload[key] = pageIndex
      }
    }
    payloads.push(requiredPayload)
  }
  payloads.push(
    { pageIdx: pageIndex },
    { pageIndex: pageIndex },
    { index: pageIndex },
    { idx: pageIndex },
    { page: pageIndex },
    { id: String(pageIndex) },
    { pageId: String(pageIndex) },
    { page_id: String(pageIndex) }
  )
  const seen = new Set<string>()
  const unique: Array<Record<string, any>> = []
  for (const payload of payloads) {
    const key = JSON.stringify(payload)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(payload)
    }
  }
  return unique
}

async function recoverClosedChromePage(
  mcpToolsMap: Record<string, Array<{ name: string; inputSchema?: Record<string, unknown> }>>
): Promise<{ ok: boolean; detail: string }> {
  const listResult = await callMcpTool('chrome-devtools', 'list_pages', {})
  if (!listResult?.ok) {
    return { ok: false, detail: `list_pages 失败：${String(listResult?.error || '未知错误')}` }
  }

  const listText = String(listResult.result || '')
  const pageIndexes = parsePageIndexes(listText)
  if (pageIndexes.length === 0) {
    return { ok: false, detail: 'list_pages 未返回可选页面索引' }
  }

  const chromeTools = mcpToolsMap['chrome-devtools'] || []
  const selectPageTool = chromeTools.find((t) => t.name === 'select_page')
  const selectSchema =
    selectPageTool?.inputSchema && typeof selectPageTool.inputSchema === 'object'
      ? selectPageTool.inputSchema as { required?: unknown[] }
      : { required: [] as unknown[] }
  const requiredFields = Array.isArray(selectSchema.required)
    ? selectSchema.required.map((v: unknown) => String(v)).filter(Boolean)
    : []

  const candidateIndexes = [...pageIndexes].reverse()
  for (const pageIndex of candidateIndexes) {
    const payloads = buildSelectPagePayloads(requiredFields, pageIndex)
    for (const payload of payloads) {
      const selectResult = await callMcpTool('chrome-devtools', 'select_page', payload)
      if (selectResult?.ok) {
        const resultText = String(selectResult.result || '')
        if (!/^MCP error\b/i.test(resultText)) {
          return {
            ok: true,
            detail: `已自动恢复页面选择：select_page(${JSON.stringify(payload)})`
          }
        }
      }
    }
  }

  return { ok: false, detail: 'select_page 自动恢复失败（参数不匹配或页面不可选）' }
}

function buildChromeSelectorFallback(
  tool: string,
  input: Record<string, any>
): { tool: string; input: Record<string, any>; reason: string } | null {
  const selector = String(input?.selector || '').trim()
  if (!selector) return null

  if (tool === 'click' && !input?.uid) {
    const script = `() => {
  const selector = ${JSON.stringify(selector)};
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found for selector: ' + selector);
  el.click();
  return { ok: true, action: 'click', selector };
}`
    return {
      tool: 'evaluate_script',
      input: { function: script },
      reason: 'click 缺少 uid，使用 selector 兜底执行'
    }
  }

  if (tool === 'fill' && !input?.uid) {
    const value = String(input?.value ?? input?.text ?? '')
    const script = `() => {
  const selector = ${JSON.stringify(selector)};
  const value = ${JSON.stringify(value)};
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found for selector: ' + selector);
  if (!('value' in el)) throw new Error('Element has no value property: ' + selector);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, action: 'fill', selector, valueLength: value.length };
}`
    return {
      tool: 'evaluate_script',
      input: { function: script },
      reason: 'fill 缺少 uid，使用 selector 兜底执行'
    }
  }

  return null
}

function parsePlannerOutput(reply: string): PlannerOutput | null {
  const text = String(reply || '').trim()
  if (!text) return null

  const candidates: string[] = [text]
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    candidates.unshift(String(fenced[1]).trim())
  }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object') continue
      if (!parsed.analysis || !Array.isArray(parsed.steps)) continue
      return parsed as PlannerOutput
    } catch {
      // try next candidate
    }
  }

  return null
}

function sanitizePlannerStep(step: unknown): PlannerStep {
  const s = step as Record<string, unknown> | null
  return {
    id: String(s?.id || `step_${Date.now()}`),
    title: String(s?.title || '未命名步骤'),
    description: String(s?.description || ''),
    input: String(s?.input || ''),
    output: String(s?.output || ''),
    depends_on: Array.isArray(s?.depends_on) ? (s.depends_on as unknown[]).map((v: unknown) => String(v)) : [],
    tool: String(s?.tool || ''),
    status: s?.status as PlannerStep['status'],
    priority: s?.priority as PlannerStep['priority'],
    retry: s?.retry && typeof s.retry === 'object'
      ? {
          max: Number((s.retry as Record<string, unknown>)?.max || 0),
          backoff_ms: Number((s.retry as Record<string, unknown>)?.backoff_ms || 0)
        }
      : undefined,
    timeout_ms: s?.timeout_ms != null ? Number(s.timeout_ms) : undefined,
    success_criteria: s?.success_criteria ? String(s.success_criteria) : undefined,
    artifacts: Array.isArray(s?.artifacts) ? (s.artifacts as unknown[]).map((v: unknown) => String(v)) : undefined,
    logs: Array.isArray(s?.logs) ? (s.logs as unknown[]).map((v: unknown) => String(v)) : undefined,
    tool_call: s?.tool_call && typeof s.tool_call === 'object'
      ? {
          server: String((s.tool_call as Record<string, unknown>)?.server || ''),
          tool: String((s.tool_call as Record<string, unknown>)?.tool || ''),
          args: (s.tool_call as Record<string, unknown>)?.args && typeof (s.tool_call as Record<string, unknown>).args === 'object' 
            ? (s.tool_call as Record<string, unknown>).args as Record<string, unknown> 
            : {}
        }
      : undefined,
    expected_result: s?.expected_result ? String(s.expected_result) : undefined,
    fallback: s?.fallback ? String(s.fallback) : undefined,
    requires_confirmation: s?.requires_confirmation === true,
    side_effects: Array.isArray(s?.side_effects) ? (s.side_effects as unknown[]).map((v: unknown) => String(v)) : undefined,
    rollback: s?.rollback ? String(s.rollback) : undefined
  }
}

function sanitizeStepTitle(raw: string): string {
  return String(raw || '')
    .replace(/^[\s>*-]+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .trim()
}

function parseMcpCalls(reply: string): Array<{ server: string; tool: string; args: Record<string, any>; title?: string }> {
  const calls: Array<{ server: string; tool: string; args: Record<string, any>; title?: string }> = []
  const regex = /```mcp:\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(reply)) !== null) {
    try {
      const parsed = JSON.parse(String(match[1] || '').trim())
      const server = String(parsed?.server || '').trim()
      const tool = String(parsed?.tool || '').trim()
      const args = parsed?.args && typeof parsed.args === 'object' ? parsed.args : {}
      if (!server || !tool) continue
      const prefix = reply.slice(0, match.index)
      const lines = prefix
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const candidate = lines.length > 0 ? sanitizeStepTitle(lines[lines.length - 1]) : ''
      const title = candidate && !candidate.startsWith('```') ? candidate : undefined
      calls.push({ server, tool, args, title })
    } catch {
      // 忽略无效片段，由后续逻辑统一提示
    }
  }

  return calls
}

function buildMcpPlanTitle(call: { server: string; tool: string; args: Record<string, any>; title?: string }): string {
  if (call.title && call.title.trim()) {
    return call.title.trim()
  }
  return `${call.server}/${call.tool}`
}

// 流式处理聊天请求
export async function* handleChatStream(
  message: string,
  options: ChatStreamOptions = {},
  conversationHistory?: Array<{ role: string; text: string }>
): AsyncGenerator<StreamChunk> {
  if (!message) {
    yield { type: 'error', error: '缺少 message 参数' }
    return
  }

  const taskId = randomUUID()
  let stepSeq = 0
  let accumulatedUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
  const abortSignal = options.signal

  const openStep = (title: string) => {
    stepSeq += 1
    const stepId = `step_${stepSeq}`
    return { stepId, title }
  }

  const callModel = async (...args: Parameters<typeof requestModelReply>): Promise<LlmResponse> => {
    const result = await requestModelReply(...args)
    if (result.usage) {
      if (!accumulatedUsage) {
        accumulatedUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }
      accumulatedUsage.promptTokens += result.usage.promptTokens
      accumulatedUsage.completionTokens += result.usage.completionTokens
      accumulatedUsage.totalTokens += result.usage.totalTokens
    }
    return result
  }

  yield buildTaskEvent(taskId, 'pending')
  yield buildTaskEvent(taskId, 'running')

  try {
    throwIfAborted(abortSignal)
    const configService = getConfigService()
    const config = await configService.getConfig()
    // 合并 config.skills（自定义技能）与 skillRegistry（已安装的市场技能）
    const installedSkills: SkillConfig[] = skillRegistry.getAllSkills().map(s => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      category: (s.category || 'custom') as any,
      tags: [],
      triggerPhrases: [],
      delayMs: 0,
      steps: []
    }))
    const configSkillIds = new Set((config.skills || []).map((s: SkillConfig) => s.id))
    const skills: SkillConfig[] = [...(config.skills || []), ...installedSkills.filter(s => !configSkillIds.has(s.id))]

    // 获取当前激活的模型（支持前端传入 model 优先）
    const activeModelId = config.settings?.activeModelId
    let activeModel = null

    const requestedModel = String(options.model || '').trim()
    if (requestedModel && config.models?.length) {
      activeModel = config.models.find(model =>
        model.id === requestedModel || model.modelName === requestedModel
      )
    }
    
    if (!activeModel && activeModelId && config.models) {
      activeModel = config.models.find(model => model.id === activeModelId)
    }
    
    if (!activeModel && config.models && config.models.length > 0) {
      activeModel = config.models[0]
    }
    
    if (!activeModel) {
      yield { type: 'reply', reply: '聊天 AI 未配置。请在设置中添加并激活一个大模型。' }
      yield buildTaskEvent(taskId, 'error', { error: 'active model not found' })
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    // 获取加密服务
    const encryptionService = getEncryptionService()
    const apiKeyResult = resolveApiKey(activeModel, encryptionService)
    if (!apiKeyResult.apiKey) {
      yield { type: 'reply', reply: apiKeyResult.error || '模型 API Key 未配置。请在设置中完善模型配置。' }
      yield buildTaskEvent(taskId, 'error', { error: apiKeyResult.error || 'api key missing' })
      yield { type: 'done', usage: accumulatedUsage }
      return
    }
    const apiKey = apiKeyResult.apiKey
    const { apiBaseUrl, modelName } = resolveModelRuntime(activeModel, config)

    const rawMcpToolsMap = (await getMcpTools()) as Record<string, Array<{ name: string; inputSchema?: Record<string, unknown> }>>
    const allowedMcpServers = Array.isArray(options.allowedMcpServers)
      ? options.allowedMcpServers.map(v => String(v || '').trim()).filter(Boolean)
      : null
    const allowedMcpSet = allowedMcpServers && allowedMcpServers.length > 0 ? new Set(allowedMcpServers) : null
    const mcpToolsMap = allowedMcpSet
      ? Object.fromEntries(Object.entries(rawMcpToolsMap).filter(([serverId]) => allowedMcpSet.has(serverId)))
      : rawMcpToolsMap
    const initStep = openStep('初始化运行环境')
    yield buildTaskEvent(taskId, 'running', { stepId: initStep.stepId, stepStatus: 'running', title: initStep.title })
    yield buildDetail('init', '已加载模型与 MCP 工具清单')
    yield buildTaskEvent(taskId, 'running', { stepId: initStep.stepId, stepStatus: 'done', title: initStep.title })
    const mcpToolsDesc = Object.entries(mcpToolsMap).map(([serverId, tools]) => {
      const toolHints = (tools || []).map((tool) => formatMcpToolHint(tool)).filter(Boolean)
      return toolHints.length ? `- ${serverId}: ${toolHints.join(', ')}` : ''
    }).filter(Boolean).join('\n')

    const builtinToolsDesc = builtinTools.getToolDescriptions()
    const allToolsDesc = mcpToolsDesc + (builtinToolsDesc ? '\n' + builtinToolsDesc : '')

    const configActiveSkillIds: string[] = Array.isArray(config.settings?.activeSkillIds) ? config.settings.activeSkillIds : []
    const effectiveSkillIds = (options.selectedSkillIds && options.selectedSkillIds.length > 0)
      ? options.selectedSkillIds
      : (options.selectedSkillId ? [options.selectedSkillId] : configActiveSkillIds)

    const selectedSkills = effectiveSkillIds
      .map(id => skills.find(s => s.id === id))
      .filter(Boolean)

    const selectedSkillHint = selectedSkills.length > 0
      ? `\n用户在界面中选择了技能：${selectedSkills.map(s => `${s!.id}（${s!.name}）`).join('、')}。如果任务匹配这些技能，优先返回对应 skill 调用。`
      : ''

    const promptInstruction = String(options.promptInstruction || '').trim()
    const systemPrompt = buildAgentSystemPrompt(skills, allToolsDesc, selectedSkillHint, promptInstruction)
    const userContext = await buildUserContextPrompt()
    const finalSystemPrompt = userContext ? `${systemPrompt}\n\n${userContext}` : systemPrompt

    void logger.info('[AI] Chat stream started', {
      model: modelName,
      selectedSkillId: options.selectedSkillId || '',
      allowedMcpServers: allowedMcpServers || [],
      hasPromptInstruction: Boolean(promptInstruction),
      messageLength: String(message || '').length
    })

    // 步骤1: 解析用户请求
    const plan: SimpleStep[] = [
      { title: '解析用户请求', description: '理解用户意图并确定执行方案', completed: false, active: true },
      { title: '等待 AI 响应', description: '获取 AI 的执行计划', completed: false, active: false },
      { title: '执行操作', description: '调用相应的工具或技能', completed: false, active: false },
      { title: '返回结果', description: '整理并返回执行结果', completed: false, active: false }
    ]
    
    yield { type: 'plan', plan: [...plan] }
    yield buildDetail('plan', '正在解析用户请求并生成执行方案')

    const inferStep = openStep('模型推理')
    yield buildTaskEvent(taskId, 'running', { stepId: inferStep.stepId, stepStatus: 'running', title: inferStep.title })
    const llmResult = await callModel(apiBaseUrl, apiKey, modelName, finalSystemPrompt, message, conversationHistory, abortSignal, options.images, activeModel.maxTokens)
    const reply = llmResult.reply
    yield buildTaskEvent(taskId, 'running', { stepId: inferStep.stepId, stepStatus: 'done', title: inferStep.title })
    void logger.info('[AI] Initial reply received', {
      replyLength: String(reply || '').length
    })

    // 更新步骤1完成
    plan[0].completed = true
    plan[0].active = false
    plan[1].active = true
    yield { type: 'plan', plan: [...plan] }
    yield buildDetail('llm', '模型已返回响应，正在解析内容')

    // 更新步骤2完成
    plan[1].completed = true
    plan[1].active = false
    yield { type: 'plan', plan: [...plan] }

    // 优先处理 Agent JSON 结果
    let agentEnvelope = parseAgentEnvelope(reply)

    // 尝试从 AI 回复中提取文本内容
    let aiReplyText = ''
    if (agentEnvelope?.type === 'message' && agentEnvelope?.data?.content) {
      aiReplyText = String(agentEnvelope.data.content || '')
    } else if (!agentEnvelope && reply && reply.trim()) {
      aiReplyText = ensureReadableText(reply.trim())
    }

    if (!agentEnvelope) {
      yield* streamReplyChunks(formatReplyForUser(message, aiReplyText))
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    if (agentEnvelope.type === 'message') {
      yield* streamReplyChunks(formatReplyForUser(message, aiReplyText))
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    if (agentEnvelope.type === 'done') {
      yield* streamReplyChunks(formatReplyForUser(message, String(agentEnvelope.data?.result || '')))
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    if (agentEnvelope.type === 'error') {
      yield* streamReplyChunks(formatReplyForUser(message, String(agentEnvelope.data?.message || '发生错误')))
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    if (agentEnvelope.type === 'action' || agentEnvelope.type === 'actions' || agentEnvelope.type === 'plan') {
      const availableServers = Object.keys(mcpToolsMap)
      let turn = 0
      const maxTurns = 16
      let lastToolResultText = ''
      let finalReplyText = ''
      const runtimeState = createInitialRuntimeState(message)

      while (turn < maxTurns) {
        turn += 1
        void logger.info('[AI] Agent turn', { turn, type: agentEnvelope.type })

        if (agentEnvelope.type === 'plan') {
          const steps = Array.isArray(agentEnvelope.data?.steps) ? agentEnvelope.data.steps : []
          void logger.info('[AI] Agent plan', {
            turn,
            stepsCount: steps.length,
            steps: summarizeForLog(steps, 900)
          })
          if (steps.length > 0) {
            const execPlan: SimpleStep[] = steps.map((step: PlannerStep, index: number) => ({
              title: String(step?.id || `step_${index + 1}`),
              description: String(step?.description || '待执行'),
              completed: false,
              active: false
            }))
            yield { type: 'plan', plan: execPlan }
            yield buildDetail('plan', `已生成执行计划，共 ${steps.length} 步`)
          } else {
            yield buildDetail('plan', '已生成执行计划')
          }

          const nextReplyResult = await callModel(
            apiBaseUrl,
            apiKey,
            modelName,
            finalSystemPrompt,
            buildAgentFollowupPrompt(message, agentEnvelope, {
              toolResult: lastToolResultText,
              extra: `${buildRuntimeStateHint(runtimeState)}\n你已输出 plan，现在请执行第一步，输出 type="action"。`
            }),
            conversationHistory,
            abortSignal
          )
          const nextReply = nextReplyResult.reply
          const nextEnvelope = parseAgentEnvelope(nextReply)
          if (!nextEnvelope) {
            yield buildDetail('agent', '计划后续响应不是标准 JSON，终止自动执行')
            yield* streamReplyChunks(nextReply || 'Agent 后续响应为空')
            yield { type: 'done', usage: accumulatedUsage }
            return
          }
          agentEnvelope = nextEnvelope
          continue
        }

        if (agentEnvelope.type === 'actions') {
          const batchSteps: Array<{ tool: string; name: string; input: Record<string, any> }> =
            Array.isArray(agentEnvelope.data?.steps) ? agentEnvelope.data.steps : []
          void logger.info('[AI] Batch actions', { turn, count: batchSteps.length })
          const batchResults: string[] = []

          for (const step of batchSteps) {
            const batchInput = step.input && typeof step.input === 'object' ? { ...step.input } : {}
            // 优先用 "server/tool" 拼接形式解析，兼容 AI 分开返回 tool(server) 和 name(tool) 的格式
            const stepTool = String(step.tool || '').trim()
            const stepName = String(step.name || '').trim()
            const batchActionName = (stepTool && stepName && stepTool !== 'mcp' && stepTool !== 'builtin')
              ? `${stepTool}/${stepName}`
              : (stepName || stepTool)
            const batchTarget = resolveActionTarget(batchActionName, mcpToolsMap)
            if (!batchTarget) {
              batchResults.push(`无法解析工具：${batchActionName}`)
              continue
            }
            const { server: batchServer, tool: batchTool } = batchTarget
            yield buildDetail('tool', `[批量] 正在调用 ${batchServer}/${batchTool}...`)
            yield { type: 'mcp', mcp: { server: batchServer, tool: batchTool, status: 'start', input: batchInput, time: new Date().toISOString() } }
            const batchResult = await executeMcpToolWithPolicy(batchServer, batchTool, batchInput)
            const batchOk = !!batchResult?.ok
            yield { type: 'mcp', mcp: { server: batchServer, tool: batchTool, status: batchOk ? 'success' : 'error', error: batchOk ? undefined : String(batchResult?.error || ''), input: batchInput, time: new Date().toISOString() } }
            batchResults.push(batchOk ? String(batchResult?.result || '').trim() || '执行成功' : `失败：${batchResult?.error || ''}`)
            updateRuntimeStateAfterAction(runtimeState, batchServer, batchTool, batchInput)
            updateRuntimeStateAfterResult(runtimeState, batchServer, batchTool, batchInput, batchResults[batchResults.length - 1])
          }

          lastToolResultText = batchResults.join('\n---\n')
          const nextBatchResult = await callModel(
            apiBaseUrl, apiKey, modelName, finalSystemPrompt,
            buildAgentFollowupPrompt(message, agentEnvelope, {
              toolResult: lastToolResultText,
              extra: `${buildRuntimeStateHint(runtimeState)}\n批量步骤已全部执行完毕。如果任务未完成，继续输出下一步；若已完成，输出 type="done"。`
            }),
            conversationHistory, abortSignal
          )
          const nextBatchEnvelope = parseAgentEnvelope(nextBatchResult.reply)
          if (!nextBatchEnvelope) {
            yield* streamReplyChunks(ensureReadableText(lastToolResultText) || '批量执行完成')
            yield { type: 'done', usage: accumulatedUsage }
            return
          }
          agentEnvelope = nextBatchEnvelope
          continue
        }

        if (agentEnvelope.type === 'action') {
          let toolType = String(agentEnvelope.data?.tool || '').trim()
          let actionName = String(agentEnvelope.data?.name || '').trim()
          if (toolType.startsWith('builtin/')) {
            actionName = toolType.replace('builtin/', '')
            toolType = 'builtin'
          }
          if (actionName.startsWith('builtin/')) {
            actionName = actionName.replace('builtin/', '')
            toolType = 'builtin'
          }
          if (toolType.includes('/') && toolType !== 'mcp' && toolType !== 'builtin') {
            // toolType is already "server/tool" form — use it as actionName and normalize
            actionName = toolType
            toolType = 'mcp'
          }
          if (toolType === 'builtin' && actionName.includes('/')) {
            toolType = 'mcp'
          }
          if ((toolType === 'shell' || toolType === 'filesystem' || toolType === 'fetch' || toolType === 'memory' || toolType === 'chrome-devtools') && actionName) {
            toolType = 'mcp'
          }
          let actionInput: Record<string, any> = {}
          const rawInput = agentEnvelope.data?.input
          if (rawInput && typeof rawInput === 'object') {
            actionInput = { ...rawInput }
          } else if (typeof rawInput === 'string' && rawInput.trim()) {
            // AI 有时会把 input 双重 JSON 编码成字符串，尝试解析
            try { actionInput = JSON.parse(rawInput) } catch {
              const repaired = tryRepairJsonText(rawInput)
              if (repaired) {
                try { actionInput = JSON.parse(repaired) } catch {
                  const sanitized = sanitizeJson(repaired)
                  if (sanitized) {
                    try { actionInput = JSON.parse(sanitized) } catch { actionInput = {} }
                  } else {
                    actionInput = {}
                  }
                }
              } else {
                actionInput = {}
              }
            }
          }
          void logger.info('[AI] Agent action', {
            turn,
            toolType,
            actionName,
            input: summarizeForLog(actionInput, 800)
          })

          yield {
            type: 'reasoning',
            reasoning: {
              type: 'tool_selection',
              text: `基于任务需求，选择 ${toolType}/${actionName} 工具执行 ${actionInput.url || actionInput.command || actionInput.path || '操作'}`,
              confidence: 0.85
            }
          }

          if (toolType !== 'mcp' && toolType !== 'builtin') {
            yield* streamReplyChunks(`不支持的 action.tool：${toolType || 'unknown'}`)
            yield { type: 'done', usage: accumulatedUsage }
            return
          }

          if (toolType === 'builtin') {
            const builtinResult = await builtinTools.callTool(actionName, actionInput as Record<string, unknown>)
            if (builtinResult.success) {
              yield buildDetail('tool', `builtin/${actionName} 执行成功`)
              lastToolResultText = builtinResult.result || ''
              yield buildDetail('result', lastToolResultText)
            } else {
              yield buildDetail('tool', `builtin/${actionName} 执行失败`)
              lastToolResultText = builtinResult.error || '执行失败'
              yield buildDetail('error', lastToolResultText)
            }

            const nextBuiltinReply = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: `${buildRuntimeStateHint(runtimeState)}\n如果任务未完成，请继续输出下一步 type="action"；若已完成，输出 type="done"。`
              }),
              conversationHistory,
              abortSignal
            )
            const nextBuiltinEnvelope = parseAgentEnvelope(nextBuiltinReply.reply)
            if (!nextBuiltinEnvelope) {
              yield* streamReplyChunks(ensureReadableText(lastToolResultText) || '运行结束，已完成。')
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextBuiltinEnvelope
            continue
          } else {
            const target = resolveActionTarget(actionName, mcpToolsMap)
            if (!target) {
              yield* streamReplyChunks(`无法解析工具名：${actionName || 'unknown'}`)
              yield { type: 'done', usage: accumulatedUsage }
              return
            }

            const { server, tool } = target
            let effectiveTool = tool
            let effectiveInput = { ...actionInput }

          if (server === 'chrome-devtools' && (tool === 'new_page' || tool === 'navigate_page') && !effectiveInput.url) {
            const nextReplyResult = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: '上一步 action 缺少必需参数 url，请输出新的 type="action" 并补齐 data.input.url。'
              }),
              conversationHistory,
              abortSignal
            )
            const nextReply = nextReplyResult.reply
            const nextEnvelope = parseAgentEnvelope(nextReply)
            if (!nextEnvelope) {
              yield* streamReplyChunks('action 缺少 url，且模型未返回合法 JSON')
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelope
            continue
          }

          if (server === 'chrome-devtools') {
            const fallback = buildChromeSelectorFallback(tool, effectiveInput)
            if (fallback) {
              effectiveTool = fallback.tool
              effectiveInput = fallback.input
              void logger.info('[AI] Action input fallback applied', {
                turn,
                server,
                originalTool: tool,
                fallbackTool: effectiveTool,
                reason: fallback.reason
              })
              yield buildDetail('mcp', fallback.reason)
            }
            // select_page 的 pageId 必须是 number，AI 有时传字符串
            if (effectiveTool === 'select_page' && typeof effectiveInput.pageId === 'string') {
              const n = parseInt(effectiveInput.pageId, 10)
              if (!isNaN(n)) effectiveInput = { ...effectiveInput, pageId: n }
            }
            if (effectiveTool === 'select_page' && typeof effectiveInput.index === 'string') {
              const n = parseInt(effectiveInput.index, 10)
              if (!isNaN(n)) effectiveInput = { ...effectiveInput, index: n }
            }
          }

          const predictedFingerprint = buildActionFingerprint(server, effectiveTool, effectiveInput)
          const predictedRepeat = predictedFingerprint === runtimeState.lastActionFingerprint
            ? runtimeState.repeatActionCount + 1
            : 1

          if (
            server === 'chrome-devtools' &&
            ['new_page', 'navigate_page'].includes(effectiveTool) &&
            runtimeState.openedTargetUrl &&
            runtimeState.targetUrl &&
            normalizeCompactText(String(effectiveInput.url || '')).includes(normalizeCompactText(runtimeState.targetUrl))
          ) {
            const nextReplyResult2 = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: `${buildRuntimeStateHint(runtimeState)}\n你在重复打开同一页面。禁止再次 new_page/navigate_page 到相同 URL，请直接执行后续步骤。\n请只输出一个 JSON 对象，不要输出任何其他文字。示例：{"type":"action","data":{"tool":"mcp","name":"take_snapshot","input":{}}}`
              }),
              conversationHistory,
              abortSignal
            )
            const nextReply2 = nextReplyResult2.reply
            const nextEnvelope = parseAgentEnvelope(nextReply2)
            if (!nextEnvelope) {
              yield* streamReplyChunks('检测到重复开页且模型未返回合法 JSON')
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelope
            continue
          }

          if (
            server === 'chrome-devtools' &&
            effectiveTool === 'take_snapshot' &&
            runtimeState.hasSnapshot &&
            !runtimeState.selectedPageClosed &&
            predictedRepeat >= 2
          ) {
            const nextReplyResult3 = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: `${buildRuntimeStateHint(runtimeState)}\n你在重复 take_snapshot。禁止继续快照，请改为输入关键词并提交搜索。\n请只输出一个 JSON 对象，不要输出任何其他文字。示例：{"type":"action","data":{"tool":"mcp","name":"evaluate_script","input":{"function":"()=>document.title"}}}`
              }),
              conversationHistory,
              abortSignal
            )
            const nextReply3 = nextReplyResult3.reply
            const nextEnvelope = parseAgentEnvelope(nextReply3)
            if (!nextEnvelope) {
              yield* streamReplyChunks('检测到重复快照且模型未返回合法 JSON')
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelope
            continue
          }

          if (predictedRepeat >= 3) {
            const nextReplyResult4 = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: `${buildRuntimeStateHint(runtimeState)}\n你在重复同一 action。禁止再次输出相同 action，请输出下一步不同且可推进任务的 action。\n请只输出一个 JSON 对象，不要输出任何其他文字。示例：{"type":"action","data":{"tool":"mcp","name":"list_pages","input":{}}}`
              }),
              conversationHistory,
              abortSignal
            )
            const nextReply4 = nextReplyResult4.reply
            const nextEnvelope = parseAgentEnvelope(nextReply4)
            if (!nextEnvelope) {
              yield* streamReplyChunks('检测到重复 action 且模型未返回合法 JSON')
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelope
            continue
          }

          void logger.info('[AI] Resolved action target', { actionName, server, effectiveTool })

          updateRuntimeStateAfterAction(runtimeState, server, effectiveTool, effectiveInput)

          if (!availableServers.includes(server)) {
            void logger.warn('[AI] Server not in available list', { server, availableServers })
            const nextReplyResultServer = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: `MCP 服务器 "${server}" 当前不可用（可用服务器：${availableServers.length ? availableServers.join(', ') : '无'}）。请输出 type="message" 直接回答用户，告知暂时无法使用该工具；或使用其他可用工具。`
              }),
              conversationHistory,
              abortSignal
            )
            const nextReplyServer = nextReplyResultServer.reply
            const nextEnvelopeServer = parseAgentEnvelope(nextReplyServer)
            if (!nextEnvelopeServer) {
              yield* streamReplyChunks(`MCP 服务器 "${server}" 当前不可用`)
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelopeServer
            continue
          }
          const tools = mcpToolsMap[server] || []
          const availableToolNames = tools.map(t => t.name)
          if (!tools.find(t => t.name === effectiveTool)) {
            void logger.warn('[AI] Tool not found in server', { server, effectiveTool, availableTools: availableToolNames })
            const nextReplyResultTool = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                extra: `工具 "${effectiveTool}" 在服务器 "${server}" 上不存在。可用工具：${availableToolNames.join(', ')}。请使用正确的工具名重新输出 type="action"。`
              }),
              conversationHistory,
              abortSignal
            )
            const nextReplyTool = nextReplyResultTool.reply
            const nextEnvelopeTool = parseAgentEnvelope(nextReplyTool)
            if (!nextEnvelopeTool) {
              yield* streamReplyChunks(`工具 "${effectiveTool}" 不存在`)
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelopeTool
            continue
          }

          if (options.executionMode === 'manual') {
            void logger.info('[AI] Action requires manual confirmation', {
              turn,
              server,
              tool,
              args: summarizeForLog(actionInput, 800)
            })
            yield {
              type: 'confirm',
              confirm: {
                server,
                tool: effectiveTool,
                args: effectiveInput,
                message: `待确认执行：${server}/${effectiveTool}`
              }
            }
            yield buildDetail('confirm', `等待用户确认执行 ${server}/${effectiveTool}`)
            yield { type: 'done', usage: accumulatedUsage }
            return
          }

          void logger.info('[AI] MCP call start', {
            turn,
            server,
            tool: effectiveTool,
            args: summarizeForLog(effectiveInput, 800)
          })
          const progressMsg = buildToolProgressMessage(server, effectiveTool, effectiveInput)
          if (!isSilentTool(server, effectiveTool)) {
            yield buildDetail('tool', progressMsg)
            yield {
              type: 'mcp',
              mcp: {
                server,
                tool: effectiveTool,
                status: 'start',
                input: effectiveInput,
                time: new Date().toISOString()
              }
            }
          }
          const mcpStep = openStep(`MCP ${server}/${effectiveTool}`)
          yield buildTaskEvent(taskId, 'waiting_tool', {
            stepId: mcpStep.stepId,
            stepStatus: 'running',
            title: mcpStep.title
          })

          const result = await executeMcpToolWithPolicy(server, effectiveTool, effectiveInput)
          const rawResultText = String(result?.result || result?.error || '').trim()

          // 导航类工具：成功/超时/frame detached 都视为正常导航，直接结束
          const isNavTool = server === 'chrome-devtools' && (effectiveTool === 'new_page' || effectiveTool === 'navigate_page')
          const isNavTimeout = isNavTool && /Navigation timeout|Navigating frame was detached/i.test(rawResultText)
          // new_page 返回 "## Pages ..." 表示已成功打开
          const isNavSuccess = isNavTool && result?.ok && /##\s*Pages/i.test(rawResultText)

          if (isNavTimeout || isNavSuccess) {
            const targetUrl = String(effectiveInput.url || runtimeState.targetUrl || '')
            const doneText = targetUrl ? `已打开 ${targetUrl}` : '页面已打开'
            void logger.info('[AI] Navigation complete', { turn, server, tool: effectiveTool, url: targetUrl, reason: isNavTimeout ? 'timeout(normal)' : 'pages-listed' })
            yield buildTaskEvent(taskId, 'running', { stepId: mcpStep.stepId, stepStatus: 'done', title: mcpStep.title })
            yield { type: 'mcp', mcp: { server, tool: effectiveTool, status: 'success', time: new Date().toISOString(), input: effectiveInput } }
            yield* streamReplyChunks(doneText)
            yield { type: 'done', usage: accumulatedUsage }
            return
          }

          const inferredScriptError = /Unexpected token|SyntaxError|ReferenceError|TypeError/i.test(rawResultText)
          const inferredClosedPageError = /selected\s*page\s*has\s*been\s*closed/i.test(rawResultText)
          const inferredMcpError = !result?.ok
            ? String(result?.error || '调用失败')
            : ((/^MCP error\b/i.test(rawResultText) || inferredScriptError || inferredClosedPageError) ? rawResultText : '')
          const mcpOk = !inferredMcpError
          void logger.info('[AI] MCP call finish', {
            turn,
            server,
            tool: effectiveTool,
            ok: mcpOk,
            error: mcpOk ? undefined : inferredMcpError,
            retries: Math.max(0, Number((result as McpCallResult)?.attempts || 1) - 1),
            result: summarizeForLog(result?.result, 900)
          })
          yield buildTaskEvent(taskId, mcpOk ? 'running' : 'error', {
            stepId: mcpStep.stepId,
            stepStatus: mcpOk ? 'done' : 'error',
            title: mcpStep.title,
            error: mcpOk ? undefined : inferredMcpError,
            retries: Math.max(0, Number((result as McpCallResult)?.attempts || 1) - 1)
          })

          const mcpStartTime = Date.now()
          if (!isSilentTool(server, effectiveTool)) {
            yield {
              type: 'mcp',
              mcp: {
                server,
                tool: effectiveTool,
                status: mcpOk ? 'success' : 'error',
                error: mcpOk ? undefined : inferredMcpError,
                time: new Date().toISOString(),
                duration: Date.now() - mcpStartTime,
                input: effectiveInput,
                result: mcpOk ? summarizeForLog(result?.result, 200) : undefined,
                confidence: mcpOk ? 0.95 : 0,
                causalChain: buildCausalChain(server, effectiveTool, effectiveInput, result)
              }
            }
          }

          const displayReply = buildMcpDisplayReply(server, tool, result)
          lastToolResultText = displayReply || String(result?.result || '')
          const beforeState = snapshotRuntimeState(runtimeState)
          updateRuntimeStateAfterResult(runtimeState, server, effectiveTool, effectiveInput, rawResultText || displayReply || '')
          const afterState = snapshotRuntimeState(runtimeState)
          runtimeState.stagnationTurns = beforeState === afterState ? runtimeState.stagnationTurns + 1 : 0

          if (runtimeState.selectedPageClosed) {
            const recovered = await recoverClosedChromePage(mcpToolsMap)
            void logger.info('[AI] Closed page recovery', {
              turn,
              recovered: recovered.ok,
              detail: recovered.detail
            })
            if (recovered.ok) {
              runtimeState.selectedPageClosed = false
              runtimeState.hasSnapshot = false
              runtimeState.stagnationTurns = 0
              lastToolResultText = recovered.detail
              const nextReplyResult5 = await callModel(
                apiBaseUrl,
                apiKey,
                modelName,
                finalSystemPrompt,
                buildAgentFollowupPrompt(message, agentEnvelope, {
                  toolResult: lastToolResultText,
                  extra: `${buildRuntimeStateHint(runtimeState)}\n页面已恢复，禁止重复开新页，请直接继续下一步。`
                }),
                conversationHistory,
                abortSignal
              )
              const nextReply5 = nextReplyResult5.reply
              const nextEnvelope = parseAgentEnvelope(nextReply5)
              if (!nextEnvelope) {
                yield* streamReplyChunks(ensureReadableText(lastToolResultText))
                yield { type: 'done', usage: accumulatedUsage }
                return
              }
              agentEnvelope = nextEnvelope
              continue
            }
            lastToolResultText = `${lastToolResultText || '页面状态异常'}；自动恢复失败：${recovered.detail}`
          }

          if (!mcpOk) {
            const nextReplyResult6 = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                server,
                extra: `${buildRuntimeStateHint(runtimeState)}\n上一步工具调用失败。请根据错误修正参数并继续输出 type="action"；若无法继续，请输出 type="error"。`
              }),
              conversationHistory,
              abortSignal
            )
            const nextReply6 = nextReplyResult6.reply
            const nextEnvelope = parseAgentEnvelope(nextReply6)
            if (!nextEnvelope) {
              yield* streamReplyChunks(formatReplyForUser(message, ensureReadableText(lastToolResultText) || `调用失败：${server}/${tool}`))
              yield { type: 'done', usage: accumulatedUsage }
              return
            }
            agentEnvelope = nextEnvelope
            continue
          }

          const nextReplyResult7 = await callModel(
              apiBaseUrl,
              apiKey,
              modelName,
              finalSystemPrompt,
              buildAgentFollowupPrompt(message, agentEnvelope, {
                toolResult: lastToolResultText,
                server,
                extra: `${buildRuntimeStateHint(runtimeState)}\n如果任务未完成，请继续输出下一步 type="action"；若已完成，输出 type="done"。`
              }),
            conversationHistory,
            abortSignal
          )
          const nextReply7 = nextReplyResult7.reply
          const nextEnvelope = parseAgentEnvelope(nextReply7)
          if (!nextEnvelope) {
            yield* streamReplyChunks(formatReplyForUser(message, ensureReadableText(lastToolResultText) || '运行结束，已完成。'))
            yield { type: 'done', usage: accumulatedUsage }
            return
          }
          agentEnvelope = nextEnvelope
          continue
            }
          }

        if (agentEnvelope.type === 'message') {
          const text = ensureReadableText(getAgentMessageText(agentEnvelope.data))
          void logger.info('[AI] Agent message', {
            turn,
            text: summarizeForLog(text, 700)
          })
          if (text) {
            yield* streamReplyChunks(formatReplyForUser(message, text))
          }
          yield { type: 'done', usage: accumulatedUsage }
          return
        }

        if (agentEnvelope.type === 'done') {
          const rawText = getAgentMessageText(agentEnvelope.data) || finalReplyText || lastToolResultText || '运行结束，已完成。'
          const text = ensureReadableText(rawText)
          void logger.info('[AI] Agent done', {
            turn,
            text: summarizeForLog(text, 700)
          })
          if (text) {
            yield* streamReplyChunks(formatReplyForUser(message, text))
          }
          await storeConversationTurn(message, text, conversationHistory || [])
          await extractAndStoreUserInfo(message, text, conversationHistory || [])
          yield { type: 'done', usage: accumulatedUsage }
          return
        }

        if (agentEnvelope.type === 'error') {
          const text = getAgentMessageText(agentEnvelope.data) || '任务执行失败'
          void logger.warn('[AI] Agent error', {
            turn,
            text: summarizeForLog(text, 700)
          })
          yield* streamReplyChunks(text)
          yield { type: 'done', usage: accumulatedUsage }
          return
        }
      }

      void logger.warn('[AI] Agent reached max turns', { maxTurns })
      yield buildDetail('agent', '达到最大自动执行轮次，已停止继续调用')
      if (lastToolResultText) {
        yield* streamReplyChunks(formatReplyForUser(message, ensureReadableText(lastToolResultText)))
      }
      await storeConversationTurn(message, lastToolResultText || '', conversationHistory || [])
      await extractAndStoreUserInfo(message, lastToolResultText || '', conversationHistory || [])
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    // 优先处理 Planner JSON 结果（兼容旧格式）
    const plannerOutput = parsePlannerOutput(reply)
    if (plannerOutput) {
      const normalizedSteps = Array.isArray(plannerOutput.steps)
        ? plannerOutput.steps.map((step) => sanitizePlannerStep(step))
        : []

      if (!plannerOutput.ok) {
        const risks = Array.isArray(plannerOutput.analysis?.risks) ? plannerOutput.analysis.risks : []
        const riskText = risks.length > 0 ? risks.join('；') : '规划失败'
        yield* streamReplyChunks(`规划失败：${riskText}`)
        yield { type: 'done', usage: accumulatedUsage }
        return
      }

      if (normalizedSteps.length > 0) {
        const byId = new Map(normalizedSteps.map((step) => [step.id, step]))
        const orderedSteps = Array.isArray(plannerOutput.execution_order) && plannerOutput.execution_order.length > 0
          ? plannerOutput.execution_order
              .map((id) => byId.get(String(id)))
              .filter((step): step is PlannerStep => Boolean(step))
          : normalizedSteps

        const availableServers = Object.keys(mcpToolsMap)
        const collectedReplies: string[] = []
        const execPlan: SimpleStep[] = orderedSteps.map((step) => ({
          title: step.title || step.id,
          description: step.description || '待执行',
          completed: false,
          active: false
        }))
        yield { type: 'plan', plan: [...execPlan] }

        for (let i = 0; i < orderedSteps.length; i++) {
          const step = orderedSteps[i]
          execPlan[i].active = true
          execPlan[i].description = `正在执行：${step.title || step.id}`
          yield { type: 'plan', plan: [...execPlan] }
          yield { type: 'step', step: { status: 'start', text: sanitizeStepTitle(step.description || step.title || step.id) } }

          // MCP 步骤
          if (step.tool === 'mcp' && step.tool_call?.server && step.tool_call?.tool) {
            const { server, tool, args = {} } = step.tool_call

            if (!availableServers.includes(server)) {
              execPlan[i].active = false
              execPlan[i].description = `执行失败：未知 MCP 服务器 ${server}`
              yield { type: 'plan', plan: [...execPlan] }
              yield { type: 'step', step: { status: 'error', text: sanitizeStepTitle(step.description || step.title || step.id) } }
              yield* streamReplyChunks(`未知 MCP server: ${server}`)
              yield { type: 'done', usage: accumulatedUsage }
              return
            }

            const tools = mcpToolsMap[server] || []
            if (!tools.find(t => t.name === tool)) {
              execPlan[i].active = false
              execPlan[i].description = `执行失败：未知工具 ${server}/${tool}`
              yield { type: 'plan', plan: [...execPlan] }
              yield { type: 'step', step: { status: 'error', text: sanitizeStepTitle(step.description || step.title || step.id) } }
              yield* streamReplyChunks(`未知工具: ${tool}`)
              yield { type: 'done', usage: accumulatedUsage }
              return
            }

            yield {
              type: 'mcp',
              mcp: {
                server,
                tool,
                status: 'start',
                input: args,
                time: new Date().toISOString()
              }
            }

            void logger.info('[AI][LegacyPlanner] MCP call start', { server, tool, args: summarizeForLog(args, 800) })
            const mcpStep = openStep(`MCP ${server}/${tool}`)
            yield buildTaskEvent(taskId, 'waiting_tool', {
              stepId: mcpStep.stepId,
              stepStatus: 'running',
              title: mcpStep.title
            })
            const result = await executeMcpToolWithPolicy(server, tool, args)
            void logger.info('[AI][LegacyPlanner] MCP call finish', {
              server,
              tool,
              ok: Boolean(result.ok),
              error: result.ok ? undefined : String(result.error || ''),
              result: summarizeForLog(result?.result, 900)
            })

            yield {
              type: 'mcp',
              mcp: {
                server,
                tool,
                status: result.ok ? 'success' : 'error',
                error: result.ok ? undefined : String(result.error || '调用失败'),
                time: new Date().toISOString()
              }
            }
            yield buildTaskEvent(taskId, result.ok ? 'running' : 'error', {
              stepId: mcpStep.stepId,
              stepStatus: result.ok ? 'done' : 'error',
              title: mcpStep.title,
              error: result.ok ? undefined : String(result.error || '调用失败'),
              retries: Math.max(0, Number((result as McpCallResult)?.attempts || 1) - 1)
            })

            if (!result.ok) {
              execPlan[i].active = false
              execPlan[i].description = `执行失败：${String(result.error || `${server}/${tool}`)}`
              yield { type: 'plan', plan: [...execPlan] }
              yield { type: 'step', step: { status: 'error', text: sanitizeStepTitle(step.description || step.title || step.id) } }
              yield* streamReplyChunks(`调用失败：${result.error || `${server}/${tool}`}`)
              yield { type: 'done', usage: accumulatedUsage }
              return
            }

            const displayReply = buildMcpDisplayReply(server, tool, result)
            if (displayReply && displayReply !== '运行结束，已完成。') {
              collectedReplies.push(displayReply)
            }
          } else if (step.tool === 'reply') {
            if (step.output) {
              collectedReplies.push(step.output)
            } else if (step.expected_result) {
              collectedReplies.push(step.expected_result)
            }
          } else {
            // 未知/非执行型步骤，按完成处理
            if (step.expected_result) {
              collectedReplies.push(step.expected_result)
            }
          }

          execPlan[i].active = false
          execPlan[i].completed = true
          execPlan[i].description = `已经执行了命令：${step.title || step.id}`
          yield { type: 'plan', plan: [...execPlan] }
          yield { type: 'step', step: { status: 'done', text: sanitizeStepTitle(step.description || step.title || step.id) } }
        }

        if (collectedReplies.length > 0) {
          yield* streamReplyChunks(collectedReplies.join('\n\n'))
        } else {
          yield* streamReplyChunks(`运行结束，已按计划完成 ${orderedSteps.length} 项操作。`)
        }
        yield { type: 'done', usage: accumulatedUsage }
        return
      }
    }

    // 处理 skill 匹配
    const skillMatch = reply.match(/```skill:\s*([\s\S]*?)```/)
    if (skillMatch) {
      const skillId = skillMatch[1].trim()
      const skill = skills.find(s => s.id === skillId)

      if (!skill) {
        yield buildDetail('skill', `技能不存在：${skillId}`)
        yield* streamReplyChunks(`技能不存在：${skillId}`)
        yield { type: 'done', usage: accumulatedUsage }
        return
      }

      plan[2].title = `执行技能：${skill.name}`
      plan[2].active = true
      yield { type: 'plan', plan: [...plan] }
      yield buildDetail('skill', `匹配技能：${skill.name}`)
      
      plan[2].completed = true
      plan[3].completed = true
      yield { type: 'plan', plan: [...plan] }
      
      yield* streamReplyChunks(`执行技能：${skill.name}`)
      yield { type: 'done', usage: accumulatedUsage }
      return
    }

    // 处理 MCP 匹配（支持多步）
    const mcpCalls = parseMcpCalls(reply)

    if (mcpCalls.length > 0) {
      try {
        const availableServers = Object.keys(mcpToolsMap)
        const totalSteps = mcpCalls.length
        const collectedReplies: string[] = []

        // 用 AI 返回的 MCP 调用列表构建执行计划列表
        const execPlan = mcpCalls.map((call) => ({
          title: buildMcpPlanTitle(call),
          description: '待执行',
          completed: false,
          active: false
        }))
        yield { type: 'plan', plan: [...execPlan] }

        for (let i = 0; i < mcpCalls.length; i++) {
          const current = mcpCalls[i]
          const { server, tool, args } = current
          const stepTitle = `${server}/${tool}`

          if (!availableServers.includes(server)) {
            execPlan[i].active = false
            execPlan[i].description = `执行失败：未知 MCP 服务器 ${server}`
            yield { type: 'plan', plan: [...execPlan] }
            yield { type: 'step', step: { status: 'error', text: `${server}/${tool}` } }
            yield* streamReplyChunks(`未知 MCP server: ${server}`)
            yield { type: 'done', usage: accumulatedUsage }
            return
          }

          const tools = mcpToolsMap[server] || []
          if (!tools.find(t => t.name === tool)) {
            execPlan[i].active = false
            execPlan[i].description = `执行失败：未知工具 ${server}/${tool}`
            yield { type: 'plan', plan: [...execPlan] }
            yield { type: 'step', step: { status: 'error', text: `${server}/${tool}` } }
            yield* streamReplyChunks(`未知工具: ${tool}`)
            yield { type: 'done', usage: accumulatedUsage }
            return
          }

          execPlan[i].active = true
          execPlan[i].description = `正在执行：${stepTitle}`
          yield { type: 'plan', plan: [...execPlan] }
          yield { type: 'step', step: { status: 'start', text: `${server}/${tool}` } }
          yield {
            type: 'mcp',
            mcp: {
              server,
              tool,
              status: 'start',
              input: args,
              time: new Date().toISOString()
            }
          }

          void logger.info('[AI][LegacyMcp] MCP call start', { server, tool, args: summarizeForLog(args, 800) })
          const mcpStep = openStep(`MCP ${server}/${tool}`)
          yield buildTaskEvent(taskId, 'waiting_tool', {
            stepId: mcpStep.stepId,
            stepStatus: 'running',
            title: mcpStep.title
          })
          const result = await executeMcpToolWithPolicy(server, tool, args)
          void logger.info('[AI][LegacyMcp] MCP call finish', {
            server,
            tool,
            ok: Boolean(result.ok),
            error: result.ok ? undefined : String(result.error || ''),
            result: summarizeForLog(result?.result, 900)
          })
          yield {
            type: 'mcp',
            mcp: {
              server,
              tool,
              status: result.ok ? 'success' : 'error',
              error: result.ok ? undefined : String(result.error || '调用失败'),
              time: new Date().toISOString()
            }
          }
          yield buildTaskEvent(taskId, result.ok ? 'running' : 'error', {
            stepId: mcpStep.stepId,
            stepStatus: result.ok ? 'done' : 'error',
            title: mcpStep.title,
            error: result.ok ? undefined : String(result.error || '调用失败'),
            retries: Math.max(0, Number((result as McpCallResult)?.attempts || 1) - 1)
          })

          if (!result.ok) {
            execPlan[i].active = false
            execPlan[i].description = `执行失败：${String(result.error || `${server}/${tool}`)}`
            yield { type: 'plan', plan: [...execPlan] }
            yield { type: 'step', step: { status: 'error', text: `${server}/${tool}` } }
            yield* streamReplyChunks(`调用失败：${result.error || `${server}/${tool}`}`)
            yield { type: 'done', usage: accumulatedUsage }
            return
          }

          execPlan[i].active = false
          execPlan[i].completed = true
          execPlan[i].description = `已经执行了命令：${stepTitle}`
          yield { type: 'plan', plan: [...execPlan] }
          yield { type: 'step', step: { status: 'done', text: `${server}/${tool}` } }

          const displayReply = buildMcpDisplayReply(server, tool, result)
          if (displayReply && displayReply !== '运行结束，已完成。') {
            collectedReplies.push(displayReply)
          }
        }

        if (collectedReplies.length > 0) {
          yield* streamReplyChunks(collectedReplies.join('\n\n'))
        } else {
          yield* streamReplyChunks(`运行结束，已按步骤完成 ${totalSteps} 项操作。`)
        }
        yield buildTaskEvent(taskId, 'done')
        yield { type: 'done', usage: accumulatedUsage }
        return
      } catch (e) {
        yield buildDetail('mcp', 'MCP 调用数据解析失败')
        yield* streamReplyChunks('MCP JSON 解析失败')
        yield buildTaskEvent(taskId, 'error', { error: 'MCP JSON 解析失败' })
        yield { type: 'done', usage: accumulatedUsage }
        return
      }
    }

    // 直接回复
    plan[2].completed = true
    plan[3].completed = true
    yield { type: 'plan', plan: [...plan] }
    yield buildDetail('reply', '直接返回模型回复')
    yield* streamReplyChunks(formatReplyForUser(message, reply))
    await storeConversationTurn(message, reply, conversationHistory || [])
    await extractAndStoreUserInfo(message, reply, conversationHistory || [])
    yield buildTaskEvent(taskId, 'done')
    yield { type: 'done', usage: accumulatedUsage }

  } catch (error) {
    if (isAbortError(error)) {
      logger.info('[Chat] Request aborted')
      yield buildTaskEvent(taskId, 'error', { error: 'The user aborted a request' })
      yield {
        type: 'error',
        error: {
          code: 'REQUEST_ABORTED',
          message: '用户取消了请求',
          severity: 'recoverable',
          suggestion: '任务已被用户终止，可以重新发起请求',
          retryable: true
        } as ErrorDetail
      }
      return
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Chat request failed', error)

    // 检测 OpenRouter 余额不足错误（402）
    const isInsufficientCredits =
      errorMessage.includes('402') ||
      errorMessage.includes('requires more credits') ||
      errorMessage.includes('cannot afford') ||
      errorMessage.includes('add more credits')

    if (isInsufficientCredits) {
      yield buildTaskEvent(taskId, 'error', { error: 'AI 模型余额不足' })
      yield {
        type: 'error',
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: '当前 AI 模型额度不足，暂时无法使用',
          severity: 'fatal',
          suggestion: '请更换其他 AI 模型再试',
          retryable: true
        } as ErrorDetail
      }
    } else {
      yield buildTaskEvent(taskId, 'error', { error: errorMessage })
      yield {
        type: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          severity: 'fatal',
          suggestion: '请检查系统日志获取详细信息',
          retryable: false,
          rootCause: error instanceof Error ? error.stack?.split('\n')[1]?.trim() : undefined
        } as ErrorDetail
      }
    }
  }
}

export function registerWSChatHandler(wsService: any): void {
  const activeControllers = new Map<string, AbortController>()

  const abortClientStream = (clientId: string) => {
    const controller = activeControllers.get(clientId)
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
  }

  wsService.on('chat_cancel', (client: any) => {
    abortClientStream(client.id)
  })

  wsService.on('chat_message', async (client: any, message: any) => {
    const { payload } = message
    if (!payload?.message) {
      wsService.send(client.id, { type: 'error', payload: { message: 'Missing message' } })
      return
    }

    abortClientStream(client.id)
    const controller = new AbortController()
    activeControllers.set(client.id, controller)

    wsService.send(client.id, { type: 'stream_start', payload: { taskId: payload.taskId || 'ws-task' } })

    try {
      const options: ChatStreamOptions = {
        model: payload.model,
        selectedSkillId: payload.selectedSkillId,
        selectedSkillIds: Array.isArray(payload.selectedSkillIds) ? payload.selectedSkillIds : undefined,
        executionMode: payload.executionMode || 'auto',
        promptInstruction: payload.promptInstruction,
        allowedMcpServers: payload.allowedMcpServers,
        signal: controller.signal,
        images: Array.isArray(payload.images) ? payload.images : undefined
      }

      const conversationHistory = Array.isArray(payload.conversationHistory)
        ? payload.conversationHistory
        : undefined

      for await (const chunk of handleChatStream(payload.message, options, conversationHistory)) {
        wsService.send(client.id, { type: 'chat_chunk', payload: chunk })
      }

      wsService.send(client.id, { type: 'stream_end', payload: { taskId: payload.taskId || 'ws-task' } })
    } catch (error) {
      if (isAbortError(error)) {
        logger.info('[Chat] WebSocket request aborted')
        wsService.send(client.id, { type: 'stream_end', payload: { taskId: payload.taskId || 'ws-task' } })
      } else {
        logger.error('WebSocket chat error', error)
        wsService.send(client.id, {
          type: 'error',
          payload: { message: error instanceof Error ? error.message : String(error) }
        })
      }
    } finally {
      activeControllers.delete(client.id)
    }
  })

  wsService.onConnection((client: any) => {
    logger.info('WebSocket client connected for chat', { clientId: client.id })
  })

  wsService.onDisconnection((client: any) => {
    logger.info('WebSocket client disconnected from chat', { clientId: client.id })
    abortClientStream(client.id)
    activeControllers.delete(client.id)
  })
}
