<template>
  <AppLayout>
    <div class="settings-container">
      <div class="page-header">
        <h2>{{ t('navSettings') }}</h2>
      </div>

      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="Basic" name="basic">
          <el-form label-width="140px" label-position="left">
            <el-form-item :label="t('settingsUsername')">
              <el-input v-model="settings.username" />
            </el-form-item>
            <el-form-item :label="t('settingsLanguage')">
              <el-select v-model="settings.language">
                <el-option label="中文" value="zh-CN" />
                <el-option label="English" value="en-US" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('settingsTheme')">
              <el-select v-model="settings.theme">
                <el-option label="Light" value="light" />
                <el-option label="Dark" value="dark" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="API" name="api">
          <el-form label-width="140px" label-position="left">
            <el-form-item :label="t('settingsApiBase')">
              <el-input v-model="settings.apiBaseUrl" placeholder="https://api.openai.com/v1" />
            </el-form-item>
            <el-form-item :label="t('settingsApiKey')">
              <el-input v-model="settings.apiKey" type="password" show-password />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div class="save-btn">
        <el-button type="primary" @click="saveSettings" :loading="saving">
          {{ t('save') }}
        </el-button>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import AppLayout from '@/components/layout/AppLayout.vue'

const { t } = useI18n()
const activeTab = ref('basic')
const saving = ref(false)

const settings = reactive({
  username: 'User',
  language: 'zh-CN',
  theme: 'light',
  apiBaseUrl: '',
  apiKey: ''
})

async function loadSettings() {
  try {
    const res = await fetch('/api/config')
    const data = await res.json()
    if (data.settings) {
      Object.assign(settings, data.settings)
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

async function saveSettings() {
  saving.value = true
  try {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings })
    })
    ElMessage.success(t('saveSuccess'))
  } catch (error) {
    ElMessage.error('Save failed')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.settings-container {
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

.save-btn {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
