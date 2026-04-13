<template>
  <AppLayout>
    <div class="agents-container">
      <div class="page-header">
        <h2>{{ t('navAgents') }}</h2>
      </div>
      <div class="agents-grid">
        <AgentCard v-for="agent in agents" :key="agent.id" :agent="agent" />
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import AgentCard from '@/components/agents/AgentCard.vue'

const { t } = useI18n()

const agents = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await fetch('/api/agents')
    const data = await res.json()
    if (data && Array.isArray(data.agents)) {
      agents.value = data.agents
    }
  } catch (error) {
    console.error('Failed to load agents:', error)
  }
})
</script>

<style scoped>
.agents-container {
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

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
</style>
