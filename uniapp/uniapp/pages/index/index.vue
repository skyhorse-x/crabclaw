<template>
  <view class="home-container">
    <view class="hero-section">
      <view class="hero-header">
        <view class="logo-section">
          <view class="app-logo">
            <text class="logo-icon">🦀</text>
          </view>
          <view class="app-info">
            <text class="app-name">CrabClaw</text>
            <text class="app-tagline">AI Agent Studio</text>
          </view>
        </view>
        <view class="settings-btn" @tap="goToSettings">
          <uni-icons type="settings" size="24" color="#ffffff"></uni-icons>
        </view>
      </view>

      <view class="status-bar">
        <view class="status-indicator" :class="{ online: isConnected }"></view>
        <text class="status-text">{{ isConnected ? 'Connected' : 'Connecting...' }}</text>
      </view>
    </view>

    <view class="main-content">
      <view class="quick-actions">
        <view class="action-card" @tap="startNewChat">
          <view class="action-icon-wrapper primary">
            <uni-icons type="chat" size="28" color="#ffffff"></uni-icons>
          </view>
          <text class="action-title">New Chat</text>
          <text class="action-subtitle">Start a conversation</text>
        </view>

        <view class="action-card" @tap="openAgents">
          <view class="action-icon-wrapper secondary">
            <uni-icons type="staff" size="28" color="#ffffff"></uni-icons>
          </view>
          <text class="action-title">Agents</text>
          <text class="action-subtitle">Manage AI agents</text>
        </view>

        <view class="action-card" @tap="openTasks">
          <view class="action-icon-wrapper tertiary">
            <uni-icons type="calendar" size="28" color="#ffffff"></uni-icons>
          </view>
          <text class="action-title">Tasks</text>
          <text class="action-subtitle">View scheduled tasks</text>
        </view>

        <view class="action-card" @tap="openSkills">
          <view class="action-icon-wrapper quaternary">
            <uni-icons type="gear" size="28" color="#ffffff"></uni-icons>
          </view>
          <text class="action-title">Skills</text>
          <text class="action-subtitle">AI capabilities</text>
        </view>
      </view>

      <view class="recent-chats">
        <view class="section-header">
          <text class="section-title">Recent Conversations</text>
          <text class="section-action" @tap="viewAllChats">View All</text>
        </view>

        <view v-if="recentChats.length === 0" class="empty-chats">
          <uni-icons type="chatboxes" size="48" color="#e53e3e"></uni-icons>
          <text class="empty-text">No recent conversations</text>
          <text class="empty-hint">Start chatting to see your history here</text>
        </view>

        <view
          v-for="(chat, index) in recentChats"
          :key="index"
          class="chat-item"
          @tap="openChat(chat)"
        >
          <view class="chat-avatar">
            <uni-icons type="staff" size="24" color="#ffffff"></uni-icons>
          </view>
          <view class="chat-info">
            <text class="chat-title">{{ chat.title }}</text>
            <text class="chat-preview">{{ chat.lastMessage }}</text>
          </view>
          <view class="chat-meta">
            <text class="chat-time">{{ formatTime(chat.timestamp) }}</text>
            <view v-if="chat.unread" class="unread-badge">
              <text>{{ chat.unread }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="system-status">
        <view class="status-card">
          <view class="status-icon-wrapper">
            <uni-icons type="info" size="22" color="#ffffff"></uni-icons>
          </view>
          <view class="status-details">
            <text class="status-label">System Status</text>
            <text class="status-value">All systems operational</text>
          </view>
          <view class="status-indicator-small" :class="{ healthy: systemHealthy }"></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      isConnected: false,
      systemHealthy: true,
      recentChats: [
        {
          id: 1,
          title: 'AI Assistant',
          lastMessage: 'Hello! How can I help you today?',
          timestamp: Date.now() - 3600000,
          unread: 2,
          avatar: 'AI'
        }
      ]
    }
  },
  onLoad() {
    this.checkConnection()
  },
  onShow() {
    this.checkConnection()
  },
  methods: {
    checkConnection() {
      uni.request({
        url: 'http://localhost:17870/health',
        method: 'GET',
        success: (res) => {
          if (res.data && res.data.status === 'ok') {
            this.isConnected = true
            this.systemHealthy = true
          } else {
            this.isConnected = false
            this.systemHealthy = false
          }
        },
        fail: () => {
          this.isConnected = false
          this.systemHealthy = false
        }
      })
    },
    startNewChat() {
      uni.navigateTo({
        url: '/pages/chat/chat'
      })
    },
    openAgents() {
      uni.showToast({
        title: 'Agents feature coming soon',
        icon: 'none'
      })
    },
    openTasks() {
      uni.showToast({
        title: 'Tasks feature coming soon',
        icon: 'none'
      })
    },
    openSkills() {
      uni.showToast({
        title: 'Skills feature coming soon',
        icon: 'none'
      })
    },
    openChat(chat) {
      uni.navigateTo({
        url: '/pages/chat/chat'
      })
    },
    viewAllChats() {
      uni.showToast({
        title: 'All chats feature coming soon',
        icon: 'none'
      })
    },
    goToSettings() {
      uni.navigateTo({
        url: '/pages/settings/settings'
      })
    },
    formatTime(timestamp) {
      if (!timestamp) return ''
      const now = Date.now()
      const diff = now - timestamp
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)

      if (minutes < 1) return 'Just now'
      if (minutes < 60) return `${minutes}m ago`
      if (hours < 24) return `${hours}h ago`
      if (days < 7) return `${days}d ago`
      return new Date(timestamp).toLocaleDateString()
    }
  }
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #e53e3e 0%, #c53030 100%);
}

