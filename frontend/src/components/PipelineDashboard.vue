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

    <!-- 全页面编辑视图 -->
    <div v-if="showFullPageEdit" class="pd-fullpage-edit">
      <div class="pd-edit-header">
        <div class="pd-edit-header-left">
          <el-button text @click="closeFullPageEdit">
            <el-icon :size="18"><ArrowLeft /></el-icon>
            返回
          </el-button>
          <h2 class="pd-edit-title">{{ editingPipeline ? '编辑流水线' : '新建流水线' }}</h2>
        </div>
        <div class="pd-edit-header-actions">
          <el-button @click="closeFullPageEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveForm">
            {{ saving ? '保存中...' : '保存' }}
          </el-button>
        </div>
      </div>

      <div class="pd-edit-content">
        <div class="pd-edit-main">
          <div class="pd-edit-section">
            <h3 class="pd-section-title">基本信息</h3>
            <div class="pd-basic-form">
              <el-form-item label="流水线名称" required>
                <el-input
                  v-model="form.name"
                  placeholder="如：产品研发流水线"
                  maxlength="50"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item label="描述">
                <el-input
                  v-model="form.description"
                  type="textarea"
                  :rows="2"
                  placeholder="简要描述这条流水线的用途"
                  maxlength="200"
                  show-word-limit
                />
              </el-form-item>
            </div>
          </div>

          <div class="pd-edit-section">
            <div class="pd-steps-header-row">
              <h3 class="pd-section-title" style="margin:0;border:none;padding:0">执行步骤</h3>
              <span class="pd-steps-hint">拖拽左侧 ⠿ 手柄调整顺序</span>
            </div>

            <!-- 空状态 -->
            <div v-if="form.steps.length === 0" class="pd-steps-empty-new">
              <div class="pd-steps-empty-icon">⛓</div>
              <p class="pd-steps-empty-text">还没有步骤，从右侧点击 Agent 快速添加</p>
            </div>

            <!-- 线性步骤列表 -->
            <div class="pd-steps-linear">
              <template v-for="(step, idx) in form.steps" :key="step.id">
                <!-- 步骤行 -->
                <div
                  class="pd-step-row-item"
                  :class="{
                    'pd-step-row-item--dragging': dragIndex === idx,
                    'pd-step-row-item--dragover': dragOverIndex === idx && dragIndex !== idx
                  }"
                  draggable="true"
                  @dragstart="onDragStart(idx)"
                  @dragover="(e) => onDragOver(e, idx)"
                  @dragend="onDragEnd"
                >
                  <!-- 左：序号轨道 -->
                  <div class="pd-step-track">
                    <div class="pd-step-index">{{ idx + 1 }}</div>
                  </div>

                  <!-- 中：卡片主体 -->
                  <div class="pd-step-body">
                    <!-- 拖拽手柄 -->
                    <div class="pd-step-drag-handle">
                      <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
                        <circle cx="4" cy="4" r="1.5" fill="#c0c4cc"/>
                        <circle cx="10" cy="4" r="1.5" fill="#c0c4cc"/>
                        <circle cx="4" cy="10" r="1.5" fill="#c0c4cc"/>
                        <circle cx="10" cy="10" r="1.5" fill="#c0c4cc"/>
                        <circle cx="4" cy="16" r="1.5" fill="#c0c4cc"/>
                        <circle cx="10" cy="16" r="1.5" fill="#c0c4cc"/>
                      </svg>
                    </div>

                    <!-- Agent 头像 -->
                    <div
                      class="pd-step-avatar"
                      :style="{ background: getAgentColor(step.agentId) }"
                    >
                      {{ getAgentInitial(step.agentId) }}
                    </div>

                    <!-- Agent 信息 -->
                    <div class="pd-step-info">
                      <div class="pd-step-agent-name">{{ getAgentName(step.agentId) }}</div>
                      <div class="pd-step-agent-role">{{ getAgentRole(step.agentId) }}</div>
                    </div>

                    <!-- 提示词预览/编辑 -->
                    <div class="pd-step-prompt-area" @click="openStepPromptEditor(idx)">
                      <span v-if="step.promptTemplate" class="pd-step-prompt-text">{{ step.promptTemplate }}</span>
                      <span v-else class="pd-step-prompt-placeholder">点击设置任务提示词…</span>
                      <el-icon class="pd-step-prompt-edit-icon"><Edit /></el-icon>
                    </div>

                    <!-- 右：操作 -->
                    <div class="pd-step-actions">
                      <el-tooltip content="步骤工作目录（注入到系统提示词）" placement="top">
                        <div class="pd-step-workdir-wrap">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c0c4cc" stroke-width="2" class="pd-step-workdir-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          <input
                            v-model="step.workDir"
                            class="pd-step-workdir-input"
                            placeholder="/path/to/workdir"
                            @click.stop
                          />
                        </div>
                      </el-tooltip>
                      <label class="pd-step-approval-toggle">
                        <el-checkbox v-model="step.waitForApproval" size="small" />
                        <span class="pd-step-approval-label">需审批</span>
                      </label>
                      <el-tooltip content="失败自动重试次数（0=不重试）" placement="top">
                        <div class="pd-step-retry-wrap">
                          <span class="pd-step-retry-label">重试</span>
                          <el-input-number
                            v-model="step.maxRetries"
                            :min="0"
                            :max="3"
                            size="small"
                            controls-position="right"
                            class="pd-step-retry-input"
                          />
                        </div>
                      </el-tooltip>
                      <button class="pd-step-delete-btn" @click="removeStep(idx)" title="删除此步骤">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 步骤间箭头连接线 -->
                <div v-if="idx < form.steps.length - 1" class="pd-step-connector">
                  <div class="pd-step-connector-line"></div>
                  <svg class="pd-step-connector-arrow" width="12" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M1 1L6 6L11 1" stroke="#c0c4cc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div class="pd-edit-sidebar">
          <div class="pd-sidebar-section">
            <h3 class="pd-section-title">添加 Agent 步骤</h3>
            <p class="pd-sidebar-hint">点击 Agent 即可追加到流水线末尾</p>
            <div class="pd-agents-list">
              <div
                v-for="agent in agents"
                :key="agent.id"
                class="pd-agent-item"
                @click="selectAgentForNewStep(agent)"
              >
                <div class="pd-agent-item-avatar" :style="{ background: agent.color || '#6b7280' }">
                  {{ agent.name?.charAt(0) || '?' }}
                </div>
                <div class="pd-agent-item-info">
                  <div class="pd-agent-item-name">{{ agent.name }}</div>
                  <div class="pd-agent-item-desc">{{ agent.role || '未设置角色' }}</div>
                </div>
                <el-icon class="pd-agent-item-add"><Plus /></el-icon>
              </div>
              <div v-if="agents.length === 0" class="pd-no-agents">
                暂无代理，请先创建代理
              </div>
            </div>
          </div>

          <div class="pd-sidebar-section">
            <h3 class="pd-section-title">全局模型</h3>
            <p class="pd-sidebar-hint">覆盖各步骤 Agent 自身的模型设置</p>
            <el-select v-model="form.modelId" placeholder="不覆盖，使用各 Agent 自身模型" clearable class="pd-full-select">
              <el-option
                v-for="m in models"
                :key="m.id"
                :label="m.name"
                :value="m.id"
              />
            </el-select>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑提示词对话框 -->
    <el-dialog
      v-model="showPromptDialog"
      title="编辑任务提示词"
      width="600px"
      class="pd-prompt-dialog"
      :close-on-click-modal="false"
    >
      <div class="pd-prompt-editor">
        <div class="pd-prompt-agent" v-if="editingStepIndex !== null">
          <div
            class="pd-prompt-agent-avatar"
            :style="{ background: getAgentColor(form.steps[editingStepIndex]?.agentId) }"
          >
            {{ getAgentInitial(form.steps[editingStepIndex]?.agentId) }}
          </div>
          <div class="pd-prompt-agent-info">
            <div class="pd-prompt-agent-name">{{ getAgentName(form.steps[editingStepIndex]?.agentId) }}</div>
            <div class="pd-prompt-agent-desc">设置此步骤的任务提示词</div>
          </div>
        </div>
        <el-input
          v-model="editingStepPrompt"
          type="textarea"
          :rows="8"
          placeholder="任务提示词，可用 {{output}} 引用上一步输出&#10;&#10;例：根据以下需求文档设计UI界面：{{output}}"
        />
      </div>
      <template #footer>
        <el-button @click="showPromptDialog = false">取消</el-button>
        <el-button type="primary" @click="saveStepPrompt">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情/运行对话框 -->
    <el-dialog
      v-model="showDetail"
      :title="detailPipeline?.name || '流水线详情'"
      width="760px"
      :close-on-click-modal="false"
      class="pd-detail-dialog"
      @open="onDetailOpen"
    >
      <div v-if="detailPipeline" class="pd-detail">

        <el-form :model="runFormData" label-position="top" class="pd-run-form" v-if="detailPipeline.status !== 'running'">
          <el-form-item label="运行模型" class="pd-run-form-item">
            <template #label>
              <span class="pd-form-label">运行模型</span>
              <span v-if="detailPipeline.modelId && !runModelId" class="pd-model-saved-hint">
                已保存：{{ modelName(detailPipeline.modelId) }}
              </span>
            </template>
            <el-select v-model="runModelId" placeholder="使用流水线配置的模型" clearable class="pd-el-select-full">
              <el-option
                v-for="m in models"
                :key="m.id"
                :label="m.name"
                :value="m.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="初始输入" class="pd-run-form-item">
            <template #label>
              <span class="pd-form-label">初始输入</span>
              <span class="pd-form-label-hint">将作为第一个 Agent 的任务内容</span>
            </template>
            <el-input
              v-model="runInput"
              type="textarea"
              :rows="4"
              placeholder="描述你要完成的项目目标，例：开发一个电商小程序..."
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="工作目录" class="pd-run-form-item">
            <template #label>
              <span class="pd-form-label">工作目录</span>
              <span class="pd-form-label-hint">Agent 操作文件的根目录（可选）</span>
            </template>
            <el-input
              v-model="runWorkDir"
              placeholder="如：/Users/me/projects/my-mall"
              clearable
            />
          </el-form-item>
        </el-form>

        <!-- 步骤进度 -->
        <div class="pd-detail-steps">
          <div class="pd-section-title">执行进度</div>
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
              <div class="pd-detail-step-error" v-if="getStepError(detailPipeline, idx)">
                <div class="pd-detail-step-error-label">错误信息</div>
                <pre>{{ getStepError(detailPipeline, idx) }}</pre>
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
          <div class="pd-logs-title">
            运行日志
            <span class="pd-logs-count">{{ runLogs.length }} 条</span>
          </div>
          <div class="pd-logs-body">
            <div
              v-for="(log, i) in runLogs"
              :key="i"
              class="pd-log-row"
              :class="`log-${log.status}`"
              @click="toggleLogExpand(i)"
            >
              <div class="pd-log-main">
                <span class="pd-log-agent">{{ log.agent_name }}</span>
                <span class="pd-log-status-badge" :class="`badge-${log.status}`">{{ logStatusLabel(log.status) }}</span>
                <span class="pd-log-time">{{ formatTime(log.started_at) }}</span>
                <span v-if="log.error" class="pd-log-expand-icon">{{ expandedLog === i ? '▲' : '▼' }}</span>
              </div>
              <!-- 错误详情展开 -->
              <div v-if="log.error && expandedLog === i" class="pd-log-error">
                <div class="pd-log-error-label">错误信息</div>
                <pre class="pd-log-error-msg">{{ log.error }}</pre>
              </div>
              <!-- 输出展开 -->
              <div v-if="log.output && expandedLog === i" class="pd-log-output">
                <div class="pd-log-output-label">输出内容</div>
                <pre class="pd-log-output-msg">{{ log.output }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="pd-detail-footer">
          <div class="pd-detail-footer-left">
            <el-button v-if="detailPipeline?.status === 'running'" type="danger" @click="stopPipeline(detailPipeline!.id)">暂停</el-button>
            <el-button text @click="editFromDetail">
              <el-icon :size="14"><Edit /></el-icon>
              编辑流水线
            </el-button>
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
import { Delete, Plus, Rank, ArrowLeft, Edit } from '@element-plus/icons-vue'
import { apiClient } from '../utils/api-client'

interface PipelineStep {
  id: string
  agentId: string
  agentName: string
  order: number
  promptTemplate: string
  waitForApproval: boolean
  maxRetries?: number
  workDir?: string
}

interface Pipeline {
  id: string
  name: string
  description: string
  modelId?: string
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
  role?: string
  prompt?: string
  color?: string
}

interface ModelOption {
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
const models = ref<ModelOption[]>([])
const loading = ref(false)
const saving = ref(false)
const running = ref(false)

const showForm = ref(false)
const showDetail = ref(false)
const editingPipeline = ref<Pipeline | null>(null)
const detailPipeline = ref<Pipeline | null>(null)
const runLogs = ref<RunLog[]>([])
const runInput = ref('')
const runModelId = ref('')
const runWorkDir = ref('')
const expandedLog = ref<number | null>(null)
const runFormData = ref({
  modelId: '',
  input: ''
})
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const showFullPageEdit = ref(false)
const showPromptDialog = ref(false)
const editingStepPrompt = ref('')
const editingStepIndex = ref<number | null>(null)

const form = ref({
  name: '',
  description: '',
  modelId: '',
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
    agents.value = Array.isArray(data) ? data.map((a: any) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      prompt: a.prompt,
      color: a.color
    })) : []
  } catch { /* ignore */ }
}

