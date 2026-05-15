import { ref, onUnmounted, shallowRef } from 'vue'

export interface WSMessage {
  type: string
  payload?: unknown
  clientId?: string
  timestamp?: number
}

export interface CausalNode {
  action: string
  result: string
  cause: string
  effect: string
}

export interface ErrorDetail {
  code: string
  message: string
  severity: 'recoverable' | 'fatal'
  suggestion: string
  alternativeTools?: string[]
  retryable: boolean
  rootCause?: string
}

export interface LearningFeedback {
  experienceGained: boolean
  patternExtracted?: string
  confidenceUpdated?: number
  recommendations?: string[]
}

export interface ChatChunk {
  type: 'plan' | 'reply' | 'error' | 'done' | 'detail' | 'mcp' | 'confirm' | 'task' | 'step' | 'reasoning' | 'learning'
  plan?: any[]
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
}

const sharedWs = shallowRef<WebSocket | null>(null)
const sharedIsConnected = ref(false)
const sharedIsConnecting = ref(false)
const sharedReconnectAttempts = ref(0)
const maxReconnectDelay = 30000

const sharedMessageHandlers = new Map<string, (payload: unknown) => void>()
const sharedChunkHandlers: ((chunk: ChatChunk) => void)[] = []

let sharedUrl = ''
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function handleMessage(message: WSMessage) {
  if (message.type === 'chat_chunk' && message.payload) {
    sharedChunkHandlers.forEach(handler => handler(message.payload as ChatChunk))
    return
  }
  if (message.type === 'remote_message' && message.payload) {
    const handler = sharedMessageHandlers.get('remote_message')
    if (handler) handler(message.payload)
    return
  }
  const handler = sharedMessageHandlers.get(message.type)
  if (handler) handler(message.payload)
}

function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), maxReconnectDelay)
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  const delay = getReconnectDelay(sharedReconnectAttempts.value + 1)
  console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${sharedReconnectAttempts.value + 1})`)
  reconnectTimer = setTimeout(() => {
    sharedReconnectAttempts.value++
    console.log(`[WebSocket] Reconnecting... (attempt ${sharedReconnectAttempts.value})`)
    connect(sharedUrl)
  }, delay)
}

function connect(wsUrl: string) {
  if (sharedWs.value?.readyState === WebSocket.OPEN || sharedIsConnecting.value) {
    return
  }
  sharedUrl = wsUrl
  sharedIsConnecting.value = true
  try {
    console.log('[WebSocket] Connecting to:', wsUrl)
    sharedWs.value = new WebSocket(wsUrl)
    sharedWs.value.onopen = () => {
      sharedIsConnected.value = true
      sharedIsConnecting.value = false
      sharedReconnectAttempts.value = 0
      console.log('[WebSocket] Connected')
    }
    sharedWs.value.onmessage = async (event) => {
      try {
        const raw = event.data instanceof Blob ? await event.data.text() : String(event.data)
        const message: WSMessage = JSON.parse(raw)
        console.log('[WebSocket] Received message:', message.type)
        handleMessage(message)
      } catch (e) {
        console.error('[WebSocket] Failed to parse message:', e)
      }
    }
    sharedWs.value.onclose = () => {
      sharedIsConnected.value = false
      sharedIsConnecting.value = false
      console.log('[WebSocket] Disconnected')
      scheduleReconnect()
    }
    sharedWs.value.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
      sharedIsConnecting.value = false
    }
  } catch (e) {
    console.error('[WebSocket] Connection failed:', e)
    sharedIsConnecting.value = false
    scheduleReconnect()
  }
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  sharedReconnectAttempts.value = 999
  if (sharedWs.value) {
    sharedWs.value.close()
    sharedWs.value = null
  }
  sharedIsConnected.value = false
  sharedIsConnecting.value = false
}

function send(message: WSMessage): boolean {
  if (sharedWs.value?.readyState !== WebSocket.OPEN) {
    console.warn('[WebSocket] Not connected, cannot send message')
    return false
  }
  try {
    sharedWs.value.send(JSON.stringify(message))
    return true
  } catch (e) {
    console.error('[WebSocket] Send failed:', e)
    return false
  }
}

export function useWebSocket() {
  return {
    isConnected: sharedIsConnected,
    isConnecting: sharedIsConnecting,
    connect,
    disconnect,
    send,
    sendChat: (payload: {
      message: string
      model?: string
      taskId?: string
      selectedSkillId?: string
      selectedSkillIds?: string[]
      executionMode?: string
      promptInstruction?: string
      allowedMcpServers?: string[]
      conversationHistory?: Array<{ role: string; text: string }>
      images?: Array<{ name: string; type: string; dataUrl: string }>
    }) => send({ type: 'chat_message', payload }),
    onChatChunk: (handler: (chunk: ChatChunk) => void) => {
      sharedChunkHandlers.push(handler)
      return () => {
        const index = sharedChunkHandlers.indexOf(handler)
        if (index > -1) sharedChunkHandlers.splice(index, 1)
      }
    },
    on: (type: string, handler: (payload: unknown) => void) => {
      sharedMessageHandlers.set(type, handler)
      return () => sharedMessageHandlers.delete(type)
    }
  }
}
