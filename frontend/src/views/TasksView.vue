<template>
  <div class="settings-panel tasks-settings-panel">
      <div class="panel-header">
        <div class="panel-header-left">
          <h3>{{ t('taskPanelTitle') }}</h3>
          <p class="panel-desc">{{ t('taskPanelDesc') }}</p>
        </div>
        <el-button size="small" @click="loadScheduledTasks">{{ t('refresh') }}</el-button>
      </div>

      <div class="scheduled-tasks-section">
        <h4>{{ t('scheduledTasksTitle') }}</h4>
        <div v-if="scheduledTasksLoading" class="tasks-loading">
          <el-icon class="is-loading"><LoadingIcon /></el-icon> {{ t('loading') }}
        </div>
        <div v-else-if="scheduledTasks.length === 0" class="tasks-empty">
          {{ t('scheduledTasksEmpty') }}
        </div>
        <div v-else class="scheduled-task-list">
          <div v-for="task in scheduledTasks" :key="task.id" class="scheduled-task-card">
            <div class="scheduled-task-header">
              <span class="scheduled-task-name">{{ task.name }}</span>
              <el-tag :type="task.enabled ? 'success' : 'info'" size="small">
                {{ task.enabled ? t('enabled') : t('disabled') }}
              </el-tag>
            </div>
            <div class="scheduled-task-info">
              <div class="scheduled-task-row">
                <span class="scheduled-task-label">{{ t('taskInterval') }}:</span>
                <span>{{ formatInterval(task.intervalMs) }}</span>
              </div>
              <div class="scheduled-task-row">
                <span class="scheduled-task-label">{{ t('taskLastRun') }}:</span>
                <span>{{ formatTime(task.lastRun) }}</span>
              </div>
              <div class="scheduled-task-row">
                <span class="scheduled-task-label">{{ t('taskNextRun') }}:</span>
                <span>{{ formatTime(task.nextRun) }}</span>
              </div>
              <div class="scheduled-task-row">
                <span class="scheduled-task-label">{{ t('taskTool') }}:</span>
                <span class="scheduled-task-tool">{{ task.toolName }}</span>
              </div>
            </div>
            <div class="scheduled-task-actions">
              <el-button size="small" @click="viewTaskLogs(task.id)">
                {{ selectedTaskId === task.id ? t('close') : t('viewLogs') }}
              </el-button>
              <el-button size="small" @click="editScheduledTask(task)">
                {{ t('edit') }}
              </el-button>
              <el-switch
                :model-value="task.enabled"
                @change="(val: boolean) => toggleScheduledTask(task.id, val)"
                :disabled="false"
              />
              <el-button size="small" type="danger" @click="deleteScheduledTask(task.id)">
                {{ t('delete') }}
              </el-button>
            </div>

            <div v-if="selectedTaskId === task.id" class="task-logs-section task-logs-inline">
              <div class="logs-header">
                <h4>{{ t('taskLogsTitle') }}</h4>
                <div class="logs-header-actions">
                  <el-button
                    size="small"
                    :disabled="taskLogsLoading || taskLogs.length === 0"
                    @click="copyAllTaskLogs"
                  >
                    {{ t('taskLogsCopyAll') }}
                  </el-button>
                  <el-button
                    size="small"
                    type="danger"
                    plain
                    :disabled="taskLogsLoading || taskLogs.length === 0"
                    @click="clearTaskLogs"
                  >
                    {{ t('taskLogsClear') }}
                  </el-button>
                </div>
              </div>
              <div v-if="taskLogsLoading" class="tasks-loading">
                <el-icon class="is-loading"><LoadingIcon /></el-icon> {{ t('loading') }}
              </div>
              <div v-else-if="taskLogs.length === 0" class="tasks-empty">
                {{ t('taskLogsEmpty') }}
              </div>
              <div v-else class="task-log-list">
                <div v-for="log in taskLogs" :key="log.id" class="task-log-item" :class="'log-' + log.status">
                  <div class="task-log-header">
                    <el-tag :type="log.status === 'success' ? 'success' : 'danger'" size="small">
                      {{ log.status === 'success' ? t('success') : t('failed') }}
                    </el-tag>
                    <span class="task-log-time">{{ formatTime(log.executedAt) }}</span>
                    <el-button text size="small" @click="copyTaskLog(log)">{{ t('copyMessage') }}</el-button>
                  </div>
                  <div v-if="log.result" class="task-log-result">{{ log.result }}</div>
                  <div v-if="log.error" class="task-log-error">{{ log.error }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-dialog v-model="editingTask" :title="t('editTask')" width="500px" v-if="editingTask">
        <el-form label-width="100px">
          <el-form-item :label="t('taskName')">
            <el-input v-model="editingTask.name" />
          </el-form-item>
          <el-form-item :label="t('taskInterval')">
            <el-input-number v-model="editingTask.intervalMs" :min="1000" :step="1000" />
            <span style="margin-left: 8px">ms</span>
          </el-form-item>
          <el-form-item :label="t('taskTool')">
            <el-input v-model="editingTask.toolName" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="cancelEditTask">{{ t('cancel') }}</el-button>
          <el-button type="primary" @click="saveScheduledTask">{{ t('save') }}</el-button>
        </template>
      </el-dialog>

      <div class="tasks-overview">
        <div class="task-stat-card">
          <div class="task-stat-label">{{ t('taskTotal') }}</div>
          <div class="task-stat-value">{{ currentPlan.length }}</div>
        </div>
        <div class="task-stat-card">
          <div class="task-stat-label">{{ t('taskRunning') }}</div>
          <div class="task-stat-value">{{ runningPlanCount }}</div>
        </div>
        <div class="task-stat-card">
          <div class="task-stat-label">{{ t('taskCompleted') }}</div>
          <div class="task-stat-value">{{ completedPlanCount }}</div>
        </div>
      </div>
      <div class="task-automation-card">
        <div class="task-automation-title">{{ t('taskAutomationTitle') }}</div>
        <div class="task-automation-desc">{{ t('taskAutomationDesc') }}</div>
        <div class="task-automation-actions">
          <el-select v-model="chatExecutionMode" size="small" style="width: 180px">
            <el-option :label="t('executionModeAuto')" value="auto" />
            <el-option :label="t('executionModeManual')" value="manual" />
          </el-select>
          <el-button size="small" @click="goToChat">{{ t('taskGoChat') }}</el-button>
        </div>
      </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading as LoadingIcon } from '@element-plus/icons-vue'