async function fetchModels() {
  try {
    const data = await apiClient.get('/api/config') as any
    const list = data?.models || data?.data?.models || []
    models.value = list.filter((m: any) => m.isActive).map((m: any) => ({ id: m.id, name: m.name }))
  } catch { /* ignore */ }
}

function modelName(id: string): string {
  return models.value.find(m => m.id === id)?.name || id
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

function getStepError(pl: Pipeline, idx: number): string {
  if (pl.status !== 'error' || idx !== pl.currentStepIndex) return ''
  const log = [...runLogs.value].reverse().find(l => l.status === 'error')
  return log?.error || ''
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function logStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待执行', running: '运行中', done: '完成', error: '出错', waiting_approval: '待审批'
  }
  return map[status] || status
}

function toggleLogExpand(i: number) {
  expandedLog.value = expandedLog.value === i ? null : i
}

function openCreate() {
  editingPipeline.value = null
  form.value = { name: '', description: '', modelId: '', steps: [] }
  showFullPageEdit.value = true
}

function openEdit(pl: Pipeline) {
  editingPipeline.value = pl
  form.value = {
    name: pl.name,
    description: pl.description,
    modelId: pl.modelId || '',
    steps: pl.steps.map(s => ({ ...s }))
  }
  showFullPageEdit.value = true
}

