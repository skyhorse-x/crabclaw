<script setup lang="ts">
import { computed } from 'vue'
import type { MultiAgentNode, MultiAgentIssue, MultiAgentResult } from '@/composables/useWebSocket'

const props = defineProps<{
  nodes: MultiAgentNode[]
  issues: MultiAgentIssue[]
  result: MultiAgentResult | null
  isVisible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

/** Agent 图标映射 */
const agentIcons: Record<string, string> = {
  frontend: '🎨',
  backend: '⚙️',
  test: '🧪',
  review: '🔍',
  security: '🔒'
}

/** Agent 中文名称 */
const agentNames: Record<string, string> = {
  frontend: '前端工程师',
  backend: '后端工程师',
  test: '测试工程师',
  review: '代码审查',
  security: '安全专家'
}

/** 状态图标 */
const statusIcons: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  success: '✅',
  failed: '❌',
  skipped: '⏭️'
}

/** 状态颜色 */
const statusColors: Record<string, string> = {
  pending: 'var(--el-color-info)',
  running: 'var(--el-color-primary)',
  success: 'var(--el-color-success)',
  failed: 'var(--el-color-danger)',
  skipped: 'var(--el-color-warning)'
}

/** 严重级别图标 */
const severityIcons: Record<string, string> = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
}

/** 是否有依赖关系 */
const hasDeps = (node: MultiAgentNode): boolean => node.deps.length > 0

/** 执行统计 */
const stats = computed(() => {
  if (!props.nodes.length) return null
  const total = props.nodes.length
  const success = props.nodes.filter(n => n.status === 'success').length
  const failed = props.nodes.filter(n => n.status === 'failed').length
  const running = props.nodes.filter(n => n.status === 'running').length
  return { total, success, failed, running }
})
</script>

<template>
  <transition name="slide-fade">
    <div v-if="isVisible" class="multi-agent-panel">
      <!-- 头部 -->
      <div class="panel-header">
        <div class="header-title">
          <span class="title-icon">🤖</span>
          <span>Multi-Agent 执行中</span>
        </div>
        <div class="header-stats" v-if="stats">
          <span class="stat-item">
            <span class="stat-success">{{ stats.success }}</span>/{{ total }}
          </span>
          <span v-if="stats.running" class="stat-running">{{ stats.running }} 执行中</span>
          <span v-if="stats.failed" class="stat-failed">{{ stats.failed }} 失败</span>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- DAG 节点列表 -->
      <div class="panel-body">
        <div class="nodes-container">
          <div
            v-for="node in nodes"
            :key="node.id"
            class="agent-node"
            :class="[`status-${node.status}`]"
          >
            <!-- 节点主体 -->
            <div class="node-header">
              <span class="agent-icon">{{ agentIcons[node.agentType] || '🤖' }}</span>
              <span class="agent-name">{{ agentNames[node.agentType] || node.agentType }}</span>
              <span class="status-badge" :style="{ color: statusColors[node.status] }">
                {{ statusIcons[node.status] }}
              </span>
            </div>

            <!-- 任务描述 -->
            <div class="node-task">{{ node.task }}</div>

            <!-- 依赖关系 -->
            <div v-if="hasDeps(node)" class="node-deps">
              <span class="deps-label">依赖:</span>
              <span v-for="dep in node.deps" :key="dep" class="dep-tag">{{ dep }}</span>
            </div>

            <!-- 进度动画 -->
            <div v-if="node.status === 'running'" class="progress-bar">
              <div class="progress-fill"></div>
            </div>
          </div>
        </div>

        <!-- 审查问题 -->
        <div v-if="issues.length > 0" class="issues-section">
          <div class="section-title">
            <span>🔍 审查结果</span>
            <span class="issue-count">{{ issues.length }} 项</span>
          </div>
          <div class="issues-list">
            <div
              v-for="(issue, idx) in issues"
              :key="idx"
              class="issue-item"
              :class="[`severity-${issue.severity}`]"
            >
              <span class="severity-icon">{{ severityIcons[issue.severity] }}</span>
              <span class="issue-text">{{ issue.message }}</span>
              <span v-if="issue.file" class="issue-file">{{ issue.file }}</span>
            </div>
          </div>
        </div>

        <!-- 最终结果 -->
        <div v-if="result" class="result-section">
          <div class="section-title">📋 执行结果</div>
          <div class="result-summary">{{ result.summary }}</div>
          <div v-if="result.files.length > 0" class="result-files">
            <div class="files-title">修改文件 ({{ result.files.length }}):</div>
            <div v-for="file in result.files" :key="file.path" class="file-item">
              <span class="file-action">{{ file.action === 'create' ? '🆕' : file.action === 'delete' ? '🗑️' : '✏️' }}</span>
              <span class="file-path">{{ file.path }}</span>
            </div>
          </div>
          <div v-if="result.stats" class="result-stats">
            <span>Token: {{ result.stats.totalTokens.toLocaleString() }}</span>
            <span>Agents: {{ result.stats.totalAgents }}</span>
            <span>耗时: {{ (result.stats.totalElapsedMs / 1000).toFixed(1) }}s</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.multi-agent-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 380px;
  height: 100%;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-lighter);
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.title-icon {
  font-size: 18px;
}

.header-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-success { color: var(--el-color-success); font-weight: 600; }
.stat-running { color: var(--el-color-primary); }
.stat-failed { color: var(--el-color-danger); }

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.nodes-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-node {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s ease;
}

.agent-node.status-running {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}

.agent-node.status-success {
  border-color: var(--el-color-success-light-7);
}

.agent-node.status-failed {
  border-color: var(--el-color-danger-light-7);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-icon {
  font-size: 20px;
}

.agent-name {
  flex: 1;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.status-badge {
  font-size: 16px;
}

.node-task {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  padding-left: 28px;
}

.node-deps {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-left: 28px;
  flex-wrap: wrap;
}

.deps-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.dep-tag {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
}

.progress-bar {
  margin-top: 8px;
  height: 3px;
  background: var(--el-fill-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: 30%;
  background: var(--el-color-primary);
  border-radius: 2px;
  animation: progress 1.5s ease-in-out infinite;
}

@keyframes progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

.issues-section,
.result-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.issue-count {
  font-size: 12px;
  padding: 2px 8px;
  background: var(--el-fill-color-light);
  border-radius: 10px;
  color: var(--el-text-color-secondary);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-item {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  font-size: 12px;
}

.issue-item.severity-error {
  background: var(--el-color-danger-light-9);
}

.issue-item.severity-warning {
  background: var(--el-color-warning-light-9);
}

.issue-text {
  flex: 1;
  color: var(--el-text-color-regular);
}

.issue-file {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.result-summary {
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  margin-bottom: 12px;
}

.result-files {
  margin-top: 12px;
}

.files-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 4px;
}

.file-action {
  font-size: 14px;
}

.file-path {
  font-size: 12px;
  font-family: monospace;
  color: var(--el-text-color-regular);
}

.result-stats {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 动画 */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
