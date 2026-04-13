<template>
  <button class="monitor-toggle-btn" type="button" @click="$emit('toggle')">
    {{ visible ? labels.hide : labels.show }}
  </button>

  <aside
    class="monitor-panel"
    :class="{ collapsed: !visible }"
    :style="panelStyle"
    @mousedown.stop="startDrag"
  >
    <div class="monitor-panel-header drag-handle">
      <span>{{ labels.title }}</span>
      <el-button text size="small" @click="$emit('toggle')">
        {{ visible ? labels.hide : labels.show }}
      </el-button>
    </div>

    <div v-if="visible" class="monitor-panel-body">
      <div class="monitor-info-card">
        <div class="monitor-info-title">{{ labels.currentExec }}</div>
        <div class="monitor-info-row">
          <span>{{ labels.model }}</span>
          <strong>{{ execInfo.model }}</strong>
        </div>
        <div class="monitor-info-row">
          <span>{{ labels.token }}</span>
          <strong>{{ execInfo.token }}</strong>
        </div>
        <div class="monitor-info-row">
          <span>{{ labels.duration }}</span>
          <strong>{{ execInfo.duration }}</strong>
        </div>
        <div class="monitor-info-row">
          <span>{{ labels.mcpTools }}</span>
          <strong>{{ execInfo.mcpTools }}</strong>
        </div>
        <div class="monitor-info-row">
          <span>{{ labels.snapshot }}</span>
          <strong>{{ execInfo.snapshot }}</strong>
        </div>
      </div>

      <div class="monitor-control-card">
        <div class="monitor-control-row">
          <span>{{ labels.currentBot }}</span>
          <strong>{{ currentBotName }}</strong>
        </div>
        <div class="monitor-control-actions">
          <el-button text type="primary" @click="$emit('open-bot-dialog')">
            + {{ labels.addBot }}
          </el-button>
          <div class="monitor-auto">
            <span>{{ labels.autoRun }}</span>
            <el-switch :model-value="autoRun" @update:model-value="$emit('update:auto-run', $event)" />
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface MonitorExecInfo {
  model: string
  token: string
  duration: string
  mcpTools: string
  snapshot: string
}

interface MonitorLabels {
  title: string
  show: string
  hide: string
  currentExec: string
  model: string
  token: string
  duration: string
  mcpTools: string
  snapshot: string
  currentBot: string
  addBot: string
  autoRun: string
}

const props = defineProps<{
  visible: boolean
  execInfo: MonitorExecInfo
  currentBotName: string
  autoRun: boolean
  labels: MonitorLabels
}>()

defineEmits<{
  (e: 'toggle'): void
  (e: 'open-bot-dialog'): void
  (e: 'update:auto-run', value: boolean): void
}>()

const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const position = ref({ x: null as number | null, y: null as number | null })

const panelStyle = computed(() => {
  const style: Record<string, string> = {}
  if (position.value.x !== null) {
    style.right = 'auto'
    style.left = position.value.x + 'px'
  }
  if (position.value.y !== null) {
    style.top = position.value.y + 'px'
    style.bottom = 'auto'
  }
  return style
})

function startDrag(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.el-button')) return
  isDragging.value = true
  dragOffset.value = {
    x: e.clientX - (position.value.x ?? 300),
    y: e.clientY - (position.value.y ?? 46)
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return
  position.value = {
    x: Math.max(0, e.clientX - dragOffset.value.x),
    y: Math.max(0, e.clientY - dragOffset.value.y)
  }
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<style scoped>
.monitor-toggle-btn {
  position: absolute;
  right: 16px;
  top: 10px;
  z-index: 12;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color-page);
  color: var(--el-text-color-secondary);
  border-radius: 12px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.monitor-panel {
  position: absolute;
  right: 12px;
  top: 46px;
  bottom: 12px;
  width: 300px;
  border: 1px solid var(--el-border-color);
  border-radius: 14px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
  z-index: 11;
  overflow: hidden;
  transition: width 0.2s ease, opacity 0.2s ease;
}

.monitor-panel.collapsed {
  width: 0;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.monitor-panel-header,
.drag-handle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color);
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: move;
  user-select: none;
}

.monitor-panel-body {
  padding: 12px;
  height: calc(100% - 44px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.monitor-info-card,
.monitor-control-card {
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 12px;
  background: var(--el-bg-color);
}

.monitor-info-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 10px;
}

.monitor-info-row,
.monitor-control-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.monitor-info-row strong,
.monitor-control-row strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-control-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.monitor-auto {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .monitor-panel {
    width: calc(100% - 20px);
    left: 10px;
    right: 10px;
  }
}
</style>
