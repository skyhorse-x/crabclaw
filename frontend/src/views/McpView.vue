<template>
  <AppLayout>
    <div class="mcp-container">
      <div class="page-header">
        <h2>{{ t('navMcp') }}</h2>
        <el-button type="primary" @click="showAddDialog = true">{{ t('add') }}</el-button>
      </div>
      <div class="mcp-list">
        <div v-for="server in servers" :key="server.name" class="mcp-item">
          <div class="mcp-info">
            <h3>{{ server.name }}</h3>
            <p>{{ server.command }}</p>
          </div>
          <div class="mcp-status">
            <el-tag :type="server.enabled ? 'success' : 'info'">
              {{ server.enabled ? t('enabled') : t('disabled') }}
            </el-tag>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'

const { t } = useI18n()

const servers = ref<any[]>([])
const showAddDialog = ref(false)

onMounted(async () => {
  try {
    const res = await fetch('/api/mcp')
    const data = await res.json()
    if (data && data.ok && Array.isArray(data.servers)) {
      servers.value = data.servers
    }
  } catch (error) {
    console.error('Failed to load MCP servers:', error)
  }
})
</script>

<style scoped>
.mcp-container {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.mcp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mcp-item {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border-color);
}

.mcp-info h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
}

.mcp-info p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
