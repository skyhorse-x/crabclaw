<template>
  <div class="settings-page">
      <el-tabs v-model="activeSettingTab">
        <el-tab-pane :label="t('basicSettings')" name="basic">
          <el-form label-position="top">
            <el-form-item :label="t('backendAddress')">
              <el-input v-model="config.settings.backendPort" :placeholder="String(__BACKEND_PORT__)" />
            </el-form-item>
            <el-form-item :label="t('skillsDir')">
              <el-input v-model="config.settings.skillsDir" :placeholder="t('skillsDirPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('themeSetting')">
              <el-select v-model="config.settings.theme">
                <el-option :label="t('light')" value="light" />
                <el-option :label="t('dark')" value="dark" />
                <el-option :label="t('gray')" value="gray" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('languageSetting')">
              <el-select v-model="config.settings.language">
                <el-option :label="t('chinese')" value="zh-CN" />
                <el-option :label="t('english')" value="en-US" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('dataDirectory')">
              <el-input v-model="chatStorageConfig.currentUserDataDir" />
              <el-button style="margin-top: 8px" @click="saveChatStorageDirectory">
                {{ t('saveDataDirectory') }}
              </el-button>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="persistConfig">{{ t('saveSettings') }}</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane :label="t('modelConfig')" name="model">
          <div class="model-config-container">
            <div class="model-list-simple">
              <div
                v-for="model in config.models"
                :key="model.id"
                class="model-item"
                :class="{ active: model.id === config.settings.activeModelId }"
              >
                <div class="model-item-left" @click="activateModel(model.id)">
                  <div class="model-item-info">
                    <div class="model-item-name">
                      {{ model.name }}
                      <el-tag v-if="model.isBuiltIn" type="info" size="small" effect="plain" class="type-tag">
                        {{ t('builtIn') }}
                      </el-tag>
                      <el-tag v-if="model.id === config.settings.activeModelId" size="small" effect="plain" class="status-tag-inline">
                        ●
                      </el-tag>
                    </div>
                    <div class="model-item-provider">{{ model.customProviderName || getProviderName(model.provider) }}</div>
                  </div>
                </div>
                <div class="model-item-actions">
                  <el-button circle size="small" @click.stop="openModelDialog('edit', model)">
                    <el-icon><EditPen /></el-icon>
                  </el-button>
                  <el-button circle size="small" type="danger" @click.stop="deleteModel(model.id)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <div class="model-add-simple" @click="openModelDialog('add')">
                <el-icon :size="20"><Plus /></el-icon>
                <span>{{ t('addModel') }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="t('tokenStats')" name="token">
          <div class="token-stats-container">
            <el-row :gutter="20" v-if="tokenStats.totalTokens > 0">
              <el-col :span="8">
                <el-card shadow="hover" class="token-card">
                  <div class="token-stat-label">{{ t('totalTokens') }}</div>
                  <div class="token-stat-value">{{ formatNumber(tokenStats.totalTokens) }}</div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card shadow="hover" class="token-card">
                  <div class="token-stat-label">{{ t('promptTokens') }}</div>
                  <div class="token-stat-value">{{ formatNumber(tokenStats.totalPrompt) }}</div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card shadow="hover" class="token-card">
                  <div class="token-stat-label">{{ t('completionTokens') }}</div>
                  <div class="token-stat-value">{{ formatNumber(tokenStats.totalCompletion) }}</div>
                </el-card>
              </el-col>
            </el-row>
            <el-empty v-else :description="t('noTokenData')" />
            <el-divider v-if="Object.keys(tokenStats.byModel || {}).length > 0">{{ t('byModel') }}</el-divider>
            <el-table v-if="Object.keys(tokenStats.byModel || {}).length > 0" :data="tokenStatsTableData" stripe>
              <el-table-column prop="model" :label="t('model')" />
              <el-table-column prop="prompt" :label="t('promptTokens')" align="right">
                <template #default="{ row }">{{ formatNumber(row.prompt) }}</template>
              </el-table-column>
              <el-table-column prop="completion" :label="t('completionTokens')" align="right">
                <template #default="{ row }">{{ formatNumber(row.completion) }}</template>
              </el-table-column>
              <el-table-column prop="total" :label="t('totalTokens')" align="right">
                <template #default="{ row }">{{ formatNumber(row.total) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="t('settingsProxy')" name="proxy">
          <el-form label-position="top">
            <el-form-item :label="t('settingsProxyEnable')">
              <el-switch v-model="config.settings.proxy!.enabled" />
            </el-form-item>
            <el-form-item :label="t('settingsProxyProtocol')">
              <el-select v-model="config.settings.proxy!.protocol">
                <el-option label="HTTP" value="http" />
                <el-option label="HTTPS" value="https" />
                <el-option label="SOCKS5" value="socks5" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('settingsProxyHost')">
              <el-input v-model="config.settings.proxy!.host" placeholder="127.0.0.1" />
            </el-form-item>
            <el-form-item :label="t('settingsProxyPort')">
              <el-input-number v-model="config.settings.proxy!.port" :min="1" :max="65535" :controls="false" style="width:100%" />
            </el-form-item>
            <el-form-item :label="t('settingsProxyUsername')">
              <el-input v-model="config.settings.proxy!.username" placeholder="" />
            </el-form-item>
            <el-form-item :label="t('settingsProxyPassword')">
              <el-input v-model="config.settings.proxy!.password" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="persistConfig">{{ t('saveSettings') }}</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="关于" name="about">
          <div class="about-container">
            <div class="about-logo">
              <img class="logo-icon" style="width: 60px; height: 60px;" src="/icons/appIcon.png" alt="Logo" />
              <h2>{{ t('appTitle') }}</h2>
            </div>
            <div class="about-version">版本 v2.0.0</div>
            <div class="about-desc">一个智能桌面助手，帮助你完成各种任务</div>
            <el-divider />
            <div class="about-actions">
              <el-button type="primary" @click="checkForUpdate">检查更新</el-button>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 模型管理对话框 -->
      <el-dialog
        v-model="modelDialogVisible"
        :title="modelDialogMode === 'add' ? t('addModel') : t('edit')"
        width="600px"
      >
        <el-form :model="currentModel" label-width="120px" v-if="currentModel">
          <el-form-item :label="t('modelName')">
            <el-input v-model="currentModel.name" :placeholder="t('enterModelName')" />
          </el-form-item>

          <el-form-item :label="t('provider')">
            <el-select v-model="currentModel.provider">
              <el-option label="OpenAI" value="openai" />
              <el-option label="Anthropic" value="anthropic" />
              <el-option label="Google" value="google" />
              <el-option label="Meta" value="meta" />
              <el-option label="Mistral AI" value="mistral" />
              <el-option label="OpenRouter" value="openrouter" />
              <el-option label="百度文心一言" value="baidu" />
              <el-option label="阿里云通义千问" value="aliyun" />
              <el-option label="腾讯混元大模型" value="tencent" />
              <el-option label="字节跳动豆包" value="bytedance" />
              <el-option label="智谱AI GLM" value="zhipu" />
              <el-option :label="t('localModel')" value="local" />
              <el-option :label="t('custom')" value="custom" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('customProviderName')" v-if="currentModel.provider === 'custom'">
            <el-input v-model="currentModel.customProviderName" :placeholder="t('customProviderName')" />
          </el-form-item>

          <el-form-item :label="t('apiKey')">
            <el-input
              v-model="currentModel.apiKey"
              type="password"
              :placeholder="t('apiKey')"
              :show-password="true"
            />
          </el-form-item>

          <el-form-item :label="t('modelIdentifier')">
            <el-input v-model="currentModel.modelName" placeholder="gpt-4o, claude-3-opus-20240229" />
          </el-form-item>

          <el-form-item :label="t('apiBaseUrl')">
            <el-input v-model="currentModel.apiBaseUrl" placeholder="https://api.openai.com/v1" />
          </el-form-item>

          <el-form-item :label="t('activeStatus')">
            <el-switch v-model="currentModel.isActive" />
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="modelDialogVisible = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" @click="saveModel">
            {{ modelDialogMode === 'add' ? t('add') : t('save') }}
          </el-button>
        </template>
      </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { EditPen, Delete, Plus } from '@element-plus/icons-vue'
import { apiClient } from '../utils/api-client'

const locales = {
  'zh-CN': {
    appTitle: 'crabclaw',
    systemSettings: '系统设置',
    basicSettings: '基本设置',
    backendAddress: '后端地址',
    skillsDir: '技能目录',
    skillsDirPlaceholder: '例如：/Users/xxx/server/data/skills',
    dataDirectory: '用户数据目录',
    saveDataDirectory: '保存目录',
    saveSettings: '保存设置',
    themeSetting: '主题设置',
    languageSetting: '语言',
    light: '浅色',
    dark: '深色',
    gray: '灰色',
    chinese: '简体中文',
    english: 'English',
    modelConfig: '大模型配置',
    tokenStats: 'Token 统计',
    addModel: '添加模型',
    builtIn: '内置',
    edit: '编辑',
    totalTokens: '总 Tokens',
    promptTokens: '提示 Tokens',
    completionTokens: '完成 Tokens',
    noTokenData: '暂无 Token 数据',
    byModel: '按模型分组',
    model: '模型',
    modelName: '模型名称',
    provider: '提供商',
    customProviderName: '自定义提供商名称',
    apiKey: 'API 密钥',
    modelIdentifier: '模型标识',
    apiBaseUrl: 'API 基础 URL',
    activeStatus: '激活状态',
    cancel: '取消',
    add: '添加',
    save: '保存',
    confirmDelete: '确认删除',
    deleteConfirmMessage: '确定要删除这个模型吗？此操作不可撤销。',
    confirm: '确定',
    deleteSuccess: '模型删除成功',
    modelActivated: '模型已激活',
    enterModelName: '请输入模型名称',
    enterApiBaseUrl: '请输入API基础URL',
    modelDataEmpty: '模型数据为空',
    localModel: '本地模型',
    custom: '自定义',
    settingsProxy: '网络代理',
    settingsProxyEnable: '启用代理',
    settingsProxyProtocol: '代理协议',
    settingsProxyHost: '主机地址',
    settingsProxyPort: '端口',
    settingsProxyUsername: '用户名（可选）',
    settingsProxyPassword: '密码（可选）',
    saveSuccess: '配置已保存',
    saveFailed: '保存失败',
    dataDirectorySaved: '聊天数据目录已更新'
  },
  'en-US': {
    appTitle: 'crabclaw',
    systemSettings: 'System Settings',
    basicSettings: 'Basic',
    backendAddress: 'Backend Port',
    skillsDir: 'Skills directory',
    skillsDirPlaceholder: 'e.g. /Users/xxx/server/data/skills',
    dataDirectory: 'User data directory',
    saveDataDirectory: 'Save directory',
    saveSettings: 'Save',
    themeSetting: 'Theme',
    languageSetting: 'Language',
    light: 'Light',
    dark: 'Dark',
    gray: 'Gray',
    chinese: 'Simplified Chinese',
    english: 'English',
    modelConfig: 'Model Configuration',
    tokenStats: 'Token Statistics',
    addModel: 'Add Model',
    builtIn: 'Built-in',
    edit: 'Edit',
    totalTokens: 'Total Tokens',
    promptTokens: 'Prompt Tokens',
    completionTokens: 'Completion Tokens',
    noTokenData: 'No Token Data',
    byModel: 'By Model',
    model: 'Model',
    modelName: 'Model Name',
    provider: 'Provider',
    customProviderName: 'Custom Provider Name',
    apiKey: 'API Key',
    modelIdentifier: 'Model Identifier',
    apiBaseUrl: 'API Base URL',
    activeStatus: 'Active Status',
    cancel: 'Cancel',
    add: 'Add',
    save: 'Save',
    confirmDelete: 'Confirm Delete',
    deleteConfirmMessage: 'Are you sure you want to delete this model? This action cannot be undone.',
    confirm: 'Confirm',
    deleteSuccess: 'Model deleted successfully',
    modelActivated: 'Model activated',
    enterModelName: 'Please enter model name',
    enterApiBaseUrl: 'Please enter API base URL',
    modelDataEmpty: 'Model data is empty',
    localModel: 'Local Model',
    custom: 'Custom',
    settingsProxy: 'Network Proxy',
    settingsProxyEnable: 'Enable Proxy',
    settingsProxyProtocol: 'Proxy Protocol',
    settingsProxyHost: 'Host',
    settingsProxyPort: 'Port',
    settingsProxyUsername: 'Username (Optional)',
    settingsProxyPassword: 'Password (Optional)',
    saveSuccess: 'Configuration saved',
    saveFailed: 'Save failed',
    dataDirectorySaved: 'Chat data directory updated'
  }
}

interface AppConfig {
  settings: {
    backendPort: number
    theme: string
    language: string
    activeModelId: string
    userDataDir?: string
    skillsDir?: string
    username?: string
    proxy?: {
      enabled: boolean
      protocol: string
      host: string
      port: number
      username?: string
      password?: string
    }
  }
  models: Array<{
    id: string
    name: string
    provider: string
    customProviderName?: string
    apiKey?: string
    apiKeyEncrypted?: string
    modelName: string
    apiBaseUrl: string
    isBuiltIn: boolean
    isActive: boolean
    createdAt: string
    updatedAt: string
  }>
  skills: Array<{
    id: string
    name: string
    description: string
    steps: any[]
  }>
}

const t = (key: string) => {
  const lang = config.value.settings.language || 'zh-CN'
  const localeData = locales[lang as keyof typeof locales] as Record<string, string>
  return localeData[key] || key
}

const config = ref<AppConfig>({
  settings: {
    backendPort: __BACKEND_PORT__,
    theme: 'light',
    language: 'zh-CN',
    activeModelId: '',
    userDataDir: '',
    skillsDir: '',
    proxy: { enabled: false, protocol: 'http', host: '', port: 0, username: '', password: '' }
  },
  models: [],
  skills: []
})

const activeSettingTab = ref('basic')
const selectedChatModel = ref('')

const modelDialogVisible = ref(false)
const modelDialogMode = ref('add')
const currentModel = ref<{
  id: string
  name: string
  provider: string
  customProviderName?: string
  apiKey?: string
  apiKeyEncrypted?: string
  modelName: string
  apiBaseUrl: string
  isBuiltIn: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
} | null>(null)

const tokenStats = reactive({
  totalPrompt: 0,
  totalCompletion: 0,
  totalTokens: 0,
  byModel: {} as Record<string, { prompt: number; completion: number; total: number }>
})

const chatStorageConfig = reactive({
  platform: '',
  defaultUserDataDir: '',
  currentUserDataDir: ''
})

const tokenStatsTableData = computed(() => {
  const byModel = tokenStats.byModel || {}
  return Object.entries(byModel).map(([model, data]) => ({
    model,
    ...data
  }))
})

function formatNumber(num: number): string {
  return num.toLocaleString()
}

function getProviderName(provider: string) {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    meta: 'Meta',
    mistral: 'Mistral AI',
    openrouter: 'OpenRouter',
    baidu: '百度文心一言',
    aliyun: '阿里云通义千问',
    tencent: '腾讯混元大模型',
    bytedance: '字节跳动豆包',
    zhipu: '智谱AI GLM',
    local: '本地模型',
    custom: '自定义'
  }
  return names[provider] || provider
}

