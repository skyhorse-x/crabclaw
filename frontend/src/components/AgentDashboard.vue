<template>
  <div class="agent-dashboard">
    <div class="dashboard-header">
      <div class="header-left">
        <h2>{{ t('agentDashboard') }}</h2>
        <span class="agent-count">{{ t('totalAgents') }}: {{ agents.length }}</span>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          {{ t('createAgent') }}
        </el-button>
      </div>
    </div>

    <div class="agent-grid" v-if="agents.length > 0">
      <AgentCard
        v-for="agent in agents"
        :key="agent.id"
        :agent="convertAgent(agent)"
        :selected="selectedAgentId === agent.id"
        @select="selectAgent"
        @toggle="toggleAgent"
        @stop="stopAgent"
        @view-log="viewAgentLog"
        @delete="confirmDeleteAgent"
      />
    </div>

    <el-empty v-else :description="t('noAgents')">
      <el-button type="primary" @click="showCreateDialog = true">
        {{ t('createFirstAgent') }}
      </el-button>
    </el-empty>

    <el-dialog
      v-model="showCreateDialog"
      :title="t('createAgent')"
      width="500px"
    >
      <el-form :model="newAgent" label-width="100px">
        <el-form-item :label="t('agentName')" required>
          <el-input v-model="newAgent.name" :placeholder="t('enterAgentName')" />
        </el-form-item>
        <el-form-item :label="t('agentRole')">
          <el-select v-model="newAgent.role" :placeholder="t('selectRole')" style="width: 100%">
            <el-option
              v-for="role in availableRoles"
              :key="role.value"
              :label="role.label"
              :value="role.value"
            />
          </el-select>
        </el-form-item>
        <el-collapse>
          <el-collapse-item title="高级选项" name="advanced">
            <el-form-item :label="t('agentPrompt')">
              <el-input
                v-model="newAgent.prompt"
                type="textarea"
                :rows="2"
                :placeholder="t('enterPrompt')"
              />
            </el-form-item>
            <el-form-item :label="t('agentModel')">
              <el-select v-model="newAgent.modelId" style="width: 100%">
                <el-option
                  v-for="model in availableModels"
                  :key="model.value"
                  :label="model.label"
                  :value="model.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('agentColor')">
              <div class="color-picker">
                <div
                  v-for="color in colorOptions"
                  :key="color"
                  class="color-option"
                  :class="{ active: newAgent.color === color }"
                  :style="{ backgroundColor: color }"
                  @click="newAgent.color = color"
                />
              </div>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="createAgent" :loading="creating">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showLogDialog"
      :title="`${currentLogAgent?.name || ''} - ${t('logTitle')}`"
      width="700px"
    >
      <div class="log-container">
        <div class="log-toolbar">
          <el-button size="small" @click="clearLog">{{ t('clearLog') }}</el-button>
          <el-button size="small" @click="exportLog">{{ t('exportLog') }}</el-button>
        </div>
        <div class="log-content" ref="logContentRef">
          <div
            v-for="(log, index) in currentLogs"
            :key="index"
            class="log-line"
            :class="log.level"
          >
            <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
            <span class="log-level">[{{ log.level.toUpperCase() }}]</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
          <div v-if="currentLogs.length === 0" class="log-empty">
            {{ t('noLogs') }}
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import AgentCard from './AgentCard.vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface Agent {
  id: string
  name: string
  role: string
  prompt?: string
  modelId?: string
  color: string
  status: 'idle' | 'running' | 'paused' | 'error'
  currentTask?: string
  progress: number
  runtime: number
  tasksCompleted: number
  createdAt: number
  updatedAt: number
  state?: string
}

interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
}

interface RoleOption {
  value: string
  label: string
  prompt?: string
  color?: string
}

const t = (key: string): string => {
  const translations: Record<string, string> = {
    agentDashboard: '代理仪表盘',
    totalAgents: '代理总数',
    createAgent: '创建代理',
    noAgents: '暂无代理，请创建一个开始',
    createFirstAgent: '创建第一个代理',
    agentName: '代理名称',
    enterAgentName: '输入代理名称',
    agentRole: '代理角色',
    selectRole: '选择角色',
    agentPrompt: '代理描述',
    enterPrompt: '输入代理描述...',
    agentModel: '使用模型',
    agentColor: '卡片颜色',
    cancel: '取消',
    confirm: '确认',
    delete: '删除',
    confirmDelete: '确认删除',
    deleteConfirmMessage: '确定要删除代理 "{name}" 吗？此操作不可撤销。',
    logTitle: '运行日志',
    clearLog: '清空',
    exportLog: '导出',
    noLogs: '暂无日志'
  }
  return translations[key] || key
}

const colorOptions = [
  '#4f46e5', '#7c3aed', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6'
]

const API_BASE = ''

const agents = ref<Agent[]>([])
const selectedAgentId = ref<string | null>(null)
const showCreateDialog = ref(false)
const showLogDialog = ref(false)
const currentLogAgent = ref<Agent | null>(null)
const logContentRef = ref<HTMLElement | null>(null)
const creating = ref(false)
let refreshInterval: ReturnType<typeof setInterval> | null = null

const currentLogs = ref<LogEntry[]>([])

const newAgent = ref<Partial<Agent>>({
  name: '',
  role: 'coder',
  prompt: '',
  modelId: '',
  color: colorOptions[0]
})

const availableModels = ref<{ value: string; label: string }[]>([])

