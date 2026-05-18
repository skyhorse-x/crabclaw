<template>
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
            <!-- 正在处理占位 -->
            <div v-if="msg.thinking && !msg.text" class="thinking-tip">
              <span class="icon-spin"></span> 正在思考...
            </div>
            <div v-else class="message-text" v-html="formatMessage(msg.text)"></div>
            <details v-if="msg.mcpCalls && msg.mcpCalls.length > 0" class="chat-mcp-wrap">
              <summary class="chat-mcp-summary">执行记录</summary>
              <div class="chat-mcp-timeline">
                <div v-for="(call, i) in msg.mcpCalls" :key="i" class="chat-mcp-item" :class="'chat-mcp-item--' + call.status">
                  <div class="mcp-status-col">
                    <span v-if="call.status === 'success'" class="icon-ok">✓</span>
                    <span v-else-if="call.status === 'error'" class="icon-err">✗</span>
                    <span v-else class="icon-spin"></span>
                  </div>
                  <div class="mcp-body">
                    <div class="mcp-action">{{ toolAction(call.server, call.tool, call.input, call.status) }}</div>
                    <div class="mcp-tool-row">
                      <span class="mcp-tool-label">调用工具：</span>
                      <span class="mcp-tool-name">{{ toolShortName(call.server, call.tool) }}</span>
                    </div>
                    <div v-if="toolDetails(call.server, call.tool, call.input, call.error).length" class="mcp-detail-block">
                      <div class="mcp-detail-title">执行细节：</div>
                      <div v-for="(d, di) in toolDetails(call.server, call.tool, call.input, call.error)" :key="di" class="mcp-detail-row">
                        <span class="mcp-detail-key">{{ d.key }}：</span>
                        <span class="mcp-detail-val" :class="d.type === 'error' ? 'mcp-detail-err' : ''">{{ d.val }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
            <div v-if="msg.error && msg.error.code === 'REQUEST_ABORTED'" class="paused-tip">
              ⏸ 已暂停执行
            </div>
            <div v-else-if="msg.error" class="error-card" :class="msg.error.severity">
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
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
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
    error?: string
    duration?: number
    input?: Record<string, unknown>
    result?: unknown
    confidence?: number
    causalChain?: CausalNode[]
  }>
  error?: ErrorDetail
  learning?: LearningFeedback
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  thinking?: boolean
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

function ensureAiMessage() {
  if (!aiMessage) {
    aiMessage = { role: 'assistant', text: '', thinking: true }
    currentConversation.value.messages.push(aiMessage)
  }
  return aiMessage
}

function handleChunk(chunk: ChatChunk) {
  switch (chunk.type) {
    case 'plan':
    case 'task':
    case 'step':
    case 'detail':
      // 这些内部进度事件只确保 aiMessage 存在，不写入正文
      ensureAiMessage()
      break

    case 'reasoning':
      if (chunk.reasoning) ensureAiMessage().reasoning = chunk.reasoning
      break

    case 'mcp':
      if (chunk.mcp) {
        const msg = ensureAiMessage()
        if (!msg.mcpCalls) msg.mcpCalls = []
        const existing = msg.mcpCalls.find(
          c => c.server === chunk.mcp!.server && c.tool === chunk.mcp!.tool && c.status === 'start'
        )
        if (existing && chunk.mcp.status !== 'start') {
          Object.assign(existing, chunk.mcp)
        } else {
          msg.mcpCalls.push(chunk.mcp)
        }
      }
      break

    case 'error':
      if (chunk.error) {
        const msg = ensureAiMessage()
        msg.thinking = false
        msg.error = typeof chunk.error === 'string'
          ? { code: 'ERROR', message: chunk.error, severity: 'fatal', suggestion: '', retryable: false }
          : chunk.error
      }
      break

    case 'learning':
      if (chunk.learning) ensureAiMessage().learning = chunk.learning
      break

    case 'reply':
      if (chunk.reply) {
        const msg = ensureAiMessage()
        msg.thinking = false
        if (chunk.delta) {
          msg.text += chunk.reply
        } else {
          msg.text = chunk.reply
        }
      }
      break

    case 'done':
      if (aiMessage) {
        aiMessage.thinking = false
        if (chunk.usage) aiMessage.usage = chunk.usage
      }
      aiMessage = null
      break
  }
  nextTick(scrollToBottom)
}

