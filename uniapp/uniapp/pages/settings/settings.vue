<template>
  <view class="settings-container">
    <view class="settings-header">
      <view class="header-left" @tap="goBack">
        <uni-icons type="back" size="24" color="#ffffff"></uni-icons>
      </view>
      <text class="header-title">{{ t('settings') }}</text>
      <view class="header-right"></view>
    </view>

    <view class="settings-content">
      <view class="settings-section">
        <text class="section-title">{{ t('connection') }}</text>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('serverUrl') }}</text>
            <text class="setting-value">{{ serverUrl }}</text>
          </view>
          <uni-icons type="compose" size="20" color="#e53e3e"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('connectionStatus') }}</text>
            <text class="setting-value" :class="{ online: isConnected }">
              {{ isConnected ? t('connected') : t('disconnected') }}
            </text>
          </view>
          <view class="status-indicator" :class="{ online: isConnected }"></view>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('autoReconnect') }}</text>
            <text class="setting-description">{{ t('autoReconnectDesc') }}</text>
          </view>
          <switch
            :checked="autoReconnect"
            @change="onAutoReconnectChange"
            color="#e53e3e"
          />
        </view>
      </view>

      <view class="settings-section">
        <text class="section-title">{{ t('appearance') }}</text>

        <view class="setting-item" @tap="changeLanguage">
          <view class="setting-info">
            <text class="setting-label">{{ t('language') }}</text>
            <text class="setting-value">{{ currentLanguageName }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('theme') }}</text>
            <text class="setting-value">{{ t('redTheme') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('fontSize') }}</text>
            <text class="setting-value">{{ t('medium') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('showTimestamps') }}</text>
            <text class="setting-description">{{ t('showTimestampsDesc') }}</text>
          </view>
          <switch
            :checked="showTimestamps"
            @change="onShowTimestampsChange"
            color="#e53e3e"
          />
        </view>
      </view>

      <view class="settings-section">
        <text class="section-title">{{ t('aiConfig') }}</text>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('activeModel') }}</text>
            <text class="setting-value">{{ activeModel || t('default') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('temperature') }}</text>
            <text class="setting-value">{{ temperature }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('maxTokens') }}</text>
            <text class="setting-value">{{ maxTokens }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>
      </view>

      <view class="settings-section">
        <text class="section-title">{{ t('dataPrivacy') }}</text>

        <view class="setting-item" @tap="clearHistory">
          <view class="setting-info">
            <text class="setting-label">{{ t('clearHistory') }}</text>
            <text class="setting-description">{{ t('clearHistoryDesc') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('exportData') }}</text>
            <text class="setting-description">{{ t('exportDataDesc') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>
      </view>

      <view class="settings-section">
        <text class="section-title">{{ t('about') }}</text>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('appVersion') }}</text>
            <text class="setting-value">1.0.0</text>
          </view>
        </view>

        <view class="setting-item">
          <view class="setting-info">
            <text class="setting-label">{{ t('backendVersion') }}</text>
            <text class="setting-value">{{ backendVersion || t('unknown') }}</text>
          </view>
        </view>

        <view class="setting-item" @tap="openDocumentation">
          <view class="setting-info">
            <text class="setting-label">{{ t('documentation') }}</text>
            <text class="setting-description">{{ t('documentationDesc') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>
      </view>

      <view class="settings-section">
        <view class="setting-item danger" @tap="showDebugInfo">
          <view class="setting-info">
            <text class="setting-label">{{ t('debugInfo') }}</text>
            <text class="setting-description">{{ t('debugInfoDesc') }}</text>
          </view>
          <uni-icons type="arrowright" size="20" color="#cbd5e0"></uni-icons>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      serverUrl: 'http://localhost:17870',
      isConnected: false,
      autoReconnect: true,
      showTimestamps: true,
      activeModel: '',
      temperature: 0.7,
      maxTokens: 4096,
      backendVersion: '',
      currentLanguage: 'en',
      languages: [
        { code: 'en', name: 'English' },
        { code: 'zh-CN', name: '简体中文' },
        { code: 'zh-TW', name: '繁體中文' },
        { code: 'ja', name: '日本語' },
        { code: 'ko', name: '한국어' }
      ],
      translations: {
        'en': {
          'settings': 'Settings',
          'connection': 'Connection',
          'serverUrl': 'Server URL',
          'connectionStatus': 'Connection Status',
          'connected': 'Connected',
          'disconnected': 'Disconnected',
          'autoReconnect': 'Auto Reconnect',
          'autoReconnectDesc': 'Automatically reconnect when connection is lost',
          'appearance': 'Appearance',
          'language': 'Language',
          'theme': 'Theme',
          'redTheme': 'Red Minimal',
          'fontSize': 'Font Size',
          'medium': 'Medium',
          'showTimestamps': 'Show Timestamps',
          'showTimestampsDesc': 'Display time for each message',
          'aiConfig': 'AI Configuration',
          'activeModel': 'Active Model',
          'default': 'Default',
          'temperature': 'Temperature',
          'maxTokens': 'Max Tokens',
          'dataPrivacy': 'Data & Privacy',
          'clearHistory': 'Clear Chat History',
          'clearHistoryDesc': 'Remove all conversation history',
          'exportData': 'Export Data',
          'exportDataDesc': 'Download your chat history',
          'about': 'About',
          'appVersion': 'App Version',
          'backendVersion': 'Backend Version',
          'unknown': 'Unknown',
          'documentation': 'Documentation',
          'documentationDesc': 'Learn how to use CrabClaw',
          'debugInfo': 'Debug Information',
          'debugInfoDesc': 'View technical details',
          'settingUpdated': 'Setting updated',
          'historyCleared': 'History cleared',
          'openingDoc': 'Opening documentation...',
          'copied': 'Copied to clipboard',
          'clearHistoryConfirm': 'Are you sure you want to clear all chat history? This cannot be undone.'
        },
        'zh-CN': {
          'settings': '设置',
          'connection': '连接',
          'serverUrl': '服务器地址',
          'connectionStatus': '连接状态',
          'connected': '已连接',
          'disconnected': '未连接',
          'autoReconnect': '自动重连',
          'autoReconnectDesc': '连接断开时自动重连',
          'appearance': '外观',
          'language': '语言',
          'theme': '主题',
          'redTheme': '简约红',
          'fontSize': '字体大小',
          'medium': '中等',
          'showTimestamps': '显示时间戳',
          'showTimestampsDesc': '显示每条消息的时间',
          'aiConfig': 'AI 配置',
          'activeModel': '当前模型',
          'default': '默认',
          'temperature': 'Temperature',
          'maxTokens': '最大 Token 数',
          'dataPrivacy': '数据与隐私',
          'clearHistory': '清除聊天记录',
          'clearHistoryDesc': '删除所有对话历史',
          'exportData': '导出数据',
          'exportDataDesc': '下载您的聊天记录',
          'about': '关于',
          'appVersion': '应用版本',
          'backendVersion': '后端版本',
          'unknown': '未知',
          'documentation': '文档',
          'documentationDesc': '了解如何使用 CrabClaw',
          'debugInfo': '调试信息',
          'debugInfoDesc': '查看技术细节',
          'settingUpdated': '设置已更新',
          'historyCleared': '历史记录已清除',
          'openingDoc': '正在打开文档...',
          'copied': '已复制到剪贴板',
          'clearHistoryConfirm': '确定要清除所有聊天记录吗？此操作无法撤销。'
        },
        'zh-TW': {
          'settings': '設置',
          'connection': '連接',
          'serverUrl': '服務器地址',
          'connectionStatus': '連接狀態',
          'connected': '已連接',
          'disconnected': '未連接',
          'autoReconnect': '自動重連',
          'autoReconnectDesc': '連接斷開時自動重連',
          'appearance': '外觀',
          'language': '語言',
          'theme': '主題',
          'redTheme': '簡約紅',
          'fontSize': '字體大小',
          'medium': '中等',
          'showTimestamps': '顯示時間戳',
          'showTimestampsDesc': '顯示每條消息的時間',
          'aiConfig': 'AI 配置',
          'activeModel': '當前模型',
          'default': '默認',
          'temperature': 'Temperature',
          'maxTokens': '最大 Token 數',
          'dataPrivacy': '數據與隱私',
          'clearHistory': '清除聊天記錄',
          'clearHistoryDesc': '刪除所有對話歷史',
          'exportData': '導出數據',
          'exportDataDesc': '下載您的聊天記錄',
          'about': '關於',
          'appVersion': '應用版本',
          'backendVersion': '後端版本',
          'unknown': '未知',
          'documentation': '文檔',
          'documentationDesc': '了解如何使用 CrabClaw',
          'debugInfo': '調試信息',
          'debugInfoDesc': '查看技術細節',
          'settingUpdated': '設置已更新',
          'historyCleared': '歷史記錄已清除',
          'openingDoc': '正在打開文檔...',
          'copied': '已複製到剪貼板',
          'clearHistoryConfirm': '確定要清除所有聊天記錄嗎？此操作無法撤銷。'
        },
        'ja': {
          'settings': '設定',
          'connection': '接続',
          'serverUrl': 'サーバーURL',
          'connectionStatus': '接続状態',
          'connected': '接続済み',
          'disconnected': '未接続',
          'autoReconnect': '自動再接続',
          'autoReconnectDesc': '接続が切れた時に自動再接続',
          'appearance': '外観',
          'language': '言語',
          'theme': 'テーマ',
          'redTheme': 'シンプルレッド',
          'fontSize': 'フォントサイズ',
          'medium': '中',
          'showTimestamps': 'タイムスタンプを表示',
          'showTimestampsDesc': '各メッセージの時間を表示',
          'aiConfig': 'AI設定',
          'activeModel': 'アクティブモデル',
          'default': 'デフォルト',
          'temperature': 'Temperature',
          'maxTokens': '最大トークン数',
          'dataPrivacy': 'データとプライバシー',
          'clearHistory': 'チャット履歴を消去',
          'clearHistoryDesc': 'すべての会話履歴を削除',
          'exportData': 'データをエクスポート',
          'exportDataDesc': 'チャット履歴をダウンロード',
          'about': 'について',
          'appVersion': 'アプリバージョン',
          'backendVersion': 'バックエンドバージョン',
          'unknown': '不明',
          'documentation': 'ドキュメント',
          'documentationDesc': 'CrabClawの使用方法を学ぶ',
          'debugInfo': 'デバッグ情報',
          'debugInfoDesc': '技術詳細を表示',
          'settingUpdated': '設定が更新されました',
          'historyCleared': '履歴がクリアされました',
          'openingDoc': 'ドキュメントを開いています...',
          'copied': 'クリップボードにコピーしました',
          'clearHistoryConfirm': 'すべてのチャット履歴を消去してもよろしいですか？この操作は元に戻せません。'
        },
        'ko': {
          'settings': '설정',
          'connection': '연결',
          'serverUrl': '서버 URL',
          'connectionStatus': '연결 상태',
          'connected': '연결됨',
          'disconnected': '연결 안됨',
          'autoReconnect': '자동 재연결',
          'autoReconnectDesc': '연결이 끊어지면 자동으로 재연결',
          'appearance': '모양',
          'language': '언어',
          'theme': '테마',
          'redTheme': '심플 레드',
          'fontSize': '글꼴 크기',
          'medium': '중간',
          'showTimestamps': '타임스탬프 표시',
          'showTimestampsDesc': '각 메시지의 시간을 표시',
          'aiConfig': 'AI 설정',
          'activeModel': '활성 모델',
          'default': '기본',
          'temperature': 'Temperature',
          'maxTokens': '최대 토큰 수',
          'dataPrivacy': '데이터 및 개인 정보',
          'clearHistory': '채팅 기록 지우기',
          'clearHistoryDesc': '모든 대화 기록 삭제',
          'exportData': '데이터 내보내기',
          'exportDataDesc': '채팅 기록 다운로드',
          'about': '정보',
          'appVersion': '앱 버전',
          'backendVersion': '백엔드 버전',
          'unknown': '알 수 없음',
          'documentation': '문서',
          'documentationDesc': 'CrabClaw 사용 방법 알아보기',
          'debugInfo': '디버그 정보',
          'debugInfoDesc': '기술 세부 정보 보기',
          'settingUpdated': '설정이 업데이트되었습니다',
          'historyCleared': '기록이 삭제되었습니다',
          'openingDoc': '문서를 여는 중...',
          'copied': '클립보드에 복사되었습니다',
          'clearHistoryConfirm': '모든 채팅 기록을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.'
        }
      }
    }
  },
  computed: {
    currentLanguageName() {
      const lang = this.languages.find(l => l.code === this.currentLanguage)
      return lang ? lang.name : 'English'
    }
  },
  onLoad() {
    this.loadSettings()
    this.checkConnection()
    this.fetchBackendInfo()
  },
  methods: {
    t(key) {
      return this.translations[this.currentLanguage]?.[key] || this.translations['en'][key] || key
    },
    changeLanguage() {
      const actionList = this.languages.map(lang => lang.name)
      
      uni.showActionSheet({
        itemList: actionList,
        success: (res) => {
          const selectedLang = this.languages[res.tapIndex]
          this.currentLanguage = selectedLang.code
          this.saveSettings()
          uni.showToast({
            title: this.t('settingUpdated'),
            icon: 'success'
          })
        }
      })
    },
    checkConnection() {
      uni.request({
        url: `${this.serverUrl}/health`,
        method: 'GET',
        success: (res) => {
          if (res.data && res.data.status === 'ok') {
            this.isConnected = true
            if (res.data.version) {
              this.backendVersion = res.data.version
            }
          } else {
            this.isConnected = false
          }
        },
        fail: () => {
          this.isConnected = false
        }
      })
    },
    loadSettings() {
      const settings = uni.getStorageSync('app_settings')
      if (settings) {
        this.autoReconnect = settings.autoReconnect !== false
        this.showTimestamps = settings.showTimestamps !== false
        if (settings.serverUrl) {
          this.serverUrl = settings.serverUrl
        }
        if (settings.currentLanguage) {
          this.currentLanguage = settings.currentLanguage
        }
      }
    },
    saveSettings() {
      uni.setStorageSync('app_settings', {
        autoReconnect: this.autoReconnect,
        showTimestamps: this.showTimestamps,
        serverUrl: this.serverUrl,
        currentLanguage: this.currentLanguage
      })
    },
    onAutoReconnectChange(e) {
      this.autoReconnect = e.detail.value
      this.saveSettings()
      uni.showToast({
        title: this.t('settingUpdated'),
        icon: 'success'
      })
    },
    onShowTimestampsChange(e) {
      this.showTimestamps = e.detail.value
      this.saveSettings()
      uni.showToast({
        title: this.t('settingUpdated'),
        icon: 'success'
      })
    },
    fetchBackendInfo() {
      uni.request({
        url: `${this.serverUrl}/api/config`,
        method: 'GET',
        success: (res) => {
          if (res.data && res.data.data) {
            const config = res.data.data
            if (config.models && config.models.length > 0) {
              const activeModel = config.models.find(m => m.id === config.settings?.activeModelId)
              if (activeModel) {
                this.activeModel = activeModel.name
              }
            }
          }
        },
        fail: () => {
          console.log('Failed to fetch config')
        }
      })
    },
    clearHistory() {
      uni.showModal({
        title: this.t('clearHistory'),
        content: this.t('clearHistoryConfirm'),
        confirmColor: '#e53e3e',
        success: (res) => {
          if (res.confirm) {
            uni.showToast({
              title: this.t('historyCleared'),
              icon: 'success'
            })
          }
        }
      })
    },
    openDocumentation() {
      uni.showToast({
        title: this.t('openingDoc'),
        icon: 'none'
      })
    },
    showDebugInfo() {
      const debugInfo = `
Server URL: ${this.serverUrl}
Connection: ${this.isConnected ? 'Online' : 'Offline'}
Backend Version: ${this.backendVersion || 'Unknown'}
Language: ${this.currentLanguageName}
Platform: ${uni.getSystemInfoSync().platform}
App Version: 1.0.0
      `.trim()

      uni.showModal({
        title: this.t('debugInfo'),
        content: debugInfo,
        showCancel: false,
        confirmText: 'Copy',
        success: (res) => {
          if (res.confirm) {
            uni.setClipboardData({
              data: debugInfo,
              success: () => {
                uni.showToast({
                  title: this.t('copied'),
                  icon: 'success'
                })
              }
            })
          }
        }
      })
    },
    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style scoped>
.settings-container {
  min-height: 100vh;
  background: #ffffff;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 50px 16px 20px 16px;
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

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: white;
}

.settings-content {
  padding: 20px 16px;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #e53e3e;
  margin-bottom: 12px;
  padding-left: 4px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.2s ease;
}

.setting-item:active {
  transform: scale(0.98);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.setting-item.danger {
  border-left: 3px solid #e53e3e;
}

.setting-info {
  flex: 1;
}

.setting-label {
  font-size: 16px;
  font-weight: 500;
  color: #1a202c;
  display: block;
  margin-bottom: 4px;
}

.setting-value {
  font-size: 14px;
  color: #a0aec0;
  display: block;
}

.setting-value.online {
  color: #48bb78;
}

.setting-description {
  font-size: 12px;
  color: #a0aec0;
  display: block;
  margin-top: 4px;
}
</style>
