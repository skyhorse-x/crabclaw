<template>
  <div class="integrations-container">
    <p class="integrations-desc">{{ t('integrationsDesc') }}</p>

    <div class="category-tabs">
      <div
        v-for="cat in categories"
        :key="cat.key"
        class="category-tab"
        :class="{ active: activeCategory === cat.key }"
        @click="activeCategory = cat.key"
      >
        {{ cat.label }}
      </div>
    </div>

    <div class="integrations-grid">
      <div
        v-for="item in filteredIntegrations"
        :key="item.id"
        class="integration-card"
        :class="{ connected: item.connected }"
      >
        <div class="card-icon" :style="{ background: item.color }">
          <el-icon :size="18" color="#fff"><component :is="item.icon" /></el-icon>
        </div>
        <div class="card-info">
          <div class="card-name">{{ item.name }}</div>
          <div class="card-desc">{{ item.desc }}</div>
        </div>
        <div class="card-actions">
          <el-button v-if="item.connected" size="small" type="danger" plain @click="handleDisconnect(item)">
            {{ t('integrationsDisconnect') }}
          </el-button>
          <el-button v-else size="small" @click="handleConnect(item)">
            {{ t('integrationsConnect') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 配置弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogItem?.name"
      width="480px"
      destroy-on-close
    >
      <div v-if="dialogItem" class="dialog-body">
        <div class="dialog-service-header">
          <div class="dialog-icon" :style="{ background: dialogItem.color }">
            <el-icon :size="20" color="#fff"><component :is="dialogItem.icon" /></el-icon>
          </div>
          <div>
            <div class="dialog-service-name">{{ dialogItem.name }}</div>
            <div class="dialog-service-desc">{{ dialogItem.desc }}</div>
          </div>
        </div>

        <el-form :model="formData" label-position="top" class="config-form">
          <template v-for="field in currentFields" :key="field.key">
            <el-form-item :label="field.label">
              <el-input
                v-model="formData[field.key]"
                :placeholder="field.placeholder"
                :type="field.secret ? 'password' : 'text'"
                :show-password="field.secret"
              />
            </el-form-item>
          </template>
        </el-form>

        <el-alert
          v-if="dialogItem.helpText"
          :title="dialogItem.helpText"
          type="info"
          :closable="false"
          show-icon
          class="help-alert"
        />
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="handleSave">{{ t('integrationsSave') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  Message, Promotion, ChatDotRound,
  Upload, FolderOpened, Box,
  Document, Edit, Reading,
  Notification, Connection, Calendar,
  DataLine, Share, DataAnalysis,
} from '@element-plus/icons-vue'

const { t } = useI18n()

const activeCategory = ref('all')
const dialogVisible = ref(false)
const dialogItem = ref<IntegrationDef | null>(null)
const formData = reactive<Record<string, string>>({})

const categories = computed(() => [
  { key: 'all',      label: t('integrationsAll') },
  { key: 'email',    label: t('integrationsEmail') },
  { key: 'storage',  label: t('integrationsStorage') },
  { key: 'docs',     label: t('integrationsDocs') },
  { key: 'news',     label: t('integrationsNews') },
  { key: 'social',   label: t('integrationsSocial') },
  { key: 'calendar', label: t('integrationsCalendar') },
])

interface FormField {
  key: string
  label: string
  placeholder: string
  secret?: boolean
}

interface IntegrationDef {
  id: string
  name: string
  icon: any
  color: string
  category: string
  helpText?: string
  fields: FormField[]
}

interface Integration extends IntegrationDef {
  desc: string
  connected: boolean
}

const connectedIds = ref<Set<string>>(new Set())
const savedConfigs = ref<Record<string, Record<string, string>>>({})

const integrationDefs: IntegrationDef[] = [
  {
    id: 'gmail', name: 'Gmail', icon: Message, color: '#D93025', category: 'email',
    helpText: '需要在 Google 账户中开启"应用专用密码"后填入',
    fields: [
      { key: 'email', label: '邮箱地址', placeholder: 'you@gmail.com' },
      { key: 'appPassword', label: '应用专用密码', placeholder: '16位应用密码', secret: true },
    ],
  },
  {
    id: 'outlook', name: 'Outlook', icon: Promotion, color: '#0078D4', category: 'email',
    fields: [
      { key: 'email', label: '邮箱地址', placeholder: 'you@outlook.com' },
      { key: 'password', label: '密码', placeholder: '账户密码', secret: true },
    ],
  },
  {
    id: 'smtp', name: 'SMTP', icon: ChatDotRound, color: '#57564F', category: 'email',
    fields: [
      { key: 'host', label: 'SMTP 服务器', placeholder: 'smtp.example.com' },
      { key: 'port', label: '端口', placeholder: '465' },
      { key: 'user', label: '用户名', placeholder: '邮箱账号' },
      { key: 'pass', label: '密码', placeholder: '邮箱密码', secret: true },
    ],
  },
  {
    id: 'googledrive', name: 'Google Drive', icon: FolderOpened, color: '#1DA462', category: 'storage',
    helpText: '需要 Google Cloud 项目的 OAuth Client ID',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret', secret: true },
    ],
  },
  {
    id: 'onedrive', name: 'OneDrive', icon: Upload, color: '#0078D4', category: 'storage',
    fields: [
      { key: 'clientId', label: 'Application (Client) ID', placeholder: 'Azure App Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret', secret: true },
    ],
  },
  {
    id: 'dropbox', name: 'Dropbox', icon: Box, color: '#0061FF', category: 'storage',
    fields: [
      { key: 'accessToken', label: 'Access Token', placeholder: 'Dropbox Access Token', secret: true },
    ],
  },
  {
    id: 'aliyun-oss', name: '阿里云 OSS', icon: Upload, color: '#FF6A00', category: 'storage',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AccessKey ID' },
      { key: 'accessKeySecret', label: 'Access Key Secret', placeholder: 'AccessKey Secret', secret: true },
      { key: 'bucket', label: 'Bucket 名称', placeholder: 'my-bucket' },
      { key: 'region', label: 'Region', placeholder: 'oss-cn-hangzhou' },
    ],
  },
  {
    id: 's3', name: 'Amazon S3', icon: FolderOpened, color: '#FF9900', category: 'storage',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', placeholder: 'AWS Access Key ID' },
      { key: 'secretAccessKey', label: 'Secret Access Key', placeholder: 'AWS Secret Access Key', secret: true },
      { key: 'bucket', label: 'Bucket 名称', placeholder: 'my-bucket' },
      { key: 'region', label: 'Region', placeholder: 'us-east-1' },
    ],
  },
  {
    id: 'notion', name: 'Notion', icon: Edit, color: '#111110', category: 'docs',
    helpText: '在 Notion 设置 → Integrations 中创建 Integration 获取 Token',
    fields: [
      { key: 'apiKey', label: 'Integration Token', placeholder: 'secret_xxxxx', secret: true },
    ],
  },
  {
    id: 'googledocs', name: 'Google Docs', icon: Document, color: '#1A73E8', category: 'docs',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Google OAuth Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret', secret: true },
    ],
  },
  {
    id: 'feishu-doc', name: '飞书文档', icon: Reading, color: '#1456F0', category: 'docs',
    fields: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_xxxxx' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'App Secret', secret: true },
    ],
  },
  {
    id: 'yuque', name: '语雀', icon: Document, color: '#00B96B', category: 'docs',
    fields: [
      { key: 'token', label: 'API Token', placeholder: '语雀个人 Token', secret: true },
      { key: 'login', label: '个人路径 (login)', placeholder: 'your-login' },
    ],
  },
  {
    id: 'confluence', name: 'Confluence', icon: Edit, color: '#0052CC', category: 'docs',
    fields: [
      { key: 'baseUrl', label: '站点地址', placeholder: 'https://yoursite.atlassian.net' },
      { key: 'email', label: '账号邮箱', placeholder: 'you@company.com' },
      { key: 'apiToken', label: 'API Token', placeholder: 'Atlassian API Token', secret: true },
    ],
  },
  {
    id: 'rss', name: 'RSS', icon: DataLine, color: '#F26522', category: 'news',
    fields: [
      { key: 'feedUrl', label: 'Feed URL', placeholder: 'https://example.com/feed.xml' },
    ],
  },
  {
    id: 'newsapi', name: 'NewsAPI', icon: DataAnalysis, color: '#3D3D3A', category: 'news',
    helpText: '在 newsapi.org 注册账号免费获取 API Key',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'NewsAPI Key', secret: true },
    ],
  },
  {
    id: 'twitter', name: 'X (Twitter)', icon: Share, color: '#111110', category: 'news',
    fields: [
      { key: 'bearerToken', label: 'Bearer Token', placeholder: 'Twitter API Bearer Token', secret: true },
    ],
  },
  {
    id: 'slack', name: 'Slack', icon: Notification, color: '#4A154B', category: 'social',
    helpText: '在 Slack App 设置中创建 Incoming Webhook 获取 URL',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
    ],
  },
  {
    id: 'webhook', name: 'Webhook', icon: Connection, color: '#57564F', category: 'social',
    fields: [
      { key: 'url', label: '目标 URL', placeholder: 'https://your-endpoint.com/webhook' },
      { key: 'secret', label: '签名密钥（可选）', placeholder: 'Webhook Secret', secret: true },
    ],
  },
  {
    id: 'google-cal', name: 'Google Calendar', icon: Calendar, color: '#1A73E8', category: 'calendar',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Google OAuth Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret', secret: true },
    ],
  },
  {
    id: 'outlook-cal', name: 'Outlook Calendar', icon: Calendar, color: '#0078D4', category: 'calendar',
    fields: [
      { key: 'clientId', label: 'Application (Client) ID', placeholder: 'Azure App Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret', secret: true },
    ],
  },
]