function openDetail(pl: Pipeline) {
  detailPipeline.value = { ...pl }
  runInput.value = ''
  runModelId.value = pl.modelId || ''
  runWorkDir.value = ''
  runLogs.value = []
  showDetail.value = true
}

function editFromDetail() {
  if (detailPipeline.value) {
    showDetail.value = false
    openEdit(detailPipeline.value)
  }
}

function closeFullPageEdit() {
  showFullPageEdit.value = false
  editingPipeline.value = null
  form.value = { name: '', description: '', modelId: '', steps: [] }
}

function openStepPromptEditor(idx: number) {
  editingStepIndex.value = idx
  editingStepPrompt.value = form.value.steps[idx].promptTemplate || ''
  showPromptDialog.value = true
}

function saveStepPrompt() {
  if (editingStepIndex.value !== null) {
    form.value.steps[editingStepIndex.value].promptTemplate = editingStepPrompt.value
  }
  showPromptDialog.value = false
  editingStepIndex.value = null
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
    waitForApproval: false,
    maxRetries: 0,
    workDir: ''
  })
}

function removeStep(idx: number) {
  form.value.steps.splice(idx, 1)
}

function onAgentChange(step: PipelineStep) {
  const agent = agents.value.find(a => a.id === step.agentId)
  step.agentName = agent?.name || ''
}

