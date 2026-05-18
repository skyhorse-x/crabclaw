<template>
  <div class="settings-panel">
      <div class="panel-header">
        <div class="panel-header-left">
          <h3>{{ t('controlPanelTitle') }}</h3>
          <p class="panel-desc">{{ t('controlPanelDesc') }}</p>
        </div>
      </div>

      <div class="control-global-card">
        <div class="control-global-main">
          <div class="control-global-title">{{ t('controlGlobalEnable') }}</div>
          <el-switch v-model="remoteControlConfig.enabled" />
          <span class="control-proxy-label">代理</span>
          <el-switch v-model="remoteControlConfig.proxyEnabled" class="control-proxy-switch" />
        </div>
        <div class="control-global-row">
          <el-input v-model="remoteControlConfig.commandPrefix" :placeholder="t('controlCommandPrefix')">
            <template #prepend>{{ t('controlCommandPrefix') }}</template>
          </el-input>
        </div>
        <div class="control-global-row">
          <el-input v-model="remoteControlConfig.verifyCode" :placeholder="t('controlVerifyCode')">
            <template #prepend>{{ t('controlVerifyCode') }}</template>
          </el-input>
          <el-input :model-value="remoteControlWebhookUrl" readonly>
            <template #prepend>{{ t('controlWebhookUrl') }}</template>
          </el-input>
          <el-button size="small" @click="copyMessageText(remoteControlWebhookUrl)">{{ t('copyMessage') }}</el-button>
        </div>
      </div>

      <el-tabs type="border-card" class="platform-tabs">
        <el-tab-pane name="telegram">
          <template #label>
            <span class="platform-tab-label">
              <span>{{ t('controlChannelTelegram') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.telegram.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlBotToken')">
                <el-input v-model="remoteControlConfig.telegram.botToken" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlChatId')">
                <el-input v-model="remoteControlConfig.telegram.chatId" />
              </el-form-item>
              <el-form-item :label="t('controlTestMessage')">
                <el-input v-model="telegramTestMessage" :placeholder="t('controlTestMessagePlaceholder') || '输入测试消息内容'" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="sendTestToTelegram" :loading="sendingToTelegram">
                  {{ t('controlSendTest') || '发送测试' }}
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="qq">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon qq-icon">Q</span>
              <span>{{ t('controlChannelQq') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.qq.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlBotId')">
                <el-input v-model="remoteControlConfig.qq.botId" />
              </el-form-item>
              <el-form-item :label="t('controlAppSecret')">
                <el-input v-model="remoteControlConfig.qq.appSecret" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlWebhook')">
                <el-input v-model="remoteControlConfig.qq.webhook" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="wechat">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon wechat-icon">微</span>
              <span>{{ t('controlChannelWechat') || '企业微信' }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.wechat.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlWebhook')">
                <el-input v-model="remoteControlConfig.wechat.webhook" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="wechat-personal">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon wechat-personal-icon">信</span>
              <span>{{ '个人微信' }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="wechat-personal-login-section">
              <div v-if="wechatAccounts.length === 0 && !wechatQrCodeUrl" class="wechat-personal-empty">
                <p style="color:#94a3b8;margin-bottom:16px;">扫码登录个人微信，接收消息并控制 Agent</p>
                <el-button type="primary" size="large" @click="startWechatLogin" :loading="wechatLoginLoading">
                  扫码登录微信
                </el-button>
              </div>

              <div v-if="wechatQrCodeUrl" class="wechat-personal-qrcode">
                <img :src="wechatQrCodeUrl" alt="微信登录二维码" style="width:200px;height:200px;border:1px solid #e2e8f0;border-radius:8px;" />
                <p style="color:#94a3b8;font-size:13px;margin-top:8px;">请用微信扫码登录</p>
                <p v-if="wechatLoginStatus === 'waiting'" style="color:#f59e0b;font-size:12px;">
                  <el-icon style="font-size:12px"><LoadingIcon /></el-icon> 等待扫码...
                </p>
                <p v-else-if="wechatLoginStatus === 'success'" style="color:#10b981;font-size:12px;">登录成功</p>
                <el-button size="small" @click="cancelWechatLogin" style="margin-top:8px;">取消</el-button>
              </div>

              <div v-if="wechatAccounts.length > 0" class="wechat-personal-accounts">
                <div class="wechat-personal-accounts-header">
                  <span>已登录账号 ({{ wechatAccounts.length }})</span>
                  <el-button size="small" type="primary" plain @click="startWechatLogin" :loading="wechatLoginLoading">添加账号</el-button>
                </div>
                <div v-for="acc in wechatAccounts" :key="acc.wxid" class="wechat-personal-account-item">
                  <div class="wechat-personal-account-info">
                    <span class="wechat-personal-account-nickname">{{ acc.nickname }}</span>
                    <span class="wechat-personal-account-wxid">{{ acc.wxid }}</span>
                  </div>
                  <el-button size="small" type="danger" plain @click="logoutWechatAccount(acc.wxid)">登出</el-button>
                </div>
              </div>
            </div>

            <el-divider />

            <div v-if="wechatAccounts.length > 0" class="wechat-received-section">
              <div class="wechat-received-header">
                <span>接收的消息</span>
                <el-button size="small" @click="fetchWechatStatus" :disabled="wechatMessages.length === 0">
                  <el-icon style="font-size:12px"><Refresh /></el-icon> 刷新
                </el-button>
              </div>
              <div v-if="wechatMessages.length === 0" class="wechat-received-empty">
                <p style="color:#94a3b8;font-size:13px;">暂无消息，请在手机上给 bot 发消息测试</p>
              </div>
              <div v-else class="wechat-received-list">
                <div v-for="(msg, i) in wechatMessages.slice().reverse()" :key="i" class="wechat-received-item">
                  <div class="wechat-received-item-header">
                    <span class="wechat-received-sender">{{ msg.senderName || msg.sender }}</span>
                    <span class="wechat-received-time">{{ formatWechatTime(msg.timestamp) }}</span>
                  </div>
                  <div class="wechat-received-text">{{ msg.text }}</div>
                </div>
              </div>
            </div>

            <el-divider />

            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlTestMessage')">
                <el-input v-model="wechatTestMessage" :placeholder="t('controlTestMessagePlaceholder') || '输入要发送给自己的消息'" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="sendTestToWechat" :loading="wechatSending" :disabled="wechatAccounts.length === 0">
                  {{ t('controlSendTest') || '发送测试' }}
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="feishu">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon feishu-icon">飞</span>
              <span>{{ t('controlChannelFeishu') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.feishu.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlAppId')">
                <el-input v-model="remoteControlConfig.feishu.appId" />
              </el-form-item>
              <el-form-item :label="t('controlAppSecret')">
                <el-input v-model="remoteControlConfig.feishu.appSecret" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlWebhook')">
                <el-input v-model="remoteControlConfig.feishu.webhook" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="discord">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon discord-icon">D</span>
              <span>{{ t('controlChannelDiscord') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.discord.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlBotToken')">
                <el-input v-model="remoteControlConfig.discord.botToken" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlChannelId')">
                <el-input v-model="remoteControlConfig.discord.channelId" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="slack">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon slack-icon">S</span>
              <span>{{ t('controlChannelSlack') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.slack.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlBotToken')">
                <el-input v-model="remoteControlConfig.slack.botToken" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlChannelId')">
                <el-input v-model="remoteControlConfig.slack.channelId" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="teams">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon teams-icon">T</span>
              <span>{{ t('controlChannelTeams') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.teams.enabled" />
            </div>
            <el-form label-width="100px" label-position="left">
              <el-form-item :label="t('controlAppId')">
                <el-input v-model="remoteControlConfig.teams.appId" />
              </el-form-item>
              <el-form-item :label="t('controlAppSecret')">
                <el-input v-model="remoteControlConfig.teams.appSecret" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlWebhook')">
                <el-input v-model="remoteControlConfig.teams.webhook" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="whatsapp">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon whatsapp-icon">W</span>
              <span>{{ t('controlChannelWhatsApp') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="platform-enable-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="remoteControlConfig.whatsapp.enabled" />
            </div>
            <el-form label-width="120px" label-position="left">
              <el-form-item :label="t('controlTwilioSid')">
                <el-input v-model="remoteControlConfig.whatsapp.accountSid" />
              </el-form-item>
              <el-form-item :label="t('controlTwilioToken')">
                <el-input v-model="remoteControlConfig.whatsapp.authToken" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlFromNumber')">
                <el-input v-model="remoteControlConfig.whatsapp.fromNumber" placeholder="+1234567890" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="logs">
          <template #label>
            <span class="platform-tab-label">
              <el-icon><List /></el-icon>
              <span>运行日志</span>
              <el-tag v-if="logStats.total > 0" size="small" type="info" class="log-count-badge">{{ logStats.total }}</el-tag>
            </span>
          </template>
          <div class="log-panel">
            <div class="log-toolbar">
              <div class="log-toolbar-left">
                <el-radio-group v-model="logFilter" size="small">
                  <el-radio-button value="all">全部</el-radio-button>
                  <el-radio-button value="telegram">Telegram</el-radio-button>
                  <el-radio-button value="qq">QQ</el-radio-button>
                  <el-radio-button value="feishu">飞书</el-radio-button>
                  <el-radio-button value="wechat">微信</el-radio-button>
                  <el-radio-button value="discord">Discord</el-radio-button>
                  <el-radio-button value="system">系统</el-radio-button>
                </el-radio-group>
              </div>
              <div class="log-toolbar-right">
                <el-button size="small" @click="refreshLogs" :loading="loadingLogs">
                  <el-icon><Refresh /></el-icon> 刷新
                </el-button>
                <el-button size="small" type="danger" plain @click="clearLogs">
                  <el-icon><Delete /></el-icon> 清空
                </el-button>
              </div>
            </div>
            <div class="log-stats-bar" v-if="logStats.total > 0">
              <span class="log-stat-item">总计: {{ logStats.total }} 条</span>
              <span class="log-stat-item log-stat-info">信息: {{ logStats.byLevel?.info || 0 }}</span>
              <span class="log-stat-item log-stat-success">成功: {{ logStats.byLevel?.success || 0 }}</span>
              <span class="log-stat-item log-stat-warn">警告: {{ logStats.byLevel?.warn || 0 }}</span>
              <span class="log-stat-item log-stat-error">错误: {{ logStats.byLevel?.error || 0 }}</span>
            </div>
            <div class="log-list" ref="logListRef">
              <div v-if="filteredLogs.length === 0" class="log-empty">
                <el-empty description="暂无运行日志" />
              </div>
              <div
                v-for="log in filteredLogs"
                :key="log.id"
                class="log-entry"
                :class="[`log-level-${log.level}`, `log-platform-${log.platform}`]"
              >
                <div class="log-entry-header">
                  <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                  <span class="log-platform-tag" :class="`platform-${log.platform}`">{{ platformLabel(log.platform) }}</span>
                  <span class="log-level-tag" :class="`level-${log.level}`">{{ levelLabel(log.level) }}</span>
                  <span class="log-event-tag">{{ eventLabel(log.event) }}</span>
                </div>
                <div class="log-entry-body">
                  <span class="log-message">{{ log.message }}</span>
                  <span v-if="log.sender" class="log-sender">[{{ log.sender }}]</span>
                </div>
                <div v-if="log.detail" class="log-entry-detail">
                  {{ log.detail }}
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div class="control-footer">
        <el-button type="primary" size="large" @click="saveRemoteControlConfig">{{ t('controlSave') }}</el-button>
      </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Refresh, Delete, Loading as LoadingIcon } from '@element-plus/icons-vue'
import { useApiBase } from '../composables/useApiBase'
import { apiClient } from '../utils/api-client'

const { t } = useI18n()
const { buildApiUrl } = useApiBase()

interface RemoteControlConfig {
  enabled: boolean
  proxyEnabled: boolean
  commandPrefix: string
  verifyCode: string
  telegram: {
    enabled: boolean
    botToken: string
    chatId: string
    proxyEnabled: boolean
  }
  qq: {
    enabled: boolean
    botId: string
    webhook: string
    proxyEnabled: boolean
    appSecret: string
  }
  wechat: {
    enabled: boolean
    webhook: string
    proxyEnabled: boolean
  }
  feishu: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
    proxyEnabled: boolean
  }
  discord: {
    enabled: boolean
    botToken: string
    channelId: string
    proxyEnabled: boolean
  }
  slack: {
    enabled: boolean
    botToken: string
    channelId: string
    proxyEnabled: boolean
  }
  teams: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
    proxyEnabled: boolean
  }
  whatsapp: {
    enabled: boolean
    accountSid: string
    authToken: string
    fromNumber: string
    proxyEnabled: boolean
  }
}

function createDefaultRemoteControlConfig(): RemoteControlConfig {
  return {
    enabled: false,
    proxyEnabled: false,
    commandPrefix: '/agent',
    verifyCode: '',
    telegram: {
      enabled: false,
      botToken: '',
      chatId: '',
      proxyEnabled: false
    },
    qq: {
      enabled: false,
      botId: '',
      webhook: '',
      proxyEnabled: false,
      appSecret: ''
    },
    wechat: {
      enabled: false,
      webhook: '',
      proxyEnabled: false
    },
    feishu: {
      enabled: false,
      appId: '',
      appSecret: '',
      webhook: '',
      proxyEnabled: false
    },
    discord: {
      enabled: false,
      botToken: '',
      channelId: '',
      proxyEnabled: false
    },
    slack: {
      enabled: false,
      botToken: '',
      channelId: '',
      proxyEnabled: false
    },
    teams: {
      enabled: false,
      appId: '',
      appSecret: '',
      webhook: '',
      proxyEnabled: false
    },
    whatsapp: {
      enabled: false,
      accountSid: '',
      authToken: '',
      fromNumber: '',
      proxyEnabled: false
    }
  }
}


const remoteControlConfig = reactive<RemoteControlConfig>(createDefaultRemoteControlConfig())
const remoteControlWebhookUrl = computed(() => buildApiUrl('/api/remote-control/hook'))

const telegramTestMessage = ref('')
const sendingToTelegram = ref(false)

const wechatTestMessage = ref('')
const wechatSending = ref(false)
const wechatLoginLoading = ref(false)
const wechatQrCodeUrl = ref('')
const wechatLoginSession = ref('')
const wechatLoginStatus = ref<'idle' | 'waiting' | 'success'>('idle')
const wechatAccounts = ref<Array<{ wxid: string; nickname: string; loggedInAt: number }>>([])
const wechatMessages = ref<Array<{ sender: string; senderName: string; text: string; timestamp: number; msgType?: string }>>([])
let wechatPollingTimer: ReturnType<typeof setInterval> | null = null

// 日志相关
const logListRef = ref<HTMLElement | null>(null)
const logs = ref<RemoteLogEntry[]>([])
const loadingLogs = ref(false)
const logFilter = ref('all')
const logStats = ref<{ total: number; byLevel: Record<string, number>; byPlatform: Record<string, number> }>({
  total: 0,
  byLevel: {},
  byPlatform: {}
})

// WebSocket 相关
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let isManualClose = false

interface RemoteLogEntry {
  id: string
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  event: string
  platform: string
  message: string
  detail?: string
  sender?: string
}

// 计算属性
const filteredLogs = computed(() => {
  if (logFilter.value === 'all') return logs.value
  if (logFilter.value === 'system') {
    return logs.value.filter(l => l.platform === 'system')
  }
  return logs.value.filter(l => l.platform === logFilter.value)
})

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    telegram: 'Telegram',
    qq: 'QQ',
    feishu: '飞书',
    wechat: '微信',
    discord: 'Discord',
    slack: 'Slack',
    teams: 'Teams',
    whatsapp: 'WhatsApp',
    system: '系统'
  }
  return labels[platform] || platform
}

function levelLabel(level: string): string {
  const labels: Record<string, string> = {
    info: '信息',
    warn: '警告',
    error: '错误',
    success: '成功'
  }
  return labels[level] || level
}

function eventLabel(event: string): string {
  const labels: Record<string, string> = {
    polling_start: '轮询启动',
    polling_stop: '轮询停止',
    polling_error: '轮询错误',
    message_received: '收到消息',
    message_ignored: '忽略消息',
    message_processing: '处理消息',
    message_reply: '回复消息',
    message_reply_error: '回复失败',
    message_broadcast: '广播消息',
    config_updated: '配置更新',
    webhook_received: 'Webhook',
    webhook_error: 'Webhook错误',
    typing_start: '输入提示',
    typing_stop: '输入停止',
    agent_busy: '代理繁忙',
    agent_error: '代理错误',
    agent_abort: '代理中止',
    system: '系统'
  }
  return labels[event] || event
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatWechatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function updateLogStats() {
  const byLevel: Record<string, number> = {}
  const byPlatform: Record<string, number> = {}
  for (const log of logs.value) {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1
    byPlatform[log.platform] = (byPlatform[log.platform] || 0) + 1
  }
  logStats.value = {
    total: logs.value.length,
    byLevel,
    byPlatform
  }
}

// 日志加载
async function loadLogs() {
  loadingLogs.value = true
  try {
    const data = await apiClient.get('/api/remote-control/logs') as any
    logs.value = Array.isArray(data) ? data : []
    updateLogStats()
  } catch {
    console.error('Failed to load logs')
  } finally {
    loadingLogs.value = false
  }
}

async function refreshLogs() {
  await loadLogs()
}

async function clearLogs() {
  try {
    await ElMessageBox.confirm('确定清空所有运行日志吗？', '确认', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await apiClient.delete('/api/remote-control/logs')
    logs.value = []
    logStats.value = { total: 0, byLevel: {}, byPlatform: {} }
    ElMessage.success('日志已清空')
  } catch (e: any) {
    // 用户取消操作，或请求失败
    if (e?.message && e.message !== 'cancel') {
      ElMessage.error('清空日志失败')
    }
  }
}

// WebSocket 连接
function connectWebSocket() {
  if (isManualClose) return

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/api/remote-control/ws`

  try {
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer)
        wsReconnectTimer = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if ((msg.type === 'remote_control_log' || msg.type === 'log') && msg.payload) {
          const entry = msg.payload as RemoteLogEntry
          logs.value.unshift(entry)
          if (logs.value.length > 1000) {
            logs.value = logs.value.slice(0, 1000)
          }
          updateLogStats()
          nextTick(() => {
            if (logListRef.value) {
              logListRef.value.scrollTop = 0
            }
          })
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = (event) => {
      if (!isManualClose && event.code !== 1000) {
        wsReconnectTimer = setTimeout(() => {
          connectWebSocket()
        }, 3000)
      }
    }

    ws.onerror = () => {
      // will trigger onclose
    }
  } catch {
    if (!isManualClose) {
      wsReconnectTimer = setTimeout(() => {
        connectWebSocket()
      }, 5000)
    }
  }
}

function disconnectWebSocket() {
  isManualClose = true
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }
  if (ws) {
    ws.close(1000, 'Component unmounting')
    ws = null
  }
}

// 配置加载
function loadRemoteControlConfig() {
  apiClient.get('/api/remote-control/config')
    .then((data: any) => {
      if (data.enabled !== undefined) {
        remoteControlConfig.enabled = Boolean(data.enabled)
      }
      if (data.proxyEnabled !== undefined) {
        remoteControlConfig.proxyEnabled = Boolean(data.proxyEnabled)
      }
      if (data.commandPrefix) {
        remoteControlConfig.commandPrefix = String(data.commandPrefix)
      }
      if (data.verifyCode) {
        remoteControlConfig.verifyCode = String(data.verifyCode)
      }

      if (data.telegram) {
        remoteControlConfig.telegram.enabled = Boolean(data.telegram.enabled)
        remoteControlConfig.telegram.botToken = String(data.telegram.botToken || '')
        remoteControlConfig.telegram.chatId = String(data.telegram.chatId || '')
        remoteControlConfig.telegram.proxyEnabled = Boolean(data.telegram.proxyEnabled)
      }

      if (data.qq) {
        remoteControlConfig.qq.enabled = Boolean(data.qq.enabled)
        remoteControlConfig.qq.botId = String(data.qq.botId || '')
        remoteControlConfig.qq.webhook = String(data.qq.webhook || '')
        remoteControlConfig.qq.proxyEnabled = Boolean(data.qq.proxyEnabled)
        remoteControlConfig.qq.appSecret = String(data.qq.appSecret || '')
      }

      if (data.wechat) {
        remoteControlConfig.wechat.enabled = Boolean(data.wechat.enabled)
        remoteControlConfig.wechat.webhook = String(data.wechat.webhook || '')
        remoteControlConfig.wechat.proxyEnabled = Boolean(data.wechat.proxyEnabled)
      }

      if (data.feishu) {
        remoteControlConfig.feishu.enabled = Boolean(data.feishu.enabled)
        remoteControlConfig.feishu.appId = String(data.feishu.appId || '')
        remoteControlConfig.feishu.appSecret = String(data.feishu.appSecret || '')
        remoteControlConfig.feishu.webhook = String(data.feishu.webhook || '')
        remoteControlConfig.feishu.proxyEnabled = Boolean(data.feishu.proxyEnabled)
      }

      if (data.discord) {
        remoteControlConfig.discord.enabled = Boolean(data.discord.enabled)
        remoteControlConfig.discord.botToken = String(data.discord.botToken || '')
        remoteControlConfig.discord.channelId = String(data.discord.channelId || '')
        remoteControlConfig.discord.proxyEnabled = Boolean(data.discord.proxyEnabled)
      }

      if (data.slack) {
        remoteControlConfig.slack.enabled = Boolean(data.slack.enabled)
        remoteControlConfig.slack.botToken = String(data.slack.botToken || '')
        remoteControlConfig.slack.channelId = String(data.slack.channelId || '')
        remoteControlConfig.slack.proxyEnabled = Boolean(data.slack.proxyEnabled)
      }

      if (data.teams) {
        remoteControlConfig.teams.enabled = Boolean(data.teams.enabled)
        remoteControlConfig.teams.appId = String(data.teams.appId || '')
        remoteControlConfig.teams.appSecret = String(data.teams.appSecret || '')
        remoteControlConfig.teams.webhook = String(data.teams.webhook || '')
        remoteControlConfig.teams.proxyEnabled = Boolean(data.teams.proxyEnabled)
      }

      if (data.whatsapp) {
        remoteControlConfig.whatsapp.enabled = Boolean(data.whatsapp.enabled)
        remoteControlConfig.whatsapp.accountSid = String(data.whatsapp.accountSid || '')
        remoteControlConfig.whatsapp.authToken = String(data.whatsapp.authToken || '')
        remoteControlConfig.whatsapp.fromNumber = String(data.whatsapp.fromNumber || '')
        remoteControlConfig.whatsapp.proxyEnabled = Boolean(data.whatsapp.proxyEnabled)
      }
    })
    .catch(err => {
      console.error('从后端加载远控配置失败:', err)
    })

  fetchWechatStatus()
}

// 保存配置
function saveRemoteControlConfig() {
  remoteControlConfig.enabled =
    remoteControlConfig.telegram.enabled ||
    remoteControlConfig.qq.enabled ||
    remoteControlConfig.wechat.enabled ||
    remoteControlConfig.feishu.enabled ||
    remoteControlConfig.discord.enabled ||
    remoteControlConfig.slack.enabled ||
    remoteControlConfig.teams.enabled ||
    remoteControlConfig.whatsapp.enabled

  const payload = {
    enabled: remoteControlConfig.enabled,
    proxyEnabled: remoteControlConfig.proxyEnabled,
    commandPrefix: remoteControlConfig.commandPrefix,
    verifyCode: remoteControlConfig.verifyCode,
    telegram: {
      enabled: remoteControlConfig.telegram.enabled,
      botToken: remoteControlConfig.telegram.botToken,
      chatId: remoteControlConfig.telegram.chatId,
      proxyEnabled: remoteControlConfig.telegram.proxyEnabled
    },
    qq: {
      enabled: remoteControlConfig.qq.enabled,
      botId: remoteControlConfig.qq.botId,
      webhook: remoteControlConfig.qq.webhook,
      proxyEnabled: remoteControlConfig.qq.proxyEnabled,
      appSecret: remoteControlConfig.qq.appSecret
    },
    wechat: {
      enabled: remoteControlConfig.wechat.enabled,
      webhook: remoteControlConfig.wechat.webhook,
      proxyEnabled: remoteControlConfig.wechat.proxyEnabled
    },
    feishu: {
      enabled: remoteControlConfig.feishu.enabled,
      appId: remoteControlConfig.feishu.appId,
      appSecret: remoteControlConfig.feishu.appSecret,
      webhook: remoteControlConfig.feishu.webhook,
      proxyEnabled: remoteControlConfig.feishu.proxyEnabled
    },
    discord: {
      enabled: remoteControlConfig.discord.enabled,
      botToken: remoteControlConfig.discord.botToken,
      channelId: remoteControlConfig.discord.channelId,
      proxyEnabled: remoteControlConfig.discord.proxyEnabled
    },
    slack: {
      enabled: remoteControlConfig.slack.enabled,
      botToken: remoteControlConfig.slack.botToken,
      channelId: remoteControlConfig.slack.channelId,
      proxyEnabled: remoteControlConfig.slack.proxyEnabled
    },
    teams: {
      enabled: remoteControlConfig.teams.enabled,
      appId: remoteControlConfig.teams.appId,
      appSecret: remoteControlConfig.teams.appSecret,
      webhook: remoteControlConfig.teams.webhook,
      proxyEnabled: remoteControlConfig.teams.proxyEnabled
    },
    whatsapp: {
      enabled: remoteControlConfig.whatsapp.enabled,
      accountSid: remoteControlConfig.whatsapp.accountSid,
      authToken: remoteControlConfig.whatsapp.authToken,
      fromNumber: remoteControlConfig.whatsapp.fromNumber,
      proxyEnabled: remoteControlConfig.whatsapp.proxyEnabled
    }
  }

  apiClient.post('/api/remote-control/config', payload).catch(() => {})

  ElMessage.success(t('controlSaved'))
}

// Telegram 测试
async function sendTestToTelegram() {
  if (!telegramTestMessage.value.trim()) return
  sendingToTelegram.value = true
  try {
    await apiClient.post('/api/remote-control/send', {
      platform: 'telegram',
      content: telegramTestMessage.value
    })
    ElMessage.success('发送成功')
    telegramTestMessage.value = ''
  } catch (e: any) {
    ElMessage.error(e?.message || '发送失败')
  } finally {
    sendingToTelegram.value = false
  }
}

// 个人微信功能
async function fetchWechatStatus() {
  try {
    const data = await apiClient.get('/api/plugins/wechat-bot/status') as any
    if (data.accounts) {
      wechatAccounts.value = data.accounts
    }
  } catch {}
}

async function startWechatLogin() {
  wechatLoginLoading.value = true
  wechatQrCodeUrl.value = ''
  wechatLoginStatus.value = 'idle'
  try {
    const data = await apiClient.post('/api/plugins/wechat-bot/login') as any
    if (data.qrcodeUrl) {
      wechatQrCodeUrl.value = data.qrcodeUrl
      wechatLoginSession.value = data.session
      wechatLoginStatus.value = 'waiting'
      startWechatLoginPolling(data.session)
    } else {
      ElMessage.error(data.error || '获取二维码失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '登录请求失败')
  } finally {
    wechatLoginLoading.value = false
  }
}

function startWechatLoginPolling(session: string) {
  stopWechatLoginPolling()
  wechatPollingTimer = setInterval(async () => {
    try {
      const data = await apiClient.get(`/api/plugins/wechat-bot/check-login?session=${session}`) as any
      if (data.status === 'success') {
        wechatLoginStatus.value = 'success'
        stopWechatLoginPolling()
        await fetchWechatStatus()
        setTimeout(() => {
          wechatQrCodeUrl.value = ''
          wechatLoginSession.value = ''
        }, 1500)
      }
    } catch {}
  }, 2000)
}

function stopWechatLoginPolling() {
  if (wechatPollingTimer) {
    clearInterval(wechatPollingTimer)
    wechatPollingTimer = null
  }
}

function cancelWechatLogin() {
  stopWechatLoginPolling()
  wechatQrCodeUrl.value = ''
  wechatLoginSession.value = ''
  wechatLoginStatus.value = 'idle'
}

async function sendTestToWechat() {
  if (!wechatTestMessage.value.trim()) return
  wechatSending.value = true
  try {
    await apiClient.post('/api/plugins/wechat-bot/send', { content: wechatTestMessage.value })
    ElMessage.success('发送成功')
    wechatTestMessage.value = ''
  } catch (e: any) {
    ElMessage.error(e?.message || '发送失败')
  } finally {
    wechatSending.value = false
  }
}

async function logoutWechatAccount(wxid: string) {
  try {
    await apiClient.post('/api/plugins/wechat-bot/logout', { wxid })
    ElMessage.success('已登出')
    await fetchWechatStatus()
  } catch (e: any) {
    ElMessage.error(e?.message || '登出失败')
  }
}

// 复制文本
async function copyMessageText(text: string, showToast = true) {
  const safeText = String(text || '')
  if (!safeText) return
  try {
    await navigator.clipboard.writeText(safeText)
    if (showToast) {
      ElMessage.success(t('copied'))
    }
  } catch {
    const textArea = document.createElement('textarea')
    textArea.value = safeText
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
      if (showToast) {
        ElMessage.success(t('copied'))
      }
    } catch {
      // fallback
    }
    document.body.removeChild(textArea)
  }
}

// 生命周期
onMounted(() => {
  loadRemoteControlConfig()
  loadLogs()
  connectWebSocket()
})

onUnmounted(() => {
  disconnectWebSocket()
  stopWechatLoginPolling()
})
</script>

<style scoped>
.settings-panel {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.panel-header {
  margin-bottom: 24px;
}

.panel-header h3 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.panel-desc {
  margin: 8px 0 0;
  color: #94a3b8;
  font-size: 14px;
}

.control-global-card {
  margin: 0 0 20px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 14px;
}

.control-global-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-global-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.control-proxy-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 16px;
}

.control-proxy-switch {
  margin-left: 6px;
}

.control-global-row {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.control-global-row .el-input {
  flex: 1;
}

.control-footer {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.platform-tabs {
  margin-bottom: 0;
}

.platform-tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.log-count-badge {
  margin-left: 4px;
}

.platform-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.qq-icon { background: #1b9dff; }
.wechat-icon { background: #07c160; }
.wechat-personal-icon { background: #09b83a; }
.feishu-icon { background: #3370ff; }
.discord-icon { background: #5865f2; }
.slack-icon { background: #4a154b; }
.teams-icon { background: #6264a7; }
.whatsapp-icon { background: #25d366; }

.platform-config {
  background: #fff;
  padding: 24px;
  border-radius: 0 0 8px 8px;
}

.platform-enable-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

/* 个人微信样式 */
.wechat-personal-login-section {
  text-align: center;
  padding: 20px 0;
}

.wechat-personal-empty {
  padding: 40px 0;
}

.wechat-personal-qrcode {
  padding: 20px 0;
}

.wechat-personal-accounts {
  text-align: left;
}

.wechat-personal-accounts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  font-weight: 600;
}

.wechat-personal-account-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
}

.wechat-personal-account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wechat-personal-account-nickname {
  font-weight: 500;
  font-size: 14px;
}

.wechat-personal-account-wxid {
  font-size: 12px;
  color: #94a3b8;
  font-family: monospace;
}

.wechat-received-section {
  text-align: left;
}

.wechat-received-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-weight: 600;
}

.wechat-received-empty {
  padding: 20px 0;
  text-align: center;
}

.wechat-received-item {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
}

.wechat-received-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.wechat-received-sender {
  font-weight: 500;
  font-size: 13px;
  color: #334155;
}

.wechat-received-time {
  font-size: 11px;
  color: #94a3b8;
}

.wechat-received-text {
  font-size: 13px;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 日志面板样式 */
.log-panel {
  background: #fff;
  border-radius: 0 0 8px 8px;
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  flex-wrap: wrap;
  gap: 8px;
}

.log-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-stats-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #ebeef5;
  font-size: 12px;
  color: #666;
}

.log-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.log-stat-info { color: #409eff; }
.log-stat-success { color: #67c23a; }
.log-stat-warn { color: #e6a23c; }
.log-stat-error { color: #f56c6c; }

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  max-height: 500px;
}

.log-empty {
  padding: 60px 0;
}

.log-entry {
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.log-entry:hover {
  background: #f5f7fa;
}

.log-entry-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.log-time {
  font-size: 11px;
  color: #999;
  font-family: monospace;
  min-width: 60px;
}

.log-platform-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.platform-telegram { background: #e8f4fd; color: #0088cc; }
.platform-qq { background: #f0f0f0; color: #666; }
.platform-feishu { background: #e8f8f0; color: #3370ff; }
.platform-wechat { background: #e8f8e8; color: #07c160; }
.platform-discord { background: #eef0f8; color: #5865f2; }
.platform-slack { background: #f5e8d0; color: #4a154b; }
.platform-teams { background: #e8f0f8; color: #6264a7; }
.platform-whatsapp { background: #e8f8e8; color: #25d366; }
.platform-system { background: #f5f5f5; color: #999; }

.log-level-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.level-info { background: #ecf5ff; color: #409eff; }
.level-warn { background: #fdf6ec; color: #e6a23c; }
.level-error { background: #fef0f0; color: #f56c6c; }
.level-success { background: #f0f9eb; color: #67c23a; }

.log-event-tag {
  font-size: 11px;
  color: #888;
  background: #f5f5f5;
  padding: 1px 6px;
  border-radius: 3px;
}

.log-entry-body {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.log-message {
  font-size: 13px;
  color: #333;
  line-height: 1.5;
}

.log-sender {
  font-size: 11px;
  color: #999;
}

.log-entry-detail {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
  padding-left: 16px;
  font-family: monospace;
  word-break: break-all;
}

.log-level-error .log-message { color: #f56c6c; }
.log-level-warn .log-message { color: #e6a23c; }
.log-level-success .log-message { color: #67c23a; }
</style>