function formatMessage(text: string) {
  return text.replace(/\n/g, '<br>')
}

// 工具短名（二级：调用工具）
function toolShortName(server: string, tool: string): string {
  const map: Record<string, string> = {
    'shell': 'shell', 'filesystem': 'filesystem',
    'chrome-devtools': 'browser', 'fetch': 'fetch', 'memory': 'memory',
  }
  return map[server] || server
}

// 一级：动作描述，区分进行中/完成/失败
function toolAction(server: string, tool: string, input?: Record<string, unknown>, status?: string): string {
  const ing = status === 'success' ? false : status === 'error' ? false : true
  const ok  = status === 'success'
  const err = status === 'error'

  const url = String(input?.url || '')
  const domain = url.replace(/^https?:\/\//, '').split('/')[0]
  const file = String(input?.path || input?.file || '').split('/').pop() || ''
  const cmd  = String(input?.command || input?.cmd || '').slice(0, 30)

  const defs: Record<string, [string, string, string]> = {
    'new_page':        [`正在打开 ${domain || '页面'}`,  `已打开 ${domain || '页面'}`,   `未能打开 ${domain || '页面'}`],
    'navigate_page':   [`正在访问 ${domain || '页面'}`,  `已访问 ${domain || '页面'}`,   `未能访问 ${domain || '页面'}`],
    'click':           [`正在点击元素`,                  `已点击元素`,                   `未能点击元素`],
    'fill':            [`正在输入内容`,                  `已输入内容`,                   `未能输入内容`],
    'type_text':       [`正在输入文字`,                  `已输入文字`,                   `未能输入文字`],
    'press_key':       [`正在按键`,                      `已按键`,                       `未能按键`],
    'evaluate_script': [`正在执行脚本`,                  `已执行脚本`,                   `脚本执行失败`],
    'shell_execute':   [`正在执行命令`,                  `已执行命令`,                   `命令执行失败`],
    'run_process':     [`正在执行命令`,                  `已执行命令`,                   `命令执行失败`],
    'read_file':       [`正在读取文件 ${file}`,          `已读取文件 ${file}`,           `未能读取文件 ${file}`],
    'write_file':      [`正在写入文件 ${file}`,          `已写入文件 ${file}`,           `未能写入文件 ${file}`],
    'create_directory':[`正在创建目录 ${file}`,          `已创建目录 ${file}`,           `未能创建目录 ${file}`],
    'delete_file':     [`正在删除文件 ${file}`,          `已删除文件 ${file}`,           `未能删除文件 ${file}`],
    'fetch_readable':  [`正在获取网页 ${domain}`,        `已获取网页 ${domain}`,         `未能获取网页 ${domain}`],
    'http_request':    [`正在发送请求`,                  `已发送请求`,                   `请求失败`],
  }

  const entry = defs[tool]
  if (entry) return err ? entry[2] : ok ? entry[1] : entry[0]
  if (ing) return `正在执行 ${tool}`
  if (ok)  return `已执行 ${tool}`
  return `未能执行 ${tool}`
}

// 三级：执行细节字段列表
function toolDetails(
  server: string, tool: string,
  input?: Record<string, unknown>,
  error?: string
): Array<{ key: string; val: string; type?: string }> {
  const rows: Array<{ key: string; val: string; type?: string }> = []
  if (!input) {
    if (error) rows.push({ key: '错误信息', val: error, type: 'error' })
    return rows
  }

  const str = (v: unknown) => String(v || '').trim()
  const url  = str(input.url)
  const path = str(input.path || input.file || '')
  const dir  = path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''
  const file = path.split('/').pop() || ''
  const cmd  = str(input.command || input.cmd)
  const sel  = str(input.selector || input.uid || input.element)
  const val  = str(input.value || input.text)
  const key  = str(input.key)
  const fn   = str(input.function || input.script)
  const query = str(input.query || input.q)

  // browser
  if (server === 'chrome-devtools') {
    if (url)   rows.push({ key: '目标链接', val: url })
    if (sel)   rows.push({ key: '目标元素', val: sel.slice(0, 60) })
    if (val)   rows.push({ key: '输入内容', val: val.slice(0, 60) })
    if (key)   rows.push({ key: '按键',     val: key })
    if (fn)    rows.push({ key: '操作命令', val: fn.slice(0, 80) })
    if (query) rows.push({ key: '搜索内容', val: query })
  }

  // shell
  if (server === 'shell') {
    if (cmd) rows.push({ key: '操作命令', val: cmd })
  }

  // filesystem
  if (server === 'filesystem') {
    if (cmd)  rows.push({ key: '操作命令', val: cmd })
    if (file) rows.push({ key: '目标文件', val: file })
    if (dir)  rows.push({ key: '所在目录', val: dir })
  }

  // fetch
  if (server === 'fetch') {
    if (url) rows.push({ key: '目标链接', val: url })
  }

  // 通用 fallback
  if (rows.length === 0) {
    if (url)  rows.push({ key: '目标链接', val: url })
    if (cmd)  rows.push({ key: '操作命令', val: cmd })
    if (path) rows.push({ key: '目标文件', val: path })
  }

  if (error) rows.push({ key: '错误信息', val: error, type: 'error' })
  return rows
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
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
  color: #fff;
}

.message.assistant .message-avatar {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
  color: #fff;
}

.message-content {
  flex: 1;
  max-width: 90%;
}

.message.user .message-content {
  text-align: right;
}

.thinking-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #9ca3af;
  padding: 4px 0;
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

/* ===== MCP 执行记录折叠 ===== */
.chat-mcp-wrap {
  margin-top: 8px;
}

.chat-mcp-wrap > summary {
  display: inline-block;
  cursor: pointer;
  font-size: 11px;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 2px 8px;
  user-select: none;
  list-style: none;
  outline: none;
}

.chat-mcp-wrap > summary::-webkit-details-marker {
  display: none;
}

.chat-mcp-wrap[open] > summary {
  margin-bottom: 8px;
}

/* ===== MCP 三级步骤 ===== */
.chat-mcp-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-mcp-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  transition: border-color 0.2s;
}

