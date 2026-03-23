<template>
  <div class="agent-card" :class="{ selected: agent.selected }" @click="$emit('select', agent.id)">
    <div class="agent-card-header">
      <div class="agent-avatar" :style="{ backgroundColor: agent.color }">
        {{ agent.name.charAt(0).toUpperCase() }}
      </div>
      <div class="agent-info">
        <div class="agent-name">{{ agent.name }}</div>
        <div class="agent-role">{{ agent.role }}</div>
      </div>
      <div class="agent-status">
        <el-tag :type="getStatusType(agent.status)" size="small">
          {{ getStatusText(agent.status) }}
        </el-tag>
      </div>
      <el-dropdown trigger="click" @click.stop>
        <el-button text size="small" class="more-btn">
          <el-icon><MoreFilled /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click.stop="$emit('viewLog', agent.id)">
              <el-icon><Tickets /></el-icon>
              {{ t('viewLog') }}
            </el-dropdown-item>
            <el-dropdown-item @click.stop="$emit('stop', agent.id)">
              <el-icon><SwitchButton /></el-icon>
              {{ t('stop') }}
            </el-dropdown-item>
            <el-dropdown-item divided @click.stop="$emit('delete', agent.id)">
              <el-icon><Delete /></el-icon>
              {{ t('delete') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    
    <div class="agent-card-body">
      <div class="task-section">
        <div class="section-label">{{ t('currentTask') }}</div>
        <div class="task-content" :class="{ empty: !agent.currentTask }">
          {{ agent.currentTask || t('noTask') }}
        </div>
      </div>
      
      <div class="progress-section" v-if="agent.progress > 0">
        <div class="progress-label">
          <span>{{ t('progress') }}</span>
          <span>{{ agent.progress }}%</span>
        </div>
        <el-progress 
          :percentage="agent.progress" 
          :stroke-width="6"
          :show-text="false"
          :color="getProgressColor(agent.progress)"
        />
      </div>
      
      <div class="stats-section">
        <div class="stat-item">
          <el-icon><Clock /></el-icon>
          <span>{{ formatDuration(agent.runtime) }}</span>
        </div>
        <div class="stat-item">
          <el-icon><Document /></el-icon>
          <span>{{ agent.tasksCompleted }} {{ t('tasks') }}</span>
        </div>
      </div>
    </div>
    
    <div class="agent-card-footer">
      <el-button 
        size="small" 
        :type="agent.status === 'running' ? 'warning' : 'success'" 
        text
        @click.stop="$emit('toggle', agent.id)"
      >
        <el-icon v-if="agent.status === 'running'"><VideoPause /></el-icon>
        <el-icon v-else><VideoPlay /></el-icon>
        {{ agent.status === 'running' ? t('pause') : t('resume') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Clock, Document, Tickets, VideoPause, VideoPlay, SwitchButton, Delete, MoreFilled } from '@element-plus/icons-vue'

interface Agent {
  id: string
  name: string
  role: string
  status: 'idle' | 'running' | 'paused' | 'error'
  currentTask?: string
  progress: number
  runtime: number
  tasksCompleted: number
  color: string
  selected?: boolean
}

defineProps<{
  agent: Agent
}>()

defineEmits<{
  select: [id: string]
  toggle: [id: string]
  stop: [id: string]
  viewLog: [id: string]
  delete: [id: string]
}>()

const t = (key: string): string => {
  const translations: Record<string, string> = {
    currentTask: '当前任务',
    noTask: '暂无任务',
    progress: '进度',
    tasks: '任务',
    viewLog: '查看日志',
    pause: '暂停',
    resume: '恢复',
    stop: '停止',
    statusIdle: '空闲',
    statusRunning: '运行中',
    statusPaused: '已暂停',
    statusError: '异常'
  }
  return translations[key] || key
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    idle: 'info',
    running: 'success',
    paused: 'warning',
    error: 'danger'
  }
  return map[status] || 'info'
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    idle: t('statusIdle'),
    running: t('statusRunning'),
    paused: t('statusPaused'),
    error: t('statusError')
  }
  return map[status] || status
}

function getProgressColor(progress: number): string {
  if (progress < 30) return '#909399'
  if (progress < 70) return '#409eff'
  if (progress < 100) return '#e6a23c'
  return '#67c23a'
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
</script>

<style scoped>
.agent-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.agent-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.agent-card.selected {
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-md);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.agent-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 18px;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-role {
  font-size: 12px;
  color: var(--text-muted);
}

.agent-status {
  flex-shrink: 0;
}

.more-btn {
  padding: 4px;
  color: var(--text-muted);
}

.more-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.agent-card-header {
  margin-bottom: 12px;
}

.task-section {
  margin-bottom: 10px;
}

.section-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.task-content {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
  max-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.task-content.empty {
  color: var(--text-muted);
  font-style: italic;
}

.progress-section {
  margin-bottom: 10px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.stats-section {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-item .el-icon {
  font-size: 14px;
}

.agent-card-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.agent-card-footer .el-button {
  padding: 4px 8px;
}
</style>
