<template>
  <AppLayout>
    <div class="chat-container">
      <div class="chat-messages" ref="chatContainer">
        <div v-if="currentConversation.messages.length === 0" class="chat-empty">
          <div class="empty-icon"></div>
          <p>{{ t('chatEmpty') }}</p>
        </div>
        <div
          v-for="(msg, index) in currentConversation.messages"
          :key="index"
          class="message"
          :class="msg.role"
        >
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(msg.text)"></div>
            <div v-if="msg.stages && msg.stages.length > 0" class="stages-progress">
              <div v-for="(stage, i) in msg.stages" :key="i" class="stage-item">
                <span class="stage-dot"></span>
                <span class="stage-text" v-html="formatStage(stage)"></span>
              </div>
            </div>
            <div v-if="msg.reasoning" class="reasoning-card">
              <div class="reasoning-header">
                <span class="reasoning-icon"></span>
                <span>推理过程</span>
                <span class="confidence-badge">{{ Math.round(msg.reasoning.confidence * 100) }}%</span>
              </div>
              <div class="reasoning-text">{{ msg.reasoning.text }}</div>
            </div>
            <div v-if="msg.mcpCalls && msg.mcpCalls.length > 0" class="mcp-calls">
              <div class="mcp-header">工具调用</div>
              <div v-for="(call, i) in msg.mcpCalls" :key="i" class="mcp-call-card" :class="call.status">
                <div class="mcp-call-header">
                  <span class="mcp-server">{{ call.server }}</span>
                  <span class="mcp-tool">/{{ call.tool }}</span>
                  <span class="mcp-status" :class="call.status">{{ call.status === 'success' ? 'OK' : 'FAIL' }}</span>
                </div>
                <div v-if="call.duration" class="mcp-duration">{{ call.duration }}ms</div>
                <div v-if="call.causalChain && call.causalChain.length > 0" class="causal-chain">
                  <div v-for="(node, j) in call.causalChain" :key="j" class="causal-node">
                    <span class="causal-action">{{ node.action }}</span>
                    <span class="causal-arrow">→</span>
                    <span class="causal-effect">{{ node.effect }}</span>
                  </div>
                </div>
                <div v-if="call.result" class="mcp-result" v-html="formatResult(call.result)"></div>
              </div>
            </div>
            <div v-if="msg.error" class="error-card" :class="msg.error.severity">
              <div class="error-header">
                <span class="error-icon"></span>
                <span class="error-code">{{ msg.error.code }}</span>
                <span class="error-severity" :class="msg.error.severity">{{ msg.error.severity }}</span>
              </div>
              <div class="error-message">{{ msg.error.message }}</div>
              <div v-if="msg.error.suggestion" class="error-suggestion">
                <span class="suggestion-icon"></span>
                {{ msg.error.suggestion }}
              </div>
              <div v-if="msg.error.retryable" class="error-retry">可重试</div>
            </div>
            <div v-if="msg.learning && msg.learning.experienceGained" class="learning-card">
              <div class="learning-header">
                <span class="learning-icon"></span>
                <span>经验反馈</span>
              </div>
              <div v-if="msg.learning.recommendations" class="learning-recommendations">
                <div v-for="(rec, i) in msg.learning.recommendations" :key="i" class="recommendation">
                  {{ rec }}
                </div>
              </div>
            </div>
            <div v-if="msg.usage" class="usage-info">
              <span>Token: {{ msg.usage.totalTokens }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <el-input
          v-model="chatInput"
          type="textarea"
          :rows="3"
          :placeholder="t('chatPlaceholder')"
          @keydown.enter.exact.prevent="handleSend"
        />
        <div class="input-actions">
          <el-button type="primary" @click="handleSend" :disabled="!chatInput.trim()">
            {{ t('send') }}
          </el-button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useWebSocket, type ChatChunk, type CausalNode, type ErrorDetail, type LearningFeedback } from '@/composables/useWebSocket'

const { t } = useI18n()

interface Message {
  role: string
  text: string
  typing?: boolean
  reasoning?: { type: string; text: string; confidence: number }
  mcpCalls?: Array<{
    server: string
    tool: string
    status: 'start' | 'success' | 'error'
    duration?: number
    input?: Record<string, unknown>
    result?: unknown
    confidence?: number
    causalChain?: CausalNode[]
  }>
  error?: ErrorDetail
  learning?: LearningFeedback
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  stages?: string[]
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
}

const chatInput = ref('')
const chatContainer = ref<HTMLElement | null>(null)
const conversations = ref<Conversation[]>([])
const currentConversationId = ref('default')
const { connect, sendChat, onChatChunk, isConnected } = useWebSocket()

const currentConversation = computed(() => {
  return conversations.value.find(c => c.id === currentConversationId.value) || {
    id: 'default',
    title: 'New Chat',
    messages: []
  }
})

let aiMessage: Message | null = null

onMounted(() => {
  if (!isConnected.value) {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    connect(wsUrl)
  }

  onChatChunk((chunk: ChatChunk) => {
    handleChunk(chunk)
  })
})

