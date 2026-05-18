<template>
  <div class="pipeline-dashboard">

    <!-- 头部 -->
    <div class="pd-header">
      <div class="pd-header-left">
        <h2>流水线</h2>
        <span class="pd-count">{{ pipelines.length }} 条</span>
      </div>
      <button class="pd-create-btn" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建流水线
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="pipelines.length === 0 && !loading" class="pd-empty">
      <div class="pd-empty-icon">⛓</div>
      <p class="pd-empty-title">还没有流水线</p>
      <p class="pd-empty-desc">创建一条流水线，让多个 Agent 按顺序协作完成项目</p>
      <button class="pd-create-btn" @click="openCreate">新建流水线</button>
    </div>

    <!-- 流水线列表 -->
    <div class="pd-list" v-else>
      <div
        v-for="pl in pipelines"
        :key="pl.id"
        class="pd-card"
        @click="openDetail(pl)"
      >
        <div class="pd-card-top">
          <div class="pd-card-info">
            <span class="pd-card-name">{{ pl.name }}</span>
            <span class="pd-card-desc" v-if="pl.description">{{ pl.description }}</span>
          </div>
          <span class="pd-status-badge" :class="`status-${pl.status}`">{{ statusLabel(pl.status) }}</span>
        </div>

        <!-- 步骤预览 -->
        <div class="pd-steps-preview">
          <template v-for="(step, idx) in pl.steps" :key="step.id">
            <div class="pd-step-chip" :class="getStepClass(pl, idx)">
              {{ step.agentName || '未命名' }}
            </div>
            <svg v-if="idx < pl.steps.length - 1" class="pd-step-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </template>
          <span v-if="pl.steps.length === 0" class="pd-no-steps">暂无步骤</span>
        </div>

        <div class="pd-card-footer">
          <span class="pd-step-count">{{ pl.steps.length }} 个步骤</span>
          <div class="pd-card-actions" @click.stop>
            <button class="pd-icon-btn" title="编辑" @click="openEdit(pl)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="pd-icon-btn pd-icon-btn--danger" title="删除" @click="confirmDelete(pl)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="showForm"
      :title="editingPipeline ? '编辑流水线' : '新建流水线'"
      width="640px"
      :close-on-click-modal="false"
    >
      <div class="pd-form">
        <div class="pd-form-row">
          <label>名称</label>
          <input v-model="form.name" class="pd-input" placeholder="如：产品研发流水线" />
        </div>
        <div class="pd-form-row">
          <label>描述</label>
          <input v-model="form.description" class="pd-input" placeholder="简要描述这条流水线的用途" />
        </div>

        <div class="pd-steps-editor">
          <div class="pd-steps-editor-header">
            <span>执行步骤</span>
            <button class="pd-add-step-btn" @click="addStep">+ 添加步骤</button>
          </div>

          <div class="pd-steps-list">
            <div
              v-for="(step, idx) in form.steps"
              :key="step.id"
              class="pd-step-editor-row"
            >
              <div class="pd-step-order">{{ idx + 1 }}</div>
              <div class="pd-step-fields">
                <div class="pd-step-top-row">
                  <select v-model="step.agentId" class="pd-select" @change="onAgentChange(step)">
                    <option value="">选择 Agent</option>
                    <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
                  </select>
                  <label class="pd-checkbox-label">
                    <input type="checkbox" v-model="step.waitForApproval" />
                    <span>执行前需审批</span>
                  </label>
                  <button class="pd-remove-step" @click="removeStep(idx)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <textarea
                  v-model="step.promptTemplate"
                  class="pd-textarea"
                  rows="2"
                  :placeholder="`任务提示词，可用 {{output}} 引用上一步输出\n例：根据以下需求文档设计UI界面：{{output}}`"
                />
              </div>
            </div>
            <div v-if="form.steps.length === 0" class="pd-steps-empty">
              点击「添加步骤」开始编排流程
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <button class="pd-create-btn" :disabled="saving" @click="saveForm">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </template>
    </el-dialog>

    <!-- 详情/运行对话框 -->
    <el-dialog
      v-model="showDetail"
      :title="detailPipeline?.name || '流水线详情'"
      width="720px"
      :close-on-click-modal="false"
      @open="onDetailOpen"
    >
      <div v-if="detailPipeline" class="pd-detail">

        <!-- 输入区 -->
        <div class="pd-detail-input" v-if="detailPipeline.status !== 'running'">
          <label class="pd-detail-label">初始输入（将作为第一个 Agent 的任务内容）</label>
          <textarea v-model="runInput" class="pd-textarea" rows="3" placeholder="描述你要完成的项目目标，例：开发一个电商小程序..." />
        </div>

        <!-- 步骤进度 -->
        <div class="pd-detail-steps">
          <div
            v-for="(step, idx) in detailPipeline.steps"
            :key="step.id"
            class="pd-detail-step"
            :class="getStepClass(detailPipeline, idx)"
          >
            <div class="pd-detail-step-left">
              <div class="pd-detail-step-num">{{ idx + 1 }}</div>
              <div class="pd-detail-step-line" v-if="idx < detailPipeline.steps.length - 1"></div>
            </div>
            <div class="pd-detail-step-body">
              <div class="pd-detail-step-header">
                <span class="pd-detail-step-name">{{ step.agentName }}</span>
                <span v-if="step.waitForApproval" class="pd-approval-tag">需审批</span>
                <span class="pd-detail-step-status">{{ getStepStatusLabel(detailPipeline, idx) }}</span>
              </div>
              <div class="pd-detail-step-output" v-if="getStepOutput(detailPipeline, idx)">
                <pre>{{ getStepOutput(detailPipeline, idx) }}</pre>
              </div>
              <!-- 审批按钮 -->
              <div v-if="detailPipeline.status === 'paused' && detailPipeline.currentStepIndex === idx && step.waitForApproval" class="pd-approval-actions">
                <button class="pd-create-btn" @click="approve(detailPipeline.id)">批准并继续</button>
                <el-button @click="stopPipeline(detailPipeline.id)">暂停</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 运行日志 -->
        <div class="pd-logs" v-if="runLogs.length > 0">
          <div class="pd-logs-title">运行日志</div>
          <div class="pd-logs-body">
            <div v-for="(log, i) in runLogs" :key="i" class="pd-log-row" :class="`log-${log.status}`">
              <span class="pd-log-agent">{{ log.agent_name }}</span>
              <span class="pd-log-status">{{ log.status }}</span>
              <span class="pd-log-time">{{ formatTime(log.started_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="pd-detail-footer">
          <div>
            <el-button v-if="detailPipeline?.status === 'running'" type="danger" @click="stopPipeline(detailPipeline!.id)">暂停</el-button>
          </div>
          <div style="display:flex;gap:8px">
            <el-button @click="showDetail = false">关闭</el-button>
            <button
              class="pd-create-btn"
              :disabled="detailPipeline?.status === 'running' || running"
              @click="runPipeline(detailPipeline!.id)"
            >
              {{ running ? '启动中...' : detailPipeline?.status === 'running' ? '运行中...' : '▶ 开始运行' }}
            </button>
          </div>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiClient } from '../utils/api-client'

interface PipelineStep {
  id: string
  agentId: string
  agentName: string
  order: number
  promptTemplate: string
  waitForApproval: boolean
}

interface Pipeline {
  id: string
  name: string
  description: string
  steps: PipelineStep[]
  status: 'idle' | 'running' | 'done' | 'error' | 'paused'
  currentStepIndex: number
  context: Record<string, string>
  createdAt: number
  updatedAt: number
}

interface AgentOption {
  id: string
  name: string
}

interface RunLog {
  pipeline_id: string
  step_id: string
  agent_name: string
  input: string
  output: string
  status: string
  started_at: number
  finished_at?: number
  error?: string
}

const pipelines = ref<Pipeline[]>([])
const agents = ref<AgentOption[]>([])
const loading = ref(false)
const saving = ref(false)
const running = ref(false)

const showForm = ref(false)
const showDetail = ref(false)
const editingPipeline = ref<Pipeline | null>(null)
const detailPipeline = ref<Pipeline | null>(null)
const runLogs = ref<RunLog[]>([])
const runInput = ref('')

const form = ref({
  name: '',
  description: '',
  steps: [] as PipelineStep[]
})

let pollTimer: ReturnType<typeof setInterval> | null = null

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

async function fetchPipelines() {
  try {
    const data = await apiClient.get('/api/pipelines') as any
    pipelines.value = Array.isArray(data) ? data : []
  } catch { /* ignore */ }
}

async function fetchAgents() {
  try {
    const data = await apiClient.get('/api/agents') as any
    agents.value = Array.isArray(data) ? data.map((a: any) => ({ id: a.id, name: a.name })) : []
  } catch { /* ignore */ }
}

async function fetchLogs(pipelineId: string) {
  try {
    const data = await apiClient.get(`/api/pipelines/${pipelineId}/logs`) as any
    runLogs.value = Array.isArray(data) ? data : []
  } catch { /* ignore */ }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    idle: '待运行', running: '运行中', done: '已完成', error: '出错', paused: '已暂停'
  }
  return map[status] || status
}

function getStepClass(pl: Pipeline, idx: number): string {
  if (pl.status === 'done') return 'step-done'
  if (idx < pl.currentStepIndex) return 'step-done'
  if (idx === pl.currentStepIndex && pl.status === 'running') return 'step-running'
  if (idx === pl.currentStepIndex && pl.status === 'paused') return 'step-waiting'
  return 'step-pending'
}

function getStepStatusLabel(pl: Pipeline, idx: number): string {
  if (pl.status === 'done' || idx < pl.currentStepIndex) return '✓ 完成'
  if (idx === pl.currentStepIndex && pl.status === 'running') return '● 运行中'
  if (idx === pl.currentStepIndex && pl.status === 'paused') return '⏸ 等待审批'
  if (idx === pl.currentStepIndex && pl.status === 'error') return '✕ 出错'
  return '待执行'
}

function getStepOutput(pl: Pipeline, idx: number): string {
  return pl.context?.[`step_${idx}`] || ''
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function openCreate() {
  editingPipeline.value = null
  form.value = { name: '', description: '', steps: [] }
  showForm.value = true
}

function openEdit(pl: Pipeline) {
  editingPipeline.value = pl
  form.value = {
    name: pl.name,
    description: pl.description,
    steps: pl.steps.map(s => ({ ...s }))
  }
  showForm.value = true
}

function openDetail(pl: Pipeline) {
  detailPipeline.value = { ...pl }
  runInput.value = ''
  runLogs.value = []
  showDetail.value = true
}

function onDetailOpen() {
  if (detailPipeline.value) {
    fetchLogs(detailPipeline.value.id)
    startPoll()
  }
}

function addStep() {
  form.value.steps.push({
    id: generateId(),
    agentId: '',
    agentName: '',
    order: form.value.steps.length,
    promptTemplate: '',
    waitForApproval: false
  })
}

function removeStep(idx: number) {
  form.value.steps.splice(idx, 1)
}

function onAgentChange(step: PipelineStep) {
  const agent = agents.value.find(a => a.id === step.agentId)
  step.agentName = agent?.name || ''
}

async function saveForm() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入流水线名称')
    return
  }
  saving.value = true
  try {
    const body = {
      name: form.value.name,
      description: form.value.description,
      steps: form.value.steps.map((s, i) => ({ ...s, order: i }))
    }
    if (editingPipeline.value) {
      await apiClient.put(`/api/pipelines/${editingPipeline.value.id}`, body)
      ElMessage.success('流水线已更新')
    } else {
      await apiClient.post('/api/pipelines', body)
      ElMessage.success('流水线已创建')
    }
    showForm.value = false
    await fetchPipelines()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function runPipeline(id: string) {
  running.value = true
  try {
    await apiClient.post(`/api/pipelines/${id}/run`, { input: runInput.value })
    ElMessage.success('流水线已启动')
    await fetchPipelines()
    const updated = pipelines.value.find(p => p.id === id)
    if (updated) detailPipeline.value = { ...updated }
    startPoll()
  } catch (e: any) {
    ElMessage.error(e?.message || '启动失败')
  } finally {
    running.value = false
  }
}

async function stopPipeline(id: string) {
  await apiClient.post(`/api/pipelines/${id}/stop`)
  await fetchPipelines()
  const updated = pipelines.value.find(p => p.id === id)
  if (updated) detailPipeline.value = { ...updated }
  ElMessage.info('已暂停')
}

async function approve(id: string) {
  await apiClient.post(`/api/pipelines/${id}/approve`)
  await fetchPipelines()
  const updated = pipelines.value.find(p => p.id === id)
  if (updated) detailPipeline.value = { ...updated }
  startPoll()
}

async function confirmDelete(pl: Pipeline) {
  await ElMessageBox.confirm(`确定删除流水线「${pl.name}」吗？`, '确认删除', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
  })
  await apiClient.delete(`/api/pipelines/${pl.id}`)
  ElMessage.success('已删除')
  await fetchPipelines()
}

function startPoll() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await fetchPipelines()
    if (detailPipeline.value) {
      const updated = pipelines.value.find(p => p.id === detailPipeline.value!.id)
      if (updated) {
        detailPipeline.value = { ...updated }
        await fetchLogs(updated.id)
        if (updated.status !== 'running') {
          clearInterval(pollTimer!)
          pollTimer = null
        }
      }
    }
  }, 2000)
}

