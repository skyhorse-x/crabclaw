<template>
  <div class="agent-card" @click="$emit('select', agent.id)">
    <div class="agent-card-top">
      <div class="agent-avatar" :style="{ background: avatarBg }">
        {{ agent.name?.charAt(0)?.toUpperCase() || 'A' }}
      </div>
      <div class="agent-info">
        <h3 class="agent-name">{{ agent.name }}</h3>
        <span class="agent-model">{{ agent.modelId }}</span>
      </div>
    </div>
    <div class="agent-actions">
      <button class="agent-btn" @click.stop="$emit('edit', agent)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        编辑
      </button>
      <button class="agent-btn agent-btn--danger" @click.stop="$emit('delete', agent.id)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        删除
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  agent: {
    id: string
    name: string
    modelId: string
    color?: string
    status?: string
  }
  selected?: boolean
}>()

defineEmits(['select', 'edit', 'delete', 'run', 'toggle', 'stop', 'view-log'])

const avatarBg = computed(() => {
  if (props.agent.color && props.agent.color !== '#e5e7eb' && props.agent.color !== '#f1f5f9') {
    return props.agent.color
  }
  const colors = ['#1a1a1a', '#3a3a3a', '#555555', '#2d2d2d', '#404040', '#4a4a4a']
  const idx = (props.agent.name?.charCodeAt(0) || 0) % colors.length
  return colors[idx]
})
</script>

<style scoped>
.agent-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 20px;
  border: 1px solid #efefef;
  cursor: pointer;
  transition: box-shadow 0.18s, border-color 0.18s, transform 0.18s;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border-color: #e0e0e0;
  transform: translateY(-1px);
}

.agent-card-top {
  display: flex;
  align-items: center;
  gap: 14px;
}

.agent-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: -0.5px;
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.agent-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-model {
  font-size: 12px;
  color: #999999;
}

.agent-actions {
  display: flex;
  gap: 8px;
}

.agent-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #ffffff;
  color: #555555;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.agent-btn:hover {
  background: #f5f5f5;
  border-color: #d0d0d0;
  color: #1a1a1a;
}

.agent-btn--danger:hover {
  background: #fff5f5;
  border-color: #fca5a5;
  color: #dc2626;
}
</style>
