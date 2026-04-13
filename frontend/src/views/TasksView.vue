<template>
  <AppLayout>
    <div class="tasks-container">
      <div class="page-header">
        <h2>{{ t('navTasks') }}</h2>
      </div>
      <el-card>
        <template #header>
          <div class="card-header">
            <span>{{ t('scheduledTasksTitle') }}</span>
          </div>
        </template>
        <div v-if="tasks.length === 0" class="empty-state">
          <p>{{ t('scheduledTasksEmpty') }}</p>
        </div>
        <div v-else class="task-list">
          <div v-for="task in tasks" :key="task.id" class="task-item">
            <div class="task-info">
              <h4>{{ task.name }}</h4>
              <p>{{ task.description }}</p>
            </div>
            <div class="task-meta">
              <el-tag :type="task.enabled ? 'success' : 'info'">
                {{ task.enabled ? t('enabled') : t('disabled') }}
              </el-tag>
              <span class="task-interval">{{ task.interval }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'

const { t } = useI18n()

const tasks = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await fetch('/api/scheduled-tasks')
    const data = await res.json()
    if (data && data.ok && Array.isArray(data.tasks)) {
      tasks.value = data.tasks
    }
  } catch (error) {
    console.error('Failed to load tasks:', error)
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
</style>