onMounted(() => {
  fetchPipelines()
  fetchAgents()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.pipeline-dashboard {
  padding: 28px 32px;
  height: 100%;
  overflow-y: auto;
  background: #f5f5f5;
}

/* 头部 */
.pd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.pd-header-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.pd-header-left h2 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.pd-count {
  font-size: 13px;
  color: #999;
}

.pd-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #1a1a1a;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}

.pd-create-btn:hover { background: #333; transform: translateY(-1px); }
.pd-create-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* 空状态 */
.pd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  gap: 12px;
}

.pd-empty-icon { font-size: 48px; }
.pd-empty-title { font-size: 16px; font-weight: 600; color: #1a1a1a; }
.pd-empty-desc { font-size: 13px; color: #999; margin-bottom: 8px; }

/* 列表 */
.pd-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

/* 卡片 */
.pd-card {
  background: #fff;
  border-radius: 14px;
  padding: 18px 20px;
  border: 1px solid #efefef;
  cursor: pointer;
  transition: box-shadow 0.18s, transform 0.18s;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pd-card:hover {
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

.pd-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.pd-card-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pd-card-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }
.pd-card-desc { font-size: 12px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 状态徽章 */
.pd-status-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 20px;
}
.status-idle { background: #f0f0f0; color: #666; }
.status-running { background: #fef9c3; color: #a16207; }
.status-done { background: #dcfce7; color: #16a34a; }
.status-error { background: #fee2e2; color: #dc2626; }
.status-paused { background: #ebebeb; color: #555; }

/* 步骤预览 */
.pd-steps-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.pd-step-chip {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: #f0f0f0;
  color: #555;
  border: 1px solid #e8e8e8;
}

.pd-step-chip.step-done { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }
.pd-step-chip.step-running { background: #fef9c3; color: #a16207; border-color: #fde68a; animation: pulse-running 1.5s ease-in-out infinite; }
.pd-step-chip.step-waiting { background: #ebe9fe; color: #6d28d9; border-color: #c4b5fd; }

@keyframes pulse-running {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.pd-step-arrow { color: #ccc; flex-shrink: 0; }
.pd-no-steps { font-size: 12px; color: #bbb; }

/* 卡片底部 */
.pd-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pd-step-count { font-size: 12px; color: #999; }
.pd-card-actions { display: flex; gap: 4px; }

.pd-icon-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; background: transparent; color: #aaa;
  cursor: pointer; transition: all 0.15s;
}
.pd-icon-btn:hover { background: #f0f0f0; color: #555; }
.pd-icon-btn--danger:hover { background: #fee2e2; color: #dc2626; }

/* 表单 */
.pd-form { display: flex; flex-direction: column; gap: 16px; }
.pd-form-row { display: flex; flex-direction: column; gap: 6px; }
.pd-form-row label { font-size: 13px; font-weight: 500; color: #555; }

.pd-input {
  padding: 8px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 14px;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}
.pd-input:focus { border-color: #aaa; }

.pd-textarea {
  padding: 8px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 13px;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  resize: vertical;
  width: 100%;
  font-family: inherit;
  line-height: 1.6;
  transition: border-color 0.15s;
}
.pd-textarea:focus { border-color: #aaa; }

.pd-select {
  padding: 7px 10px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 13px;
  color: #1a1a1a;
  background: #fff;
  outline: none;
  flex: 1;
}

/* 步骤编辑器 */
.pd-steps-editor { display: flex; flex-direction: column; gap: 10px; }
.pd-steps-editor-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; font-weight: 500; color: #555;
}
.pd-add-step-btn {
  font-size: 12px; color: #1a1a1a; background: #ebebeb;
  border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer;
  transition: background 0.15s;
}
.pd-add-step-btn:hover { background: #e0e0e0; }

.pd-steps-list { display: flex; flex-direction: column; gap: 10px; max-height: 340px; overflow-y: auto; }

.pd-step-editor-row {
  display: flex; gap: 10px; align-items: flex-start;
  background: #f9f9f9; border-radius: 10px; padding: 12px;
  border: 1px solid #efefef;
}

.pd-step-order {
  width: 24px; height: 24px; border-radius: 50%; background: #1a1a1a; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0; margin-top: 6px;
}

.pd-step-fields { flex: 1; display: flex; flex-direction: column; gap: 8px; }

.pd-step-top-row { display: flex; align-items: center; gap: 8px; }

.pd-checkbox-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #555; white-space: nowrap; cursor: pointer;
}

.pd-remove-step {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 4px; background: transparent; color: #bbb;
  cursor: pointer; margin-left: auto; flex-shrink: 0;
}
.pd-remove-step:hover { background: #fee2e2; color: #dc2626; }

.pd-steps-empty { font-size: 13px; color: #bbb; text-align: center; padding: 20px; }

/* 详情 */
.pd-detail { display: flex; flex-direction: column; gap: 16px; }

.pd-detail-label { font-size: 13px; font-weight: 500; color: #555; margin-bottom: 6px; display: block; }

.pd-detail-input { display: flex; flex-direction: column; }

.pd-detail-steps { display: flex; flex-direction: column; gap: 0; }

.pd-detail-step {
  display: flex; gap: 14px;
}

.pd-detail-step-left {
  display: flex; flex-direction: column; align-items: center; flex-shrink: 0;
}

.pd-detail-step-num {
  width: 28px; height: 28px; border-radius: 50%;
  background: #e0e0e0; color: #555;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
  transition: all 0.2s;
}

.pd-detail-step.step-done .pd-detail-step-num { background: #dcfce7; color: #16a34a; }
.pd-detail-step.step-running .pd-detail-step-num { background: #fef9c3; color: #a16207; }
.pd-detail-step.step-waiting .pd-detail-step-num { background: #ebe9fe; color: #6d28d9; }
.pd-detail-step.step-pending .pd-detail-step-num { background: #f0f0f0; color: #999; }

.pd-detail-step-line {
  width: 2px; flex: 1; background: #efefef; margin: 4px 0; min-height: 20px;
}

.pd-detail-step-body {
  flex: 1; padding-bottom: 16px; display: flex; flex-direction: column; gap: 8px;
}

.pd-detail-step-header { display: flex; align-items: center; gap: 8px; padding-top: 4px; }
.pd-detail-step-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
.pd-approval-tag {
  font-size: 11px; padding: 2px 7px; border-radius: 10px;
  background: #ebe9fe; color: #6d28d9;
}
.pd-detail-step-status { font-size: 12px; color: #999; margin-left: auto; }

.pd-detail-step-output {
  background: #f9f9f9; border-radius: 8px; padding: 10px 12px;
  border: 1px solid #efefef;
}
.pd-detail-step-output pre {
  font-size: 12px; color: #555; white-space: pre-wrap; word-break: break-word;
  margin: 0; max-height: 120px; overflow-y: auto; font-family: inherit; line-height: 1.6;
}

.pd-approval-actions { display: flex; gap: 8px; align-items: center; }

/* 日志 */
.pd-logs { display: flex; flex-direction: column; gap: 8px; }
.pd-logs-title { font-size: 13px; font-weight: 500; color: #555; }
.pd-logs-body {
  background: #f9f9f9; border-radius: 8px; border: 1px solid #efefef;
  max-height: 120px; overflow-y: auto;
}
.pd-log-row {
  display: flex; align-items: center; gap: 12px;
  padding: 6px 12px; font-size: 12px; border-bottom: 1px solid #f0f0f0;
}
.pd-log-row:last-child { border-bottom: none; }
.pd-log-agent { font-weight: 500; color: #1a1a1a; flex-shrink: 0; }
.pd-log-status { color: #999; flex: 1; }
.pd-log-row.log-done .pd-log-status { color: #16a34a; }
.pd-log-row.log-error .pd-log-status { color: #dc2626; }
.pd-log-row.log-running .pd-log-status { color: #a16207; }
.pd-log-time { color: #bbb; flex-shrink: 0; }

/* 详情底部 */
.pd-detail-footer {
  display: flex; align-items: center; justify-content: space-between;
}
</style>