const availableRoles = ref<RoleOption[]>([
  { value: 'coder', label: '程序员' },
  { value: 'researcher', label: '研究员' },
  { value: 'designer', label: '设计师' },
  { value: 'tester', label: '测试员' },
  { value: 'analyst', label: '分析师' }
])

async function fetchAgents() {
  try {
    const res = await fetch(`${API_BASE}/api/agents`)
    const data = await res.json()
    agents.value = data
  } catch (error) {
    console.error('Failed to fetch agents:', error)
  }
}

async function fetchModels() {
  try {
    const res = await fetch(`${API_BASE}/api/agent-models`)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        availableModels.value = data
        return
      }
    }
  } catch (error) {
    console.error('Failed to fetch models:', error)
  }
  try {
    const res = await fetch(`${API_BASE}/api/config`)
    if (res.ok) {
      const data = await res.json()
      if (data.data?.models && Array.isArray(data.data.models)) {
        availableModels.value = data.data.models.map((m: any) => ({
          value: m.id,
          label: m.name || m.id
        }))
      }
    }
  } catch (error) {
    console.error('Failed to fetch models from config:', error)
  }
}

async function fetchRoles() {
  try {
    const res = await fetch(`${API_BASE}/api/agents/roles`)
    const data = await res.json()
    availableRoles.value = data
  } catch (error) {
    console.error('Failed to fetch roles:', error)
  }
}

async function fetchLogs(agentId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/agents/${agentId}/logs`)
    const data = await res.json()
    currentLogs.value = data
  } catch (error) {
    console.error('Failed to fetch logs:', error)
    currentLogs.value = []
  }
}

function convertAgent(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    status: agent.status,
    currentTask: agent.currentTask,
    progress: agent.progress,
    runtime: agent.runtime,
    tasksCompleted: agent.tasksCompleted,
    color: agent.color
  }
}

function selectAgent(id: string) {
  selectedAgentId.value = id
}

async function toggleAgent(id: string) {
  const agent = agents.value.find(a => a.id === id)
  if (!agent) return

  try {
    if (agent.status === 'running') {
      await fetch(`${API_BASE}/api/agents/${id}/pause`, { method: 'POST' })
    } else {
      await fetch(`${API_BASE}/api/agents/${id}/start`, { method: 'POST' })
    }
    await fetchAgents()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

async function stopAgent(id: string) {
  try {
    await fetch(`${API_BASE}/api/agents/${id}/stop`, { method: 'POST' })
    await fetchAgents()
  } catch (error) {
    ElMessage.error('停止失败')
  }
}

async function deleteAgent(id: string) {
  try {
    const res = await fetch(`${API_BASE}/api/agents/${id}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedAgentId.value === id) {
        selectedAgentId.value = null
      }
      await fetchAgents()
      ElMessage.success('代理删除成功')
    } else {
      ElMessage.error('删除失败')
    }
  } catch (error) {
    ElMessage.error('删除失败')
  }
}

function confirmDeleteAgent(id: string) {
  const agent = agents.value.find(a => a.id === id)
  if (!agent) return
  ElMessageBox.confirm(
    `确定要删除代理 "${agent.name}" 吗？此操作不可撤销。`,
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    }
  ).then(() => {
    deleteAgent(id)
  }).catch(() => {})
}

async function viewAgentLog(id: string) {
  const agent = agents.value.find(a => a.id === id)
  if (agent) {
    currentLogAgent.value = agent
    showLogDialog.value = true
    await fetchLogs(id)
  }
}

async function createAgent() {
  if (!newAgent.value.name) {
    ElMessage.warning('请输入代理名称')
    return
  }

  creating.value = true
  try {
    const res = await fetch(`${API_BASE}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAgent.value)
    })

    if (res.ok) {
      showCreateDialog.value = false
      newAgent.value = {
        name: '',
        role: 'coder',
        prompt: '',
        modelId: '',
        color: colorOptions[0]
      }
      await fetchAgents()
      ElMessage.success('代理创建成功')
    } else {
      ElMessage.error('创建失败')
    }
  } catch (error) {
    ElMessage.error('创建失败')
  } finally {
    creating.value = false
  }
}

function clearLog() {
  currentLogs.value = []
}

function exportLog() {
  const content = currentLogs.value
    .map(log => `[${formatLogTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}`)
    .join('\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `agent-${currentLogAgent.value?.name}-${Date.now()}.log`
  a.click()
  URL.revokeObjectURL(url)
}

function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

onMounted(() => {
  fetchAgents()
  fetchModels()
  fetchRoles()
  refreshInterval = setInterval(() => {
    fetchAgents()
  }, 3000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
})
</script>

<style scoped>
.agent-dashboard {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-left h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.agent-count {
  font-size: 13px;
  color: var(--text-muted);
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s;
  border: 2px solid transparent;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-secondary);
}

.log-container {
  display: flex;
  flex-direction: column;
  height: 400px;
}

.log-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.log-content {
  flex: 1;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 12px;
  overflow-y: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
}

.log-line {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-light);
}

.log-empty {
  color: var(--text-muted);
  text-align: center;
  padding: 20px;
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-level {
  flex-shrink: 0;
  width: 50px;
}

.log-line.info .log-level {
  color: var(--accent-primary);
}

.log-line.warn .log-level {
  color: var(--warning);
}

.log-line.error .log-level {
  color: var(--danger);
}

.log-message {
  color: var(--text-primary);
  word-break: break-all;
}
</style>