function getAgentName(agentId: string): string {
  const agent = agents.value.find(a => a.id === agentId)
  return agent?.name || '未选择'
}

function getAgentRole(agentId: string): string {
  const agent = agents.value.find(a => a.id === agentId)
  return agent?.role || '未设置角色'
}

function getAgentColor(agentId: string): string {
  const agent = agents.value.find(a => a.id === agentId)
  return agent?.color || '#1a1a1a'
}

function getAgentInitial(agentId: string): string {
  const agent = agents.value.find(a => a.id === agentId)
  return agent?.name?.charAt(0).toUpperCase() || '?'
}

function selectAgentForNewStep(agent: AgentOption) {
  const step = {
    id: generateId(),
    agentId: agent.id,
    agentName: agent.name,
    order: form.value.steps.length,
    promptTemplate: '',
    waitForApproval: false,
    maxRetries: 0,
    workDir: ''
  }
  form.value.steps.push(step)
}

function onDragStart(idx: number) {
  dragIndex.value = idx
  dragOverIndex.value = idx
}

function onDragOver(event: DragEvent, idx: number) {
  event.preventDefault()
  if (dragIndex.value === null) return
  dragOverIndex.value = idx
}

function onDragEnd() {
  if (dragIndex.value !== null && dragOverIndex.value !== null && dragIndex.value !== dragOverIndex.value) {
    const newSteps = [...form.value.steps]
    const [moved] = newSteps.splice(dragIndex.value, 1)
    newSteps.splice(dragOverIndex.value, 0, moved)
    form.value.steps = newSteps
  }
  dragIndex.value = null
  dragOverIndex.value = null
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
      modelId: form.value.modelId,
      steps: form.value.steps.map((s, i) => ({ ...s, order: i }))
    }
    if (editingPipeline.value) {
      await apiClient.put(`/api/pipelines/${editingPipeline.value.id}`, body)
      ElMessage.success('流水线已更新')
    } else {
      await apiClient.post('/api/pipelines', body)
      ElMessage.success('流水线已创建')
    }
    closeFullPageEdit()
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
    // 如果用户在详情页选了模型，先保存到流水线配置
    if (runModelId.value !== (detailPipeline.value?.modelId || '')) {
      await apiClient.put(`/api/pipelines/${id}`, {
        name: detailPipeline.value?.name,
        description: detailPipeline.value?.description,
        modelId: runModelId.value,
        steps: detailPipeline.value?.steps
      })
    }
    await apiClient.post(`/api/pipelines/${id}/run`, { input: runInput.value, workDir: runWorkDir.value })
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
  fetchModels()
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
.pd-step-chip.step-waiting { background: #f0f0f0; color: #555; border-color: #e0e0e0; }

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

/* 表单对话框样式 */
:deep(.pd-form-dialog .el-dialog__header) {
  border-bottom: 1px solid #f0f0f0;
  padding: 16px 20px;
  margin-right: 0;
}

:deep(.pd-form-dialog .el-dialog__body) {
  padding: 20px 24px;
  max-height: 65vh;
  overflow-y: auto;
}

:deep(.pd-detail-dialog .el-dialog__header) {
  border-bottom: 1px solid #f0f0f0;
  padding: 16px 20px;
  margin-right: 0;
}

:deep(.pd-detail-dialog .el-dialog__body) {
  padding: 20px 24px;
  max-height: 65vh;
  overflow-y: auto;
}

/* Element Plus 表单样式 */
.pd-el-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pd-el-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.pd-el-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #303133;
  padding-bottom: 6px !important;
}

