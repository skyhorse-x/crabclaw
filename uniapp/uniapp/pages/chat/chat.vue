<template>
  <view class="chat-container">
    <view class="chat-header">
      <view class="header-left" @tap="goBack">
        <uni-icons type="back" size="24" color="#ffffff"></uni-icons>
      </view>
      <view class="header-center">
        <view class="ai-avatar">
          <uni-icons type="staff" size="24" color="#ffffff"></uni-icons>
        </view>
        <view class="header-info">
          <text class="header-title">AI Assistant</text>
          <text class="header-status">Online</text>
        </view>
      </view>
      <view class="header-right">
        <uni-icons type="more" size="24" color="#ffffff"></uni-icons>
      </view>
    </view>

    <scroll-view
      class="chat-messages"
      scroll-y
      :scroll-top="scrollTop"
      :scroll-into-view="scrollIntoView"
      @scrolltoupper="loadMoreHistory"
    >
      <view v-if="messages.length === 0" class="empty-state">
        <view class="empty-icon-wrapper">
          <uni-icons type="staff" size="48" color="#ffffff"></uni-icons>
        </view>
        <text class="empty-title">Start a conversation</text>
        <text class="empty-subtitle">Ask me anything, I'm here to help!</text>
      </view>

      <view
        v-for="(msg, index) in messages"
        :key="index"
        :id="'msg-' + index"
        class="message-wrapper"
        :class="msg.role"
      >
        <view v-if="msg.role === 'assistant'" class="avatar ai-avatar-small">
          <uni-icons type="staff" size="20" color="#ffffff"></uni-icons>
        </view>

        <view class="message-bubble-container">
          <view
            class="message-bubble"
            :class="[msg.role, msg.status]"
          >
            <view v-if="msg.role === 'assistant' && msg.thinking" class="thinking-indicator">
              <view class="thinking-dots">
                <view class="dot"></view>
                <view class="dot"></view>
                <view class="dot"></view>
              </view>
              <text class="thinking-text">Thinking...</text>
            </view>

            <view v-else class="message-content" v-html="formatMessage(msg.text)"></view>

            <view v-if="msg.mcpCalls && msg.mcpCalls.length > 0" class="mcp-calls">
              <view
                v-for="(call, callIndex) in msg.mcpCalls"
                :key="callIndex"
                class="mcp-call-item"
                :class="call.status"
              >
                <view class="mcp-call-header">
                  <uni-icons
                    :type="call.status === 'success' ? 'checkmarkempty' : call.status === 'error' ? 'close' : 'reload'"
                    :size="16"
                    :color="call.status === 'success' ? '#48bb78' : call.status === 'error' ? '#f56565' : '#e53e3e'"
                  ></uni-icons>
                  <text class="mcp-tool-name">{{ call.server }}:{{ call.tool }}</text>
                </view>
                <view v-if="call.input" class="mcp-call-input">
                  <text class="mcp-input-key" v-for="(val, key) in call.input" :key="key">
                    {{ key }}: {{ formatInputValue(val) }}
                  </text>
                </view>
              </view>
            </view>

            <view v-if="msg.error" class="error-display">
              <uni-icons type="info" size="16" color="#991b1b"></uni-icons>
              <text class="error-text">{{ msg.error }}</text>
            </view>

            <view v-if="msg.usage" class="usage-info">
              <text class="usage-text">Token: {{ msg.usage.totalTokens }}</text>
            </view>
          </view>

          <text class="message-time">{{ formatTime(msg.timestamp) }}</text>
        </view>

        <view v-if="msg.role === 'user'" class="avatar user-avatar-small">
          <uni-icons type="staff" size="20" color="#ffffff"></uni-icons>
        </view>
      </view>

      <view v-if="isLoading" class="loading-indicator">
        <view class="loading-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>
      </view>

      <view id="scroll-bottom"></view>
    </scroll-view>

    <view class="chat-input-area">
      <view class="input-wrapper">
        <textarea
          v-model="inputMessage"
          class="input-field"
          placeholder="Type your message..."
          :adjust-position="true"
          :cursor-spacing="20"
          :show-confirm-bar="false"
          @confirm="sendMessage"
        />
        <view class="input-actions">
          <view class="action-btn" @tap="clearInput">
            <uni-icons type="trash" size="18" color="#a0aec0"></uni-icons>
          </view>
          <view
            class="send-btn"
            :class="{ active: inputMessage.trim() }"
            @tap="sendMessage"
          >
            <uni-icons type="paperplane" size="18" :color="inputMessage.trim() ? '#ffffff' : '#a0aec0'"></uni-icons>
          </view>
        </view>
      </view>
      <view class="input-hint">
        <text class="hint-text">Press send to submit</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      inputMessage: '',
      messages: [],
      isLoading: false,
      scrollTop: 0,
      scrollIntoView: '',
      ws: null,
      reconnectTimer: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
      baseUrl: 'http://localhost:17870'
    }
  },
  onLoad() {
    this.connectWebSocket()
    this.loadWelcomeMessage()
  },
  onUnload() {
    this.closeWebSocket()
  },
  methods: {
    loadWelcomeMessage() {
      this.messages.push({
        role: 'assistant',
        text: 'Hello! I\'m your AI Assistant powered by CrabClaw. How can I help you today?',
        timestamp: Date.now(),
        status: 'sent'
      })
    },
    connectWebSocket() {
      try {
        const wsUrl = `ws://localhost:17870/ws`
        this.ws = uni.connectSocket({
          url: wsUrl,
          success: () => {
            console.log('WebSocket connecting...')
          },
          fail: (err) => {
            console.error('WebSocket connection failed:', err)
            this.handleReconnect()
          }
        })

        this.ws.onOpen(() => {
          console.log('WebSocket connected')
          this.reconnectAttempts = 0
        })

        this.ws.onMessage((res) => {
          this.handleWebSocketMessage(res.data)
        })

        this.ws.onError((err) => {
          console.error('WebSocket error:', err)
          this.handleReconnect()
        })

        this.ws.onClose(() => {
          console.log('WebSocket closed')
          this.handleReconnect()
        })
      } catch (error) {
        console.error('WebSocket connection error:', error)
        this.handleReconnect()
      }
    },
    handleWebSocketMessage(data) {
      try {
        const message = JSON.parse(data)
        if (message.type === 'reply' || message.type === 'chunk') {
          this.handleChunk(message)
        } else if (message.type === 'done') {
          this.handleDone(message)
        } else if (message.type === 'error') {
          this.handleError(message)
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    },
    handleChunk(chunk) {
      const lastMessage = this.messages[this.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.thinking) {
        lastMessage.thinking = false
      }

      if (chunk.delta) {
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.text += chunk.delta
        } else {
          this.messages.push({
            role: 'assistant',
            text: chunk.delta,
            timestamp: Date.now(),
            status: 'receiving'
          })
        }
      }

      if (chunk.mcp) {
        this.handleMcpCall(chunk.mcp)
      }

      this.scrollToBottom()
    },
    handleMcpCall(mcpData) {
      const lastMessage = this.messages[this.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        if (!lastMessage.mcpCalls) {
          lastMessage.mcpCalls = []
        }
        const existing = lastMessage.mcpCalls.find(
          c => c.server === mcpData.server && c.tool === mcpData.tool && c.status === 'start'
        )
        if (existing && mcpData.status !== 'start') {
          Object.assign(existing, mcpData)
        } else if (!existing) {
          lastMessage.mcpCalls.push(mcpData)
        }
      }
    },
    handleDone(data) {
      const lastMessage = this.messages[this.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.thinking = false
        lastMessage.status = 'sent'
        if (data.usage) {
          lastMessage.usage = data.usage
        }
      }
      this.isLoading = false
      this.scrollToBottom()
    },
    handleError(error) {
      const lastMessage = this.messages[this.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.thinking = false
        lastMessage.error = error.message || 'An error occurred'
        lastMessage.status = 'error'
      }
      this.isLoading = false
      this.scrollToBottom()
    },
    handleReconnect() {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
        this.reconnectTimer = setTimeout(() => {
          console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`)
          this.connectWebSocket()
        }, delay)
      }
    },
    closeWebSocket() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    },
    sendMessage() {
      const text = this.inputMessage.trim()
      if (!text) return

      this.messages.push({
        role: 'user',
        text: text,
        timestamp: Date.now(),
        status: 'sent'
      })

      this.messages.push({
        role: 'assistant',
        text: '',
        thinking: true,
        timestamp: Date.now(),
        status: 'receiving'
      })

      this.inputMessage = ''
      this.isLoading = true
      this.scrollToBottom()

      if (this.ws && this.ws.readyState === 0) {
        setTimeout(() => {
          this.sendViaWebSocket(text)
        }, 500)
      } else {
        this.sendViaWebSocket(text)
      }
    },
    sendViaWebSocket(text) {
      if (this.ws && this.ws.readyState === 1) {
        const history = this.messages
          .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.thinking))
          .slice(0, -2)
          .map(m => ({
            role: m.role,
            text: m.text
          }))

        this.ws.send({
          data: JSON.stringify({
            message: text,
            conversationHistory: history
          }),
          fail: (err) => {
            console.error('Failed to send message:', err)
            this.handleSendError()
          }
        })
      } else {
        console.warn('WebSocket not ready, falling back to HTTP')
        this.sendViaHttp(text)
      }
    },
    async sendViaHttp(text) {
      try {
        const history = this.messages
          .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.thinking))
          .slice(0, -2)
          .map(m => ({
            role: m.role,
            content: m.text
          }))

        const response = await uni.request({
          url: `${this.baseUrl}/api/chat`,
          method: 'POST',
          header: {
            'Content-Type': 'application/json'
          },
          data: {
            message: text,
            history: history
          }
        })

        if (response.data && response.data.text) {
          const lastMessage = this.messages[this.messages.length - 1]
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.text = response.data.text
            lastMessage.thinking = false
            lastMessage.status = 'sent'
            if (response.data.usage) {
              lastMessage.usage = response.data.usage
            }
          }
        } else {
          this.handleSendError()
        }
      } catch (error) {
        console.error('HTTP request failed:', error)
        this.handleSendError()
      } finally {
        this.isLoading = false
        this.scrollToBottom()
      }
    },
    handleSendError() {
      const lastMessage = this.messages[this.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.thinking = false
        lastMessage.error = 'Failed to send message. Please check your connection.'
        lastMessage.status = 'error'
      }
      this.isLoading = false
      this.scrollToBottom()
    },
    clearInput() {
      this.inputMessage = ''
    },
    scrollToBottom() {
      this.$nextTick(() => {
        this.scrollIntoView = 'scroll-bottom'
        setTimeout(() => {
          this.scrollIntoView = ''
        }, 100)
      })
    },
    loadMoreHistory() {
      console.log('Loading more history...')
    },
    goBack() {
      uni.navigateBack()
    },
    formatMessage(text) {
      if (!text) return ''
      return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
    },
    formatInputValue(value) {
      if (typeof value === 'object') {
        return JSON.stringify(value).substring(0, 50)
      }
      return String(value).substring(0, 50)
    },
    formatTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    }
  }
}
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f7f8fa;
}

.chat-header {
  display: flex;
  align-items: center;
  padding: 44px 16px 16px 16px;
  background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
  box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);
}

.header-left, .header-right {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #c53030;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(197, 48, 48, 0.4);
}

.ai-avatar-small {
  width: 36px;
  height: 36px;
  background: #e53e3e;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-info {
  display: flex;
  flex-direction: column;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.header-status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.chat-messages {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
}

.empty-icon-wrapper {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(229, 62, 62, 0.4);
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a202c;
  margin-bottom: 8px;
}

.empty-subtitle {
  font-size: 14px;
  color: #718096;
}

.message-wrapper {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  animation: fadeInUp 0.3s ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-wrapper.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-avatar-small {
  background: #e53e3e;
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.4);
}

.message-bubble-container {
  max-width: 75%;
  display: flex;
  flex-direction: column;
}

.message-wrapper.user .message-bubble-container {
  align-items: flex-end;
}

.message-bubble {
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.5;
  word-wrap: break-word;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-bubble.user {
  background: #e53e3e;
  color: white;
  border-bottom-right-radius: 4px;
}

.message-bubble.assistant {
  background: white;
  color: #1a202c;
  border-bottom-left-radius: 4px;
}

.message-bubble.error {
  background: #fee2e2;
  color: #991b1b;
}

.message-content {
  white-space: pre-wrap;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.thinking-dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e53e3e;
  animation: bounce 1.4s infinite ease-in-out both;
}

.thinking-dots .dot:nth-child(1) { animation-delay: -0.32s; }
.thinking-dots .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.thinking-text {
  font-size: 13px;
  color: #e53e3e;
}

.mcp-calls {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-call-item {
  background: #f7fafc;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.mcp-call-item.success {
  border-left: 3px solid #48bb78;
}

.mcp-call-item.error {
  border-left: 3px solid #f56565;
  background: #fff5f5;
}

.mcp-call-item.start {
  border-left: 3px solid #e53e3e;
}

.mcp-call-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.mcp-tool-name {
  font-weight: 500;
  color: #4a5568;
  font-family: monospace;
}

.mcp-call-input {
  font-size: 11px;
  color: #718096;
  margin-top: 4px;
}

.error-display {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: #fee2e2;
  border-radius: 8px;
  margin-top: 8px;
}

.error-text {
  font-size: 13px;
  color: #991b1b;
}

.usage-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.usage-text {
  font-size: 11px;
  color: #a0aec0;
}

.message-time {
  font-size: 11px;
  color: #a0aec0;
  margin-top: 4px;
  padding: 0 4px;
}

.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.loading-dots {
  display: flex;
  gap: 6px;
}

.loading-dots .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e53e3e;
  animation: loadingBounce 1.4s infinite ease-in-out both;
}

.loading-dots .dot:nth-child(1) { animation-delay: -0.32s; }
.loading-dots .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes loadingBounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.chat-input-area {
  background: white;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: #f7fafc;
  border-radius: 24px;
  padding: 8px 12px;
}

.input-field {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  line-height: 1.5;
  max-height: 100px;
  padding: 6px 0;
}

.input-field:focus {
  outline: none;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn, .send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.action-btn {
  background: transparent;
}

.send-btn {
  background: #e2e8f0;
}

.send-btn.active {
  background: #e53e3e;
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.4);
}

.input-hint {
  text-align: center;
  margin-top: 8px;
}

.hint-text {
  font-size: 11px;
  color: #a0aec0;
}
</style>
