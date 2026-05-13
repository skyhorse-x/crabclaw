<template>
  <div class="agent-dashboard">
    <div class="dashboard-header">
      <div class="header-left">
        <h2>{{ t('agentDashboard') }}</h2>
        <span class="agent-count">{{ t('totalAgents') }}: {{ agents.length }}</span>
      </div>
      <div class="header-actions">
        <button class="create-agent-btn" @click="showCreateDialog = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ t('createAgent') }}
        </button>
      </div>
    </div>

    <div class="agent-grid" v-if="agents.length > 0">
      <AgentCard
        v-for="agent in agents"
        :key="agent.id"
        :agent="convertAgent(agent)"
        :selected="selectedAgentId === agent.id"
        @select="selectAgent"
        @run="openTaskDialog"
        @toggle="toggleAgent"
        @stop="stopAgent"
        @view-log="viewAgentLog"
        @delete="confirmDeleteAgent"
      />
    </div>

    <el-empty v-else :description="t('noAgents')">
      <button class="create-agent-btn" @click="showCreateDialog = true">
        {{ t('createFirstAgent') }}
      </button>
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
            <el-form-item :label="t('agentSkill')">
              <el-select v-model="newAgent.skillId" clearable style="width: 100%">
                <el-option
                  v-for="skill in availableSkills"
                  :key="skill.value"
                  :label="skill.label"
                  :value="skill.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('agentMcp')">
              <el-select v-model="newAgent.mcpServers" multiple collapse-tags style="width: 100%">
                <el-option
                  v-for="server in availableMcpServers"
                  :key="server"
                  :label="server"
                  :value="server"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('executionMode')">
              <el-select v-model="newAgent.executionMode" style="width: 100%">
                <el-option :label="t('executionModeAuto')" value="auto" />
                <el-option :label="t('executionModeManual')" value="manual" />
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
        <button class="create-agent-btn" :disabled="creating" @click="createAgent">{{ creating ? '创建中...' : t('confirm') }}</button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showTaskDialog"
      :title="t('runTaskTitle')"
      width="560px"
    >
      <el-form label-width="90px">
        <el-form-item :label="t('agentName')">
          <el-input :model-value="taskDialogAgent?.name || ''" disabled />
        </el-form-item>
        <el-form-item :label="t('taskInput')">
          <el-input
            v-model="taskInput"
            type="textarea"
            :rows="5"
            :placeholder="t('taskInputPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTaskDialog = false">{{ t('cancel') }}</el-button>
        <button class="create-agent-btn" :disabled="taskSubmitting" @click="submitAgentTask">{{ taskSubmitting ? '提交中...' : t('confirm') }}</button>
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
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import AgentCard from './agents/AgentCard.vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface Agent {
  id: string
  name: string
  role: string
  prompt?: string
  defaultTask?: string
  modelId?: string
  skillId?: string
  mcpServers?: string[]
  executionMode?: 'auto' | 'manual'
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
    agentSkill: '绑定技能',
    agentMcp: '允许 MCP',
    executionMode: '执行模式',
    executionModeAuto: '自动',
    executionModeManual: '手动确认',
    agentColor: '卡片颜色',
    runTaskTitle: '给代理下发任务',
    taskInput: '任务内容',
    taskInputPlaceholder: '可直接编辑；留空则使用该代理已保存的默认任务内容。',
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
  '#1a1a1a', '#3a3a3a', '#555555', '#777777',
  '#999999', '#bbbbbb'
]

const API_BASE = ''

const agents = ref<Agent[]>([])
const selectedAgentId = ref<string | null>(null)
const showCreateDialog = ref(false)
const showTaskDialog = ref(false)
const showLogDialog = ref(false)
const currentLogAgent = ref<Agent | null>(null)
const logContentRef = ref<HTMLElement | null>(null)
const creating = ref(false)
const taskSubmitting = ref(false)
let refreshInterval: ReturnType<typeof setInterval> | null = null
let logRefreshInterval: ReturnType<typeof setInterval> | null = null

const currentLogs = ref<LogEntry[]>([])
const taskDialogAgentId = ref<string | null>(null)
const taskInput = ref('')

const newAgent = ref<Partial<Agent>>({
  name: '',
  role: 'coder',
  prompt: '',
  defaultTask: '',
  modelId: '',
  skillId: '',
  mcpServers: [],
  executionMode: 'auto',
  color: colorOptions[0]
})