.chat-mcp-item--success { border-left: 3px solid #10b981; }
.chat-mcp-item--error   { border-left: 3px solid #ef4444; background: #fff8f8; }
.chat-mcp-item--start   { border-left: 3px solid #6366f1; }

.mcp-status-col {
  flex-shrink: 0;
  margin-top: 1px;
  width: 16px;
  text-align: center;
}

.icon-ok {
  color: #10b981;
  font-weight: 700;
  font-size: 14px;
}

.icon-err {
  color: #ef4444;
  font-weight: 700;
  font-size: 14px;
}

.icon-spin {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #d1d5db;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: mcp-spin 0.8s linear infinite;
  vertical-align: middle;
}

@keyframes mcp-spin { to { transform: rotate(360deg); } }

.mcp-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.paused-tip {
  margin-top: 8px;
  font-size: 13px;
  color: #6b7280;
}

/* 一级：动作 */
.mcp-action {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.4;
}
.chat-mcp-item--error .mcp-action { color: #dc2626; }

/* 二级：工具名 */
.mcp-tool-row {
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 2px;
}
.mcp-tool-label { color: #9ca3af; }
.mcp-tool-name  { font-weight: 500; color: #6366f1; }

/* 三级：执行细节 */
.mcp-detail-block {
  margin-top: 2px;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mcp-detail-title {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.mcp-detail-row {
  display: flex;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
}
.mcp-detail-key {
  flex-shrink: 0;
  color: #64748b;
  font-weight: 500;
}
.mcp-detail-val {
  color: #374151;
  word-break: break-all;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11.5px;
}
.mcp-detail-err {
  color: #dc2626;
  font-family: inherit;
  font-size: 12px;
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
