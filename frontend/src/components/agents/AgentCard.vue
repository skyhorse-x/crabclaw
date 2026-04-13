<template>
  <div class="agent-card">
    <div class="agent-header">
      <div class="agent-icon">{{ agent.name?.charAt(0) || 'A' }}</div>
      <div class="agent-info">
        <h3>{{ agent.name }}</h3>
        <span class="agent-model">{{ agent.modelId }}</span>
      </div>
    </div>
    <div class="agent-actions">
      <el-button size="small" @click="$emit('edit', agent)">{{ t('edit') }}</el-button>
      <el-button size="small" type="danger" @click="$emit('delete', agent.id)">{{ t('delete') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  agent: {
    id: string
    name: string
    modelId: string
  }
}>()

defineEmits(['edit', 'delete'])
const { t } = useI18n()
</script>

<style scoped>
.agent-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.agent-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.agent-info h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
}

.agent-model {
  font-size: 12px;
  color: var(--text-secondary);
}

.agent-actions {
  display: flex;
  gap: 8px;
}
</style>