const availableModels = ref<{ value: string; label: string }[]>([])
const availableSkills = ref<{ value: string; label: string }[]>([])
const availableMcpServers = ref<string[]>([])

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

async function fetchSkills() {
  try {
    const res = await fetch(`${API_BASE}/api/config`)
    if (!res.ok) return
    const data = await res.json()
    const skills = Array.isArray(data?.data?.skills) ? data.data.skills : []
    availableSkills.value = skills.map((s: any) => ({
      value: String(s.id || ''),
      label: String(s.name || s.id || '')
    })).filter((s: { value: string; label: string }) => Boolean(s.value))
  } catch (error) {
    console.error('Failed to fetch skills:', error)
  }
}

async function fetchMcpServers() {
  try {
    const res = await fetch(`${API_BASE}/api/mcp`)
    if (!res.ok) return
    const data = await res.json()
    const servers = Array.isArray(data?.servers) ? data.servers : []
    availableMcpServers.value = servers.map((s: any) => String(s?.id || '')).filter(Boolean)
  } catch (error) {
    console.error('Failed to fetch MCP servers:', error)
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
    modelId: agent.modelId || 'default',
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

const taskDialogAgent = computed(() =>
  agents.value.find(agent => agent.id === taskDialogAgentId.value) || null
)

function openTaskDialog(id: string) {
  const agent = agents.value.find(item => item.id === id)
  taskDialogAgentId.value = id
  taskInput.value = String(agent?.defaultTask || '')
  showTaskDialog.value = true
}

async function submitAgentTask() {
  const agentId = taskDialogAgentId.value
  const task = String(taskInput.value || '').trim()
  const agent = agents.value.find(item => item.id === agentId)
  if (!agentId) return
  if (!task && !String(agent?.defaultTask || '').trim()) {
    ElMessage.warning(t('taskInputPlaceholder'))
    return
  }

  taskSubmitting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/agents/${agentId}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task })
    })
    const data = await res.json()
    if (!res.ok) {
      ElMessage.error(String(data?.error || '任务下发失败'))
      return
    }
    ElMessage.success('任务已下发')
    showTaskDialog.value = false
    await fetchAgents()
  } catch (error) {
    ElMessage.error('任务下发失败')
  } finally {
    taskSubmitting.value = false
  }
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

watch(showLogDialog, (visible) => {
  if (!visible) {
    if (logRefreshInterval) {
      clearInterval(logRefreshInterval)
      logRefreshInterval = null
    }
    return
  }
  if (!currentLogAgent.value) return
  if (logRefreshInterval) clearInterval(logRefreshInterval)
  logRefreshInterval = setInterval(() => {
    if (currentLogAgent.value) {
      fetchLogs(currentLogAgent.value.id)
    }
  }, 2000)
})

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
        defaultTask: '',
        modelId: '',
        skillId: '',
        mcpServers: [],
        executionMode: 'auto',
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
  fetchSkills()
  fetchMcpServers()
  refreshInterval = setInterval(() => {
    fetchAgents()
  }, 3000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  if (logRefreshInterval) {
    clearInterval(logRefreshInterval)
    logRefreshInterval = null
  }
})
</script>

<style scoped>
.agent-dashboard {
  padding: 28px 32px;
  height: 100%;
  overflow-y: auto;
  background: #f5f5f5;
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
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.agent-count {
  font-size: 13px;
  color: #999999;
}

.create-agent-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #1a1a1a;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}

.create-agent-btn:hover {
  background: #333333;
  transform: translateY(-1px);
}

.create-agent-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.agent-dashboard :deep(.el-dialog) {
  max-height: 86vh;
}

.agent-dashboard :deep(.el-dialog__body) {
  max-height: calc(86vh - 120px);
  overflow-y: auto;
  padding-right: 10px;
}

.agent-dashboard :deep(.el-form-item__content) {
  min-width: 0;
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
  box-shadow: none;
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
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
  color: var(--text-secondary);
}

.log-line.warn .log-level {
  color: var(--text-secondary);
}

.log-line.error .log-level {
  color: var(--text-secondary);
  opacity: 0.9;
}

.log-message {
  color: var(--text-primary);
  word-break: break-all;
}
</style>