.hero-section {
  padding: 50px 20px 30px 20px;
}

.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-logo {
  width: 50px;
  height: 50px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.logo-icon {
  font-size: 28px;
}

.app-info {
  display: flex;
  flex-direction: column;
}

.app-name {
  font-size: 24px;
  font-weight: bold;
  color: white;
}

.app-tagline {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.settings-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-btn:active {
  transform: scale(0.95);
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fc8181;
  box-shadow: 0 0 8px rgba(252, 129, 129, 0.6);
  animation: pulse 2s infinite;
}

.status-indicator.online {
  background: #68d391;
  box-shadow: 0 0 8px rgba(104, 211, 145, 0.6);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.status-text {
  font-size: 14px;
  color: white;
}

.main-content {
  background: #ffffff;
  border-radius: 30px 30px 0 0;
  padding: 30px 20px;
  min-height: calc(100vh - 200px);
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 30px;
}

.action-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-card:active {
  transform: scale(0.98);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.action-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.action-icon-wrapper.primary {
  background: #e53e3e;
  box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);
}

.action-icon-wrapper.secondary {
  background: #c53030;
  box-shadow: 0 4px 12px rgba(197, 48, 48, 0.3);
}

.action-icon-wrapper.tertiary {
  background: #9b2c2c;
  box-shadow: 0 4px 12px rgba(155, 44, 44, 0.3);
}

.action-icon-wrapper.quaternary {
  background: #742a2a;
  box-shadow: 0 4px 12px rgba(116, 42, 42, 0.3);
}

.action-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a202c;
}

.action-subtitle {
  font-size: 12px;
  color: #718096;
}

.recent-chats {
  margin-bottom: 30px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
}

.section-action {
  font-size: 14px;
  color: #e53e3e;
  cursor: pointer;
}

.empty-chats {
  text-align: center;
  padding: 30px 20px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.empty-text {
  font-size: 15px;
  color: #4a5568;
  display: block;
  margin-top: 12px;
  margin-bottom: 6px;
}

.empty-hint {
  font-size: 13px;
  color: #a0aec0;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-item:active {
  transform: scale(0.98);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.chat-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #e53e3e;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a202c;
  display: block;
  margin-bottom: 4px;
}

.chat-preview {
  font-size: 13px;
  color: #a0aec0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.chat-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.chat-time {
  font-size: 11px;
  color: #a0aec0;
}

.unread-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #e53e3e;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}

.unread-badge text {
  font-size: 11px;
  font-weight: 600;
  color: white;
}

.system-status {
  margin-top: 10px;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.status-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #48bb78;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-details {
  flex: 1;
}

.status-label {
  font-size: 14px;
  font-weight: 600;
  color: #1a202c;
  display: block;
  margin-bottom: 4px;
}

.status-value {
  font-size: 12px;
  color: #48bb78;
}

.status-indicator-small {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #48bb78;
  box-shadow: 0 0 8px rgba(72, 187, 120, 0.6);
}

.status-indicator-small.healthy {
  background: #48bb78;
}
</style>