import { apiClient } from '../utils/api-client'

const { t } = useI18n()
const router = useRouter()

interface ScheduledTask {
  id: string
  name: string
  type: 'interval' | 'cron'
  intervalMs?: number
  toolName: string
  toolInput: Record<string, unknown>
  enabled: boolean
  lastRun?: number
  nextRun?: number
  createdAt: number
}

interface TaskLog {
  id: string
  taskId: string
  taskName: string
  status: 'success' | 'error'
  result?: string
  error?: string
  executedAt: number
}

const scheduledTasks = ref<ScheduledTask[]>([])
const scheduledTasksLoading = ref(false)
const taskLogs = ref<TaskLog[]>([])
const taskLogsLoading = ref(false)
const selectedTaskId = ref<string | null>(null)
let taskLogsInterval: ReturnType<typeof setInterval> | null = null

const editingTask = ref<ScheduledTask | null>(null)
const chatExecutionMode = ref<'auto' | 'manual'>('auto')
const currentPlan = ref<any[]>([])

const completedPlanCount = computed(() =>
  currentPlan.value.filter((step: any) => Boolean(step?.completed)).length
)
const runningPlanCount = computed(() =>
  currentPlan.value.filter((step: any) => Boolean(step?.active) && !step?.completed).length
)

function formatInterval(ms?: number): string {
  if (!ms) return '-'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} ${t('minutes') || '分钟'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${t('hours') || '小时'}`
  return `${Math.round(hours / 24)} ${t('days') || '天'}`
}

function formatTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

async function loadScheduledTasks() {
  scheduledTasksLoading.value = true
  try {
    const data = await apiClient.get('/api/scheduled-tasks') as any
    scheduledTasks.value = data.tasks
  } catch (err) {
    console.error('加载定时任务失败:', err)
  } finally {
    scheduledTasksLoading.value = false
  }
}

async function loadTaskLogs(taskId?: string) {
  taskLogsLoading.value = true
  try {
    let url = '/api/scheduled-tasks/logs'
    if (taskId) {
      url += `?taskId=${taskId}`
    }
    const data = await apiClient.get(url) as any
    taskLogs.value = data.logs
  } catch (err) {
    console.error('加载任务日志失败:', err)
  } finally {
    taskLogsLoading.value = false
  }
}

function viewTaskLogs(taskId: string) {
  if (selectedTaskId.value === taskId) {
    selectedTaskId.value = null
    taskLogs.value = []
    return
  }
  selectedTaskId.value = taskId
  loadTaskLogs(taskId)
}

watch(selectedTaskId, (taskId) => {
  if (taskLogsInterval) {
    clearInterval(taskLogsInterval)
    taskLogsInterval = null
  }
  if (!taskId) return
  taskLogsInterval = setInterval(() => {
    loadTaskLogs(taskId)
  }, 2000) as unknown as ReturnType<typeof setInterval>
})

async function clearTaskLogs() {
  if (!selectedTaskId.value) return

  try {
    await ElMessageBox.confirm(
      t('taskLogsClearConfirm'),
      t('taskLogsClearTitle'),
      { type: 'warning' }
    )
  } catch {
    return
  }

  try {
    await apiClient.post('/api/scheduled-tasks', {
      action: 'clear_logs',
      taskId: selectedTaskId.value
    })
    taskLogs.value = []
    ElMessage.success(t('taskLogsCleared'))
  } catch (err) {
    console.error('清空任务日志失败:', err)
    ElMessage.error(t('taskLogsClearFailed'))
  }
}

function formatTaskLogText(log: TaskLog): string {
  const lines = [
    `${t('taskName')}: ${log.taskName || ''}`,
    `${t('taskLogsTitle')}: ${log.status === 'success' ? t('success') : t('failed')}`,
    `${t('taskLastRun')}: ${formatTime(log.executedAt)}`
  ]
  if (log.result) {
    lines.push(`result: ${log.result}`)
  }
  if (log.error) {
    lines.push(`error: ${log.error}`)
  }
  return lines.join('\n')
}

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
    document.execCommand('copy')
    document.body.removeChild(textArea)
    if (showToast) {
      ElMessage.success(t('copied'))
    }
  }
}

async function copyTaskLog(log: TaskLog) {
  await copyMessageText(formatTaskLogText(log), true)
}

async function copyAllTaskLogs() {
  if (taskLogs.value.length === 0) return
  const content = taskLogs.value.map((log) => formatTaskLogText(log)).join('\n\n----------------\n\n')
  await copyMessageText(content, true)
}

function editScheduledTask(task: ScheduledTask) {
  editingTask.value = { ...task }
}

function cancelEditTask() {
  editingTask.value = null
}

async function saveScheduledTask() {
  if (!editingTask.value) return
  try {
    await apiClient.post('/api/scheduled-tasks', {
      action: 'update',
      id: editingTask.value.id,
      updates: {
        name: editingTask.value.name,
        intervalMs: editingTask.value.intervalMs,
        enabled: editingTask.value.enabled,
        toolName: editingTask.value.toolName,
        toolInput: editingTask.value.toolInput
      }
    })
    editingTask.value = null
    await loadScheduledTasks()
  } catch (err) {
    console.error('保存任务失败:', err)
  }
}

async function toggleScheduledTask(id: string, enabled: boolean) {
  const action = enabled ? 'enable' : 'disable'
  try {
    await apiClient.post('/api/scheduled-tasks', { action, id })
    await loadScheduledTasks()
  } catch (err) {
    console.error('切换定时任务状态失败:', err)
  }
}

async function deleteScheduledTask(id: string) {
  try {
    await apiClient.post('/api/scheduled-tasks', { action: 'delete', id })
    await loadScheduledTasks()
  } catch (err) {
    console.error('删除定时任务失败:', err)
  }
}

function goToChat() {
  router.push('/')
}

onMounted(() => {
  loadScheduledTasks()
})

onUnmounted(() => {
  if (taskLogsInterval) {
    clearInterval(taskLogsInterval)
    taskLogsInterval = null
  }
})
</script>

<style scoped>
.tasks-container {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.task-info h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
}

.task-info p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-interval {
  font-size: 13px;
  color: var(--text-secondary);
}

.tasks-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px 20px 0;
}

.task-stat-card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 14px;
}

.task-stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.task-stat-value {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-automation-card {
  margin: 14px 20px 20px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
}

.task-automation-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-automation-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.scheduled-tasks-section {
  margin: 14px 20px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
}

.scheduled-tasks-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.tasks-loading, .tasks-empty {
  text-align: center;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.scheduled-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scheduled-task-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  background: var(--el-fill-color-light);
}

.scheduled-task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.scheduled-task-name {
  font-weight: 500;
  font-size: 14px;
}

.scheduled-task-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scheduled-task-row {
  display: flex;
  gap: 4px;
}

.scheduled-task-label {
  color: var(--el-text-color-regular);
}

.scheduled-task-tool {
  font-family: monospace;
  font-size: 11px;
}

.scheduled-task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.task-logs-section {
  margin: 14px 20px;
  padding: 10px;
  border: 1px solid #1f2937;
  border-radius: 8px;
  background: #0b1220;
}

.task-logs-inline {
  margin: 10px 0 0;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.logs-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logs-header h4 {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
}

.task-log-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.task-log-item {
  border: 1px solid #1f2937;
  border-radius: 4px;
  padding: 6px 8px;
  background: #0f172a;
  color: #e5e7eb;
  font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  line-height: 1.35;
}

.task-log-item.log-success {
  border-left: 2px solid #22c55e;
}

.task-log-item.log-error {
  border-left: 2px solid #ef4444;
}

.task-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.task-log-time {
  font-size: 10px;
  color: #94a3b8;
}

.task-log-result {
  font-size: 11px;
  color: #d1d5db;
  white-space: pre-wrap;
  word-break: break-all;
}

.task-log-error {
  font-size: 11px;
  color: #f87171;
  white-space: pre-wrap;
  word-break: break-all;
}

.task-automation-actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.tasks-settings-panel {
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
}

.tasks-settings-panel .panel-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-primary);
}
</style>
