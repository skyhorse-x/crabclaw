<template>
  <div class="layout-container">
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <div class="logo">
          <img class="logo-icon" src="/icons/appIcon.png" alt="Logo" />
          <div class="logo-text" v-if="!sidebarCollapsed">
            <h1>{{ t('appTitle') }}</h1>
          </div>
        </div>
        <el-button :icon="Fold" circle plain @click="toggleSidebar" :title="t('sidebarFold')"></el-button>
      </div>
      
      <nav class="sidebar-nav">
        <div class="nav-item" :class="{ active: $route.path === '/' }" @click="router.push('/')">
          <el-icon><ChatDotRound /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navChat') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/agents' }" @click="router.push('/agents')">
          <el-icon><User /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navAgents') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/mcp' }" @click="router.push('/mcp')">
          <el-icon><Connection /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navMcp') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/skills' }" @click="router.push('/skills')">
          <el-icon><Star /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navSkills') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/tasks' }" @click="router.push('/tasks')">
          <el-icon><Timer /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navTasks') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/integrations' }" @click="router.push('/integrations')">
          <el-icon><Link /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navIntegrations') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/control' }" @click="router.push('/control')">
          <el-icon><Monitor /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navControl') }}</span>
        </div>
        <div class="nav-item" :class="{ active: $route.path === '/settings' }" @click="router.push('/settings')">
          <el-icon><Setting /></el-icon>
          <span v-if="!sidebarCollapsed">{{ t('navSettings') }}</span>
        </div>
      </nav>
    </aside>

    <main class="main-content">
      <div v-if="pageTitle" class="page-header">
        <h2>{{ pageTitle }}</h2>
      </div>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Fold, ChatDotRound, User, Connection, Star, Timer, Monitor, Setting, Link } from '@element-plus/icons-vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const sidebarCollapsed = ref(false)

const routeTitleMap: Record<string, string> = {
  '/': 'navChat',
  '/agents': 'navAgents',
  '/mcp': 'navMcp',
  '/skills': 'navSkills',
  '/tasks': 'navTasks',
  '/integrations': 'navIntegrations',
  '/control': 'controlPanelTitle',
  '/settings': 'navSettings'
}

const pageTitle = computed(() => {
  const key = routeTitleMap[route.path]
  return key ? t(key) : ''
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>

<style scoped>
.layout-container {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
}

.sidebar {
  width: 220px;
  background: var(--bg-tertiary);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
}

.logo-text h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.nav-item:hover {
  background: var(--bg-hover);
}

.nav-item.active {
  background: var(--accent-light);
  color: var(--accent-primary);
  font-weight: 500;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.page-header {
  padding: 24px 24px 0;
}

.page-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}
</style>
