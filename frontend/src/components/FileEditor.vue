<template>
  <div class="file-editor-panel" :class="{ collapsed: !visible, dragging: isDragging }" :style="{ width: panelWidth + 'px' }">
    <div class="file-editor-resize-handle" @mousedown.prevent="startResize"></div>
    <div class="file-editor-header">
      <div class="file-editor-title" v-if="currentFile">
        <el-icon style="color:#6366f1"><Document /></el-icon>
        <span class="file-editor-name">{{ currentFile.name }}</span>
        <span class="file-editor-path">{{ currentFile.path }}</span>
        <span v-if="hasChanges" class="file-editor-dirty">●</span>
      </div>
      <div class="file-editor-title" v-else>
        <span style="color:#94a3b8;font-size:13px;">点击文件路径打开</span>
      </div>
      <div class="file-editor-actions">
        <button class="fe-btn" :disabled="!currentFile" @click="saveFile" :title="'保存 (Cmd/Ctrl+S)'">
          <el-icon><CircleCheck /></el-icon>
          <span>保存</span>
        </button>
        <button class="fe-btn fe-btn--close" @click="$emit('close')" title="关闭编辑器">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="file-editor-body" v-loading="loading">
      <div v-if="!currentFile && !loading" class="file-editor-empty">
        <el-icon style="font-size:48px;color:#94a3b8;opacity:0.4"><Document /></el-icon>
        <p style="color:#94a3b8;font-size:14px;margin-top:8px;">在 AI 回复中点击文件路径</p>
        <p style="color:#94a3b8;font-size:12px;">即可在此处查看和编辑文件</p>
      </div>
      <textarea
        v-else
        ref="editorRef"
        class="file-editor-textarea"
        v-model="editorContent"
        :placeholder="loading ? '加载中...' : ''"
        spellcheck="false"
        @input="onContentChange"
      ></textarea>
    </div>

    <div class="file-editor-status">
      <span v-if="currentFile">{{ currentFile.ext || 'txt' }} · {{ contentLength }} 字符</span>
      <span v-else>未打开文件</span>
      <span v-if="saveStatus" :class="'file-editor-save-' + saveStatus.type">{{ saveStatus.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { Document, CircleCheck, Close } from '@element-plus/icons-vue'
import { apiClient } from '../utils/api-client'

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 800

const props = defineProps<{
  visible: boolean
  filePath?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const editorRef = ref<HTMLTextAreaElement | null>(null)
const loading = ref(false)
const currentFile = ref<{ name: string; path: string; ext: string } | null>(null)
const editorContent = ref('')
const originalContent = ref('')
const hasChanges = ref(false)
const saveStatus = ref<{ text: string; type: string } | null>(null)

const panelWidth = ref(420)
const isDragging = ref(false)

const contentLength = computed(() => editorContent.value.length)

function startResize(e: MouseEvent) {
  isDragging.value = true
  panelWidth.value = (e.target as HTMLElement).parentElement?.offsetWidth || 420
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isDragging.value) return
  const chatPanel = (e.target as HTMLElement).closest('.chat-panel')
  if (!chatPanel) return
  const rect = chatPanel.getBoundingClientRect()
  const newWidth = rect.right - e.clientX
  panelWidth.value = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth))
}

function stopResize() {
  isDragging.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})

async function loadFile(filePath: string) {
  loading.value = true
  currentFile.value = null
  try {
    const data = await apiClient.get('/api/file/read?path=' + encodeURIComponent(filePath)) as any
    currentFile.value = { name: data.name, path: data.path, ext: data.ext }
    editorContent.value = data.content
    originalContent.value = data.content
    hasChanges.value = false
    saveStatus.value = null
    await nextTick()
    editorRef.value?.focus()
  } catch (err: any) {
    saveStatus.value = { text: '读取失败: ' + err.message, type: 'error' }
  } finally {
    loading.value = false
  }
}

async function saveFile() {
  if (!currentFile.value || !hasChanges.value) return
  saveStatus.value = { text: '保存中...', type: 'saving' }
  try {
    await apiClient.post('/api/file/write', { path: currentFile.value.path, content: editorContent.value })
    originalContent.value = editorContent.value
    hasChanges.value = false
    saveStatus.value = { text: '✅ 已保存', type: 'success' }
    setTimeout(() => { saveStatus.value = null }, 2000)
  } catch (err: any) {
    saveStatus.value = { text: '保存失败: ' + err.message, type: 'error' }
  }
}

function onContentChange() {
  hasChanges.value = editorContent.value !== originalContent.value
}

watch(() => props.filePath, (newPath) => {
  if (newPath) loadFile(newPath)
})

watch(() => props.visible, (v) => {
  if (!v) {
    currentFile.value = null
    editorContent.value = ''
    originalContent.value = ''
    hasChanges.value = false
    saveStatus.value = null
  }
})
</script>

<style scoped>
.file-editor-panel {
  min-width: 280px;
  background: #1e1e2e;
  border-left: 1px solid #363654;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: min-width 0.2s;
}
.file-editor-panel:not(.dragging) {
  transition: width 0.2s, min-width 0.2s;
}
.file-editor-panel.collapsed {
  width: 0 !important;
  min-width: 0;
  overflow: hidden;
  border-left: none;
  padding: 0;
}

.file-editor-resize-handle {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
}
.file-editor-resize-handle:hover,
.file-editor-panel.dragging .file-editor-resize-handle {
  background: rgba(99, 102, 241, 0.25);
}
.file-editor-resize-handle::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 32px;
  border-radius: 1px;
  background: #363654;
  transition: background 0.15s, height 0.15s;
}
.file-editor-resize-handle:hover::after,
.file-editor-panel.dragging .file-editor-resize-handle::after {
  background: #6366f1;
  height: 48px;
}

.file-editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #252536;
  border-bottom: 1px solid #363654;
  flex-shrink: 0;
}

.file-editor-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.file-editor-name {
  font-weight: 600;
  color: #cdd6f4;
  white-space: nowrap;
}

.file-editor-path {
  font-size: 11px;
  color: #6c7086;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-editor-dirty {
  color: #f59e0b;
  font-size: 16px;
  flex-shrink: 0;
}

.file-editor-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.fe-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: #7c3aed;
  color: #fff;
  transition: background 0.15s;
  white-space: nowrap;
}
.fe-btn:hover { background: #6d28d9; }
.fe-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.fe-btn--close {
  background: transparent;
  color: #6c7086;
  padding: 5px 8px;
}
.fe-btn--close:hover { background: #313148; color: #cdd6f4; }

.file-editor-body {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.file-editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.file-editor-textarea {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px 18px;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  background: #1e1e2e;
  color: #cdd6f4;
  tab-size: 2;
}

.file-editor-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 14px;
  background: #252536;
  border-top: 1px solid #363654;
  font-size: 11px;
  color: #6c7086;
  flex-shrink: 0;
}

.file-editor-save-success { color: #22c55e; }
.file-editor-save-error { color: #ef4444; }
.file-editor-save-saving { color: #f59e0b; }
</style>
