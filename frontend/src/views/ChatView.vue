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
            <div v-if="msg.mcpCalls && msg.mcpCalls.length > 0" class="chat-mcp-timeline">
              <div class="chat-mcp-timeline-title">
                <span class="chat-mcp-timeline-dot"></span>
                工具调用
              </div>
              <div v-for="(call, i) in msg.mcpCalls" :key="i" class="chat-mcp-item" :class="'chat-mcp-item--' + call.status">
                <div class="chat-mcp-item-line"></div>
                <div class="chat-mcp-item-content">
                  <div class="chat-mcp-item-header">
                    <span class="chat-mcp-item-server">{{ call.server }}</span>
                    <span class="chat-mcp-item-tool">/{{ call.tool }}</span>
                    <span class="chat-mcp-item-badge" :class="'chat-mcp-item-badge--' + call.status">
                      {{ call.status === 'success' ? '成功' : call.status === 'error' ? '失败' : '进行中' }}
                    </span>
                  </div>
                  <div v-if="call.duration" class="chat-mcp-item-duration">{{ call.duration }}ms</div>
                  <div v-if="call.result" class="chat-mcp-item-result" v-html="formatResult(call.result)"></div>
                </div>
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
    let text = escapeHtml(result)
    text = text.replace(/\/(Users|home|private\/tmp)\/[^\s<）)\]>]+/g, '<span class="file-path-link" data-file-path="$&">$&</span>')
    if (text.length > 200) {
      return text.slice(0, 200) + '...'
    }
    return text
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

/* ===== MCP 调用时间线 ===== */
.chat-mcp-timeline {
  margin-top: 12px;
  padding: 0;
}

.chat-mcp-timeline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #6366f1;
  margin-bottom: 10px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.chat-mcp-timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  flex-shrink: 0;
}

.chat-mcp-item {
  position: relative;
  padding-left: 16px;
  margin-bottom: 8px;
}

.chat-mcp-item:last-child { margin-bottom: 0; }

.chat-mcp-item::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 2px solid #f1f5f9;
  z-index: 1;
}

.chat-mcp-item--success::before {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.chat-mcp-item--error::before {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.chat-mcp-item--start::before {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
  animation: chat-mcp-pulse 1.4s ease-in-out infinite;
}

@keyframes chat-mcp-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.08); }
}

.chat-mcp-item::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: -8px;
  width: 1px;
  background: #e2e8f0;
}

.chat-mcp-item:last-child::after { display: none; }

.chat-mcp-item-line { display: none; }

.chat-mcp-item-content {
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 10px 12px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}

.chat-mcp-item-content:hover {
  border-color: #e2e8f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.chat-mcp-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.chat-mcp-item-server {
  font-weight: 600;
  color: #1f2937;
  font-size: 12px;
}

.chat-mcp-item-tool {
  color: #6b7280;
  font-size: 12px;
}

.chat-mcp-item-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
  letter-spacing: 0.2px;
  flex-shrink: 0;
}

.chat-mcp-item-badge--success { background: #d1fae5; color: #059669; }
.chat-mcp-item-badge--error { background: #fee2e2; color: #dc2626; }
.chat-mcp-item-badge--start { background: #fef3c7; color: #d97706; }

.chat-mcp-item-duration {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.chat-mcp-item-result {
  margin-top: 6px;
  font-size: 11px;
  color: #64748b;
  background: #f8fafc;
  padding: 5px 8px;
  border-radius: 6px;
  border-left: 2px solid #e2e8f0;
  word-break: break-word;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