const integrations = computed<Integration[]>(() =>
  integrationDefs.map(def => ({
    ...def,
    desc: t(`integration_${def.id.replace(/-/g, '_')}_desc`),
    connected: connectedIds.value.has(def.id),
  }))
)

const filteredIntegrations = computed(() =>
  activeCategory.value === 'all'
    ? integrations.value
    : integrations.value.filter(i => i.category === activeCategory.value)
)

const currentFields = computed<FormField[]>(() => {
  if (!dialogItem.value) return []
  const lang = t('integrationsAll') === 'All' ? 'en' : 'zh'
  if (lang === 'en') {
    return dialogItem.value.fields.map(f => ({
      ...f,
      label: fieldLabelEn[f.key] ?? f.label,
      placeholder: fieldPlaceholderEn[f.key] ?? f.placeholder,
    }))
  }
  return dialogItem.value.fields
})

// 英文字段标签映射
const fieldLabelEn: Record<string, string> = {
  email: 'Email Address', appPassword: 'App Password', password: 'Password',
  host: 'SMTP Host', port: 'Port', user: 'Username', pass: 'Password',
  clientId: 'Client ID', clientSecret: 'Client Secret', accessToken: 'Access Token',
  accessKeyId: 'Access Key ID', accessKeySecret: 'Access Key Secret',
  secretAccessKey: 'Secret Access Key', bucket: 'Bucket Name', region: 'Region',
  apiKey: 'API Key', appId: 'App ID', appSecret: 'App Secret',
  token: 'API Token', login: 'Login (Namespace)', baseUrl: 'Site URL',
  apiToken: 'API Token', feedUrl: 'Feed URL', bearerToken: 'Bearer Token',
  webhookUrl: 'Webhook URL', url: 'Target URL', secret: 'Signing Secret',
}
const fieldPlaceholderEn: Record<string, string> = {
  email: 'you@example.com', appPassword: '16-char app password',
}