.pd-el-form :deep(.el-input__wrapper),
.pd-el-form :deep(.el-textarea__inner) {
  border-radius: 8px;
  box-shadow: none !important;
  border: 1px solid #dcdfe6;
  transition: all 0.2s;
}

.pd-el-form :deep(.el-input__wrapper:hover),
.pd-el-form :deep(.el-textarea__inner:hover) {
  border-color: #c0c4cc;
}

.pd-el-form :deep(.el-input__wrapper:focus-within),
.pd-el-form :deep(.el-textarea__inner:focus) {
  border-color: #555;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1) !important;
}

.pd-el-form :deep(.el-select .el-input__wrapper) {
  border-radius: 8px;
}

.pd-form-label {
  font-weight: 500;
  color: #303133;
}

.pd-form-label-hint {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 8px;
}

.pd-el-select {
  width: 100%;
}

.pd-el-select-full {
  width: 100%;
}

/* 步骤区块 */
.pd-steps-section {
  margin-top: 20px;
  padding: 16px 20px;
  background: #fafbfc;
  border-radius: 12px;
  border: 1px solid #f0f0f0;
}

.pd-steps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

/* 步骤标题 */
.pd-steps-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

:deep(.el-divider--horizontal) {
  margin: 24px 0 16px;
}

/* 步骤列表 */
.pd-steps-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.pd-steps-list::-webkit-scrollbar {
  width: 4px;
}