function applyTheme() {
  const theme = String(config.value.settings.theme || 'light').toLowerCase()
  const classes = ['theme-dark', 'theme-gray']
  document.documentElement.classList.remove(...classes)
  if (theme === 'dark') {
    document.documentElement.classList.add('theme-dark')
  } else if (theme === 'gray') {
    document.documentElement.classList.add('theme-gray')
  }
}

async function loadConfig() {
  try {
    const response = await apiClient.get('/api/config') as any
    const data = response?.data
    config.value = {
      settings: {
        backendPort: data?.settings?.backendPort ?? __BACKEND_PORT__,
        theme: data?.settings?.theme ?? 'light',
        language: data?.settings?.language ?? 'zh-CN',
        activeModelId: data?.settings?.activeModelId ?? '',
        userDataDir: data?.settings?.userDataDir ?? '',
        skillsDir: data?.settings?.skillsDir ?? '',
        proxy: data?.settings?.proxy ?? { enabled: false, protocol: 'http', host: '', port: 0, username: '', password: '' }
      },
      models: Array.isArray(data?.models) && data.models.length > 0 ? data.models : [],
      skills: Array.isArray(data?.skills) ? data.skills : []
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
}

async function persistConfig(message?: string) {
  try {
    const response = await apiClient.put('/api/config', config.value as unknown as Record<string, unknown>) as any
    ElMessage.success(response.message || message || t('saveSuccess'))
  } catch (error: any) {
    ElMessage.error(String(error.message || error || t('saveFailed')))
  }
}

async function loadTokenStats() {
  try {
    const response = await apiClient.get('/api/token-stats') as any
    if (response?.data) {
      tokenStats.totalPrompt = response.data.totalPrompt || 0
      tokenStats.totalCompletion = response.data.totalCompletion || 0
      tokenStats.totalTokens = response.data.totalTokens || 0
      tokenStats.byModel = response.data.byModel || {}
    }
  } catch (error) {
    console.error('加载 Token 统计失败:', error)
  }
}

async function saveChatStorageDirectory() {
  try {
    const response = await apiClient.put('/api/chat-history/config', { userDataDir: chatStorageConfig.currentUserDataDir }) as any
    const data = response?.data || {}
    chatStorageConfig.platform = String(data.platform || chatStorageConfig.platform || '')
    chatStorageConfig.defaultUserDataDir = String(data.defaultUserDataDir || chatStorageConfig.defaultUserDataDir || '')
    chatStorageConfig.currentUserDataDir = String(data.currentUserDataDir || chatStorageConfig.currentUserDataDir || '')
    config.value.settings.userDataDir = chatStorageConfig.currentUserDataDir
    ElMessage.success(t('dataDirectorySaved'))
  } catch (error: any) {
    ElMessage.error(String(error.message || error))
  }
}

function activateModel(modelId: string) {
  config.value.settings.activeModelId = modelId
  selectedChatModel.value = modelId
  persistConfig()
  ElMessage.success(t('modelActivated'))
}

function openModelDialog(mode: 'add' | 'edit', model: any = null) {
  modelDialogMode.value = mode
  if (model) {
    currentModel.value = { ...model }
  } else {
    currentModel.value = {
      id: '',
      name: '',
      provider: 'openai',
      customProviderName: '',
      apiKey: '',
      modelName: '',
      apiBaseUrl: '',
      isBuiltIn: false,
      isActive: true,
      createdAt: '',
      updatedAt: ''
    }
  }
  modelDialogVisible.value = true
}

function saveModel() {
  if (!currentModel.value) {
    ElMessage.error(t('modelDataEmpty'))
    return
  }

  if (!currentModel.value.name.trim()) {
    ElMessage.error(t('enterModelName'))
    return
  }

  if (!currentModel.value.modelName.trim()) {
    ElMessage.error(t('enterModelName'))
    return
  }

  if (!currentModel.value.apiBaseUrl.trim()) {
    ElMessage.error(t('enterApiBaseUrl'))
    return
  }

  if (modelDialogMode.value === 'add') {
    if (currentModel.value) {
      currentModel.value.id = 'model-' + Date.now()
      currentModel.value.createdAt = new Date().toISOString()
      currentModel.value.updatedAt = new Date().toISOString()
      currentModel.value.isBuiltIn = false

      if (!config.value.models) {
        config.value.models = []
      }
      config.value.models.push(currentModel.value)
      if (!config.value.settings.activeModelId) {
        config.value.settings.activeModelId = currentModel.value.id
      }
      if (!selectedChatModel.value) {
        selectedChatModel.value = currentModel.value.id
      }
    }
  } else {
    if (currentModel.value) {
      const index = config.value.models.findIndex(m => m.id === currentModel.value!.id)
      if (index !== -1) {
        currentModel.value.updatedAt = new Date().toISOString()
        currentModel.value.isBuiltIn = config.value.models[index].isBuiltIn
        config.value.models[index] = currentModel.value
      }
    }
  }

  persistConfig()
  modelDialogVisible.value = false
}

function deleteModel(modelId: string) {
  ElMessageBox.confirm(
    t('deleteConfirmMessage'),
    t('confirmDelete'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(() => {
    config.value.models = config.value.models.filter(m => m.id !== modelId)

    if (config.value.settings.activeModelId === modelId) {
      const firstModel = config.value.models[0]
      config.value.settings.activeModelId = firstModel?.id || ''
    }
    if (selectedChatModel.value === modelId) {
      selectedChatModel.value = config.value.models[0]?.id || ''
    }

    persistConfig()
    ElMessage.success(t('deleteSuccess'))
  }).catch(() => {
  })
}

function checkForUpdate() {
  ElMessage.info('已是最新版本')
}

watch(activeSettingTab, (newTab) => {
  if (newTab === 'token') {
    loadTokenStats()
  }
})

watch(
  () => config.value.settings.theme,
  () => applyTheme(),
  { immediate: true }
)

onMounted(async () => {
  await loadConfig()
  await loadChatStorageConfig()
  await loadTokenStats()
  applyTheme()
})

async function loadChatStorageConfig() {
  try {
    const response = await apiClient.get('/api/chat-history/config') as any
    const data = response?.data || {}
    chatStorageConfig.platform = String(data.platform || '')
    chatStorageConfig.defaultUserDataDir = String(data.defaultUserDataDir || '')
    chatStorageConfig.currentUserDataDir = String(data.currentUserDataDir || '')
    if (chatStorageConfig.currentUserDataDir) {
      config.value.settings.userDataDir = chatStorageConfig.currentUserDataDir
    }
  } catch (error) {
    console.error('加载聊天存储配置失败:', error)
  }
}
</script>

<style scoped>
.settings-page {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

/* 模型配置样式 */
.model-config-container {
  padding: 0;
}

.model-list-simple {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.model-item:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-fill-color-light);
}

.model-item.active {
  border-color: var(--el-border-color);
  background: var(--el-fill-color-light);
}

.model-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.model-item-info {
  flex: 1;
  min-width: 0;
}

.model-item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.model-item-provider {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.model-item-actions {
  display: flex;
  gap: 8px;
}

.model-item-actions .el-button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.model-add-simple {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

.model-add-simple:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.type-tag {
  font-size: 11px;
  padding: 2px 6px;
}

.status-tag-inline {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
}

.token-stats-container {
  padding: 0;
}

.token-stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.token-stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.about-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
}

.about-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.about-logo h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.about-version {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.about-desc {
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
}

.about-actions {
  margin-top: 16px;
}
</style>
