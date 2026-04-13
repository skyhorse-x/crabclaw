<template>
  <AppLayout>
    <div class="skills-container">
      <div class="page-header">
        <h2>{{ t('navSkills') }}</h2>
        <el-button type="primary" @click="showAddDialog = true">{{ t('add') }}</el-button>
      </div>
      <div class="skills-grid">
        <div v-for="skill in skills" :key="skill.id" class="skill-card">
          <div class="skill-icon">{{ skill.name?.charAt(0) || 'S' }}</div>
          <div class="skill-info">
            <h3>{{ skill.name }}</h3>
            <p>{{ skill.description }}</p>
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

const skills = ref<any[]>([])
const showAddDialog = ref(false)

onMounted(async () => {
  try {
    const res = await fetch('/api/skill-market')
    const data = await res.json()
    if (data && data.ok && Array.isArray(data.skills)) {
      skills.value = data.skills
    }
  } catch (error) {
    console.error('Failed to load skills:', error)
  }
})
</script>

<style scoped>
.skills-container {
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

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

.skill-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  gap: 16px;
  border: 1px solid var(--border-color);
}

.skill-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.skill-info h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
}

.skill-info p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