.pd-steps-list::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 2px;
}

.pd-steps-list::-webkit-scrollbar-track {
  background: transparent;
}

/* 步骤卡片 */
.pd-step-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: grab;
}

.pd-step-card:hover {
  border-color: #c0c4cc;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.pd-step-card:active {
  cursor: grabbing;
}

.pd-step-card--dragging {
  opacity: 0.5;
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.pd-step-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
  color: #fff;
}

.pd-drag-handle {
  cursor: grab;
  opacity: 0.7;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.pd-drag-handle:hover {
  opacity: 1;
}

.pd-step-card-title {
  font-size: 13px;
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-step-order {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.pd-step-delete-btn {
  opacity: 0.7;
  transition: opacity 0.2s;
}

.pd-step-delete-btn:hover {
  opacity: 1;
}

.pd-step-card-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pd-step-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.pd-step-form-item-flex {
  flex: 1;
  margin-bottom: 0 !important;
}

.pd-step-form-item {
  margin-bottom: 0 !important;
}

.pd-step-form-item :deep(.el-form-item__label) {
  font-size: 12px;
  color: #606266;
  padding-bottom: 4px !important;
}

.pd-step-approval :deep(.el-form-item__content) {
  line-height: 1;
}

:deep(.el-checkbox__label) {
  font-size: 13px;
  color: #606266;
}

/* 添加步骤按钮 */
.pd-add-step-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: 2px dashed #dcdfe6;
  background: transparent;
  color: #606266;
  transition: all 0.2s;
}

.pd-add-step-btn:hover {
  border-color: #555;
  color: #555;
  background: rgba(64, 158, 255, 0.04);
}

/* 空状态 */
.pd-steps-empty {
  padding: 20px;
  background: #fafafa;
  border-radius: 10px;
  border: 1px dashed #e4e7ed;
}

/* 运行表单样式 */
.pd-run-form {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ef 100%);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 20px;
}

.pd-run-form-item {
  margin-bottom: 16px !important;
}

.pd-run-form-item:last-child {
  margin-bottom: 0 !important;
}

.pd-run-form-item :deep(.el-form-item__label) {
  font-size: 13px;
}

.pd-model-saved-hint {
  font-size: 11px;
  color: #909399;
  font-weight: 400;
  margin-left: 8px;
}

/* 区块标题 */
.pd-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}