function handleConnect(item: Integration) {
  dialogItem.value = item
  // 恢复已保存的配置
  const saved = savedConfigs.value[item.id] || {}
  Object.keys(formData).forEach(k => delete formData[k])
  Object.assign(formData, saved)
  dialogVisible.value = true
}

function handleDisconnect(item: Integration) {
  connectedIds.value.delete(item.id)
  delete savedConfigs.value[item.id]
  ElMessage.success(`${item.name} ${t('integrationsDisconnected')}`)
}

function handleSave() {
  if (!dialogItem.value) return
  const hasValue = Object.values(formData).some(v => v.trim())
  if (!hasValue) {
    ElMessage.warning(t('integrationsFillRequired'))
    return
  }
  savedConfigs.value[dialogItem.value.id] = { ...formData }
  connectedIds.value.add(dialogItem.value.id)
  dialogVisible.value = false
  ElMessage.success(`${dialogItem.value.name} ${t('integrationsConnectedSuccess')}`)
}
</script>

<style scoped>
.integrations-container {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.integrations-desc {
  color: var(--text-muted);
  margin: 0 0 20px;
  font-size: 13px;
}

.category-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.category-tab {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  transition: all 0.15s;
  user-select: none;
}

.category-tab:hover { background: var(--bg-hover); }

.category-tab.active {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
}

.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.integration-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: all 0.15s;
}

.integration-card:hover {
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-sm);
}

.integration-card.connected { border-color: var(--success); }

.card-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-info { flex: 1; min-width: 0; }

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.card-desc {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-actions { flex-shrink: 0; }

.card-actions .el-button {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
  border-radius: 6px;
}

.card-actions .el-button:hover {
  background: var(--accent-secondary);
  border-color: var(--accent-secondary);
}

/* 弹窗内容 */
.dialog-body { display: flex; flex-direction: column; gap: 20px; }

.dialog-service-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dialog-service-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.dialog-service-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.config-form { margin-bottom: 0; }

.help-alert { margin-top: 4px; }
</style>