function handleChunk(chunk: ChatChunk) {
  switch (chunk.type) {
    case 'reasoning':
      if (aiMessage && chunk.reasoning) {
        aiMessage.reasoning = chunk.reasoning
      }
      break

    case 'mcp':
      if (aiMessage && chunk.mcp) {
        if (!aiMessage.mcpCalls) aiMessage.mcpCalls = []
        aiMessage.mcpCalls.push(chunk.mcp)
      }
      break

    case 'error':
      if (aiMessage && chunk.error) {
        aiMessage.error = typeof chunk.error === 'string'
          ? { code: 'ERROR', message: chunk.error, severity: 'fatal', suggestion: '', retryable: false }
          : chunk.error
      }
      break

    case 'learning':
      if (aiMessage && chunk.learning) {
        aiMessage.learning = chunk.learning
      }
      break

    case 'reply':
      if (!aiMessage) {
        aiMessage = { role: 'assistant', text: '' }
        currentConversation.value.messages.push(aiMessage)
      }
      if (chunk.delta && chunk.reply) {
        aiMessage.text += chunk.reply
      } else if (chunk.reply) {
        aiMessage.text = chunk.reply
      }
      break

    case 'done':
      if (aiMessage && chunk.usage) {
        aiMessage.usage = chunk.usage
      }
      aiMessage = null
      break

    case 'detail':
      if (aiMessage && chunk.detail) {
        if (!aiMessage.stages) aiMessage.stages = []
        const stageText = `[${chunk.detail.stage}] ${chunk.detail.text}`
        if (!aiMessage.stages.includes(stageText)) {
          aiMessage.stages.push(stageText)
        }
        aiMessage.text = aiMessage.stages.join('\n')
      }
      break

    case 'done':
      if (aiMessage) {
        if (aiMessage.stages && aiMessage.stages.length > 0) {
          aiMessage.text = aiMessage.stages[aiMessage.stages.length - 1] || '处理完成'
        }
        if (chunk.usage) {
          aiMessage.usage = chunk.usage
        }
      }
      aiMessage = null
      break
  }
  nextTick(scrollToBottom)
}

function formatMessage(text: string) {
  return text.replace(/\n/g, '<br>')
}

function formatStage(text: string): string {
  if (text.length > 200) {
    return escapeHtml(text.slice(0, 200)) + '...'
  }
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') {
    if (result.length > 200) {
      return escapeHtml(result.slice(0, 200)) + '...'
    }
    return escapeHtml(result)
  }
  const json = JSON.stringify(result)
  if (json.length > 200) {
    return escapeHtml(json.slice(0, 200)) + '...'
  }
  return escapeHtml(json)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function handleSend() {
  if (!chatInput.value.trim()) return

  const text = chatInput.value.trim()
  chatInput.value = ''

  currentConversation.value.messages.push({
    role: 'user',
    text
  })

  aiMessage = { role: 'assistant', text: '' }
  currentConversation.value.messages.push(aiMessage)

  await nextTick()
  scrollToBottom()

  sendChat({
    message: text,
    conversationHistory: currentConversation.value.messages.slice(0, -1).map(m => ({
      role: m.role,
      text: m.text
    }))
  })
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.message.user .message-avatar {
  background: #667eea;
  color: #fff;
}

.message.assistant .message-avatar {
  background: #10b981;
  color: #fff;
}

.message-content {
  flex: 1;
  max-width: 90%;
}

.message.user .message-content {
  text-align: right;
}

.stages-progress {
  margin-top: 12px;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  border-left: 3px solid #3b82f6;
}

.stage-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: #475569;
}

.stage-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3b82f6;
  margin-top: 6px;
  flex-shrink: 0;
}

.stage-text {
  line-height: 1.4;
  word-break: break-word;
  max-width: 100%;
  overflow: hidden;
}

.reasoning-card {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 8px;
  border-left: 4px solid #f59e0b;
}

.reasoning-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 6px;
}

.reasoning-icon {
  font-size: 16px;
}

.confidence-badge {
  background: #f59e0b;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-left: auto;
}

.reasoning-text {
  color: #78350f;
  font-size: 14px;
}

.mcp-calls {
  margin-top: 12px;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 12px;
}

.mcp-header {
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.mcp-call-card {
  background: white;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-left: 3px solid #6b7280;
}

.mcp-call-card.success {
  border-left-color: #10b981;
}

.mcp-call-card.error {
  border-left-color: #ef4444;
}

.mcp-call-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.mcp-server {
  font-weight: 600;
  color: #1f2937;
}

.mcp-tool {
  color: #6b7280;
}

.mcp-status {
  margin-left: auto;
  font-weight: bold;
}

.mcp-status.success {
  color: #10b981;
}

.mcp-status.error {
  color: #ef4444;
}

.mcp-duration {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}

.causal-chain {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.causal-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
  color: #4b5563;
}

.causal-action {
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 4px;
}

.causal-arrow {
  color: #9ca3af;
}

.causal-effect {
  color: #059669;
}

.mcp-result {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
  background: #f9fafb;
  padding: 6px 8px;
  border-radius: 4px;
  word-break: break-word;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.error-card {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 8px;
  border-left: 4px solid #ef4444;
}

.error-card.recoverable {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-left-color: #f59e0b;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.error-icon {
  font-size: 16px;
}

.error-code {
  font-weight: 600;
  color: #991b1b;
}

.error-severity {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.error-severity.fatal {
  background: #ef4444;
  color: white;
}

.error-severity.recoverable {
  background: #f59e0b;
  color: white;
}

.error-message {
  color: #b91c1c;
  font-size: 14px;
}

.error-suggestion {
  margin-top: 8px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  color: #92400e;
}

.suggestion-icon {
  flex-shrink: 0;
}

.error-retry {
  margin-top: 6px;
  font-size: 11px;
  color: #059669;
  font-weight: 600;
}

.learning-card {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 8px;
  border-left: 4px solid #3b82f6;
}

.learning-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1e40af;
  margin-bottom: 8px;
}

.learning-icon {
  font-size: 16px;
}

.recommendation {
  background: #eff6ff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #1e40af;
  margin-bottom: 4px;
}

.usage-info {
  margin-top: 8px;
  font-size: 11px;
  color: #9ca3af;
  text-align: right;
}

.chat-input-area {
  padding: 16px 20px;
  background: white;
  border-top: 1px solid #e5e7eb;
}

.input-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