/* 详情 */
.pd-detail { display: flex; flex-direction: column; gap: 16px; }
.pd-model-saved-hint { font-size: 11px; color: #909399; margin-top: 2px; }

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
.pd-detail-step.step-waiting .pd-detail-step-num { background: #f0f0f0; color: #555; }
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
  background: #f0f0f0; color: #555;
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
.pd-logs-title {
  font-size: 13px; font-weight: 500; color: #555;
  display: flex; align-items: center; gap: 8px;
}
.pd-logs-count { font-size: 11px; color: #bbb; font-weight: 400; }
.pd-logs-body {
  background: #f9f9f9; border-radius: 8px; border: 1px solid #efefef;
  max-height: 260px; overflow-y: auto;
}
.pd-log-row {
  display: flex; flex-direction: column;
  padding: 6px 12px; font-size: 12px; border-bottom: 1px solid #f0f0f0;
  cursor: pointer; transition: background 0.1s;
}
.pd-log-row:hover { background: #f3f3f3; }
.pd-log-row:last-child { border-bottom: none; }
.pd-log-main { display: flex; align-items: center; gap: 10px; }
.pd-log-agent { font-weight: 500; color: #1a1a1a; flex-shrink: 0; }
.pd-log-status-badge {
  font-size: 11px; padding: 1px 7px; border-radius: 10px; flex-shrink: 0;
}
.badge-done { background: #dcfce7; color: #16a34a; }
.badge-error { background: #fee2e2; color: #dc2626; }
.badge-running { background: #fef9c3; color: #a16207; }
.badge-pending { background: #f0f0f0; color: #888; }
.badge-waiting_approval { background: #f0f0f0; color: #555; }
.pd-log-time { color: #bbb; margin-left: auto; flex-shrink: 0; }
.pd-log-expand-icon { color: #bbb; font-size: 10px; flex-shrink: 0; }
.pd-log-error {
  margin-top: 6px; padding: 8px 10px;
  background: #fff5f5; border-radius: 6px; border: 1px solid #fecaca;
}
.pd-log-error-label { font-size: 11px; color: #dc2626; font-weight: 500; margin-bottom: 4px; }
.pd-log-error-msg {
  font-size: 11px; color: #b91c1c; white-space: pre-wrap; word-break: break-word;
  margin: 0; max-height: 120px; overflow-y: auto; font-family: monospace;
}
.pd-log-output {
  margin-top: 6px; padding: 8px 10px;
  background: #f9f9f9; border-radius: 6px; border: 1px solid #efefef;
}
.pd-log-output-label { font-size: 11px; color: #555; font-weight: 500; margin-bottom: 4px; }
.pd-log-output-msg {
  font-size: 11px; color: #555; white-space: pre-wrap; word-break: break-word;
  margin: 0; max-height: 120px; overflow-y: auto; font-family: inherit; line-height: 1.5;
}

/* 步骤错误 */
.pd-detail-step-error {
  background: #fff5f5; border-radius: 8px; padding: 10px 12px;
  border: 1px solid #fecaca;
}
.pd-detail-step-error-label { font-size: 11px; color: #dc2626; font-weight: 500; margin-bottom: 4px; }
.pd-detail-step-error pre {
  font-size: 12px; color: #b91c1c; white-space: pre-wrap; word-break: break-word;
  margin: 0; max-height: 120px; overflow-y: auto; font-family: monospace; line-height: 1.5;
}

/* 详情底部 */
.pd-detail-footer {
  display: flex; align-items: center; justify-content: space-between;
}

.pd-detail-footer-left {
  display: flex; align-items: center; gap: 12px;
}

/* 全页面编辑视图 */
.pd-fullpage-edit {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #f5f5f5;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pd-edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.pd-edit-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pd-edit-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}

.pd-edit-header-actions {
  display: flex;
  gap: 10px;
}

.pd-edit-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: 24px;
  gap: 24px;
}

.pd-edit-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.pd-edit-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.pd-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.pd-basic-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 线性步骤列表 ===== */
.pd-steps-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.pd-steps-hint {
  font-size: 12px;
  color: #c0c4cc;
}

.pd-steps-empty-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 10px;
}

.pd-steps-empty-icon {
  font-size: 36px;
  opacity: 0.4;
}

.pd-steps-empty-text {
  font-size: 13px;
  color: #c0c4cc;
  margin: 0;
}

.pd-steps-linear {
  display: flex;
  flex-direction: column;
}

/* 步骤行 */
.pd-step-row-item {
  display: flex;
  align-items: stretch;
  gap: 0;
  transition: opacity 0.2s;
}

.pd-step-row-item--dragging {
  opacity: 0.4;
}

.pd-step-row-item--dragover .pd-step-body {
  border-color: #555;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08);
  background: #f5f5f5;
}

/* 左侧序号轨道 */
.pd-step-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
  flex-shrink: 0;
  padding-top: 18px;
}

.pd-step-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1a1a1a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 步骤主体卡片 */
.pd-step-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  margin-bottom: 0;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  cursor: grab;
  min-width: 0;
}

.pd-step-body:hover {
  border-color: #c0c4cc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.pd-step-body:active {
  cursor: grabbing;
}

/* 拖拽手柄 */
.pd-step-drag-handle {
  cursor: grab;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  opacity: 0.4;
  transition: opacity 0.2s;
  padding: 4px 2px;
}

.pd-step-body:hover .pd-step-drag-handle {
  opacity: 0.8;
}

/* 步骤头像 */
.pd-step-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

/* 步骤 Agent 信息 */
.pd-step-info {
  flex-shrink: 0;
  min-width: 120px;
}

.pd-step-agent-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-step-agent-role {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  white-space: nowrap;
}

/* 提示词预览区 */
.pd-step-prompt-area {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px dashed #e4e7ed;
  cursor: pointer;
  transition: all 0.2s;
}

.pd-step-prompt-area:hover {
  background: #f5f5f5;
  border-color: #d1d5db;
}

.pd-step-prompt-area:hover .pd-step-prompt-edit-icon {
  opacity: 1;
  color: #1a1a1a;
}

.pd-step-prompt-text {
  flex: 1;
  font-size: 12px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}

.pd-step-prompt-placeholder {
  flex: 1;
  font-size: 12px;
  color: #c0c4cc;
  font-style: italic;
}

.pd-step-prompt-edit-icon {
  flex-shrink: 0;
  font-size: 13px;
  color: #c0c4cc;
  opacity: 0;
  transition: all 0.2s;
}

/* 步骤操作区 */
.pd-step-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.pd-step-approval-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.pd-step-approval-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.pd-step-delete-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #c0c4cc;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.pd-step-delete-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* 步骤间连接箭头 */
.pd-step-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-left: 36px;
  height: 28px;
  justify-content: center;
  gap: 0;
}

.pd-step-connector-line {
  width: 2px;
  height: 14px;
  background: #e4e7ed;
}

.pd-step-connector-arrow {
  margin-top: -1px;
}

/* 侧边栏 */
.pd-edit-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.pd-sidebar-section {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.pd-sidebar-hint {
  font-size: 12px;
  color: #909399;
  margin: -8px 0 12px;
}

.pd-agents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
}

.pd-agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #fafbfc;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.pd-agent-item:hover {
  background: #f5f5f5;
  border-color: #e5e7eb;
}

.pd-agent-item-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.pd-agent-item-info {
  flex: 1;
  min-width: 0;
}

.pd-agent-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-agent-item-desc {
  font-size: 11px;
  color: #909399;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-agent-item-add {
  color: #c0c4cc;
  transition: color 0.15s;
  flex-shrink: 0;
}

.pd-agent-item:hover .pd-agent-item-add {
  color: #1a1a1a;
}

.pd-no-agents {
  font-size: 13px;
  color: #909399;
  text-align: center;
  padding: 20px;
}

.pd-full-select {
  width: 100%;
}

/* 提示词编辑对话框 */
.pd-prompt-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pd-prompt-agent {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fafbfc;
  border-radius: 10px;
}

.pd-prompt-agent-avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

.pd-prompt-agent-info {
  flex: 1;
}

.pd-prompt-agent-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.pd-prompt-agent-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

/* 重试次数控件 */
.pd-step-retry-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pd-step-retry-label {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}

.pd-step-retry-input {
  width: 68px;
}

.pd-step-retry-input :deep(.el-input__wrapper) {
  padding: 0 4px;
}

/* 工作目录输入 */
.pd-step-workdir-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pd-step-workdir-icon {
  flex-shrink: 0;
}

.pd-step-workdir-input {
  width: 160px;
  height: 28px;
  padding: 0 8px;
  font-size: 11px;
  color: #555;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafafa;
  outline: none;
  transition: border-color 0.2s;
  font-family: monospace;
}

.pd-step-workdir-input::placeholder {
  color: #c0c4cc;
}

.pd-step-workdir-input:hover {
  border-color: #c0c4cc;
}

.pd-step-workdir-input:focus {
  border-color: #555;
  background: #fff;
}
</style>
