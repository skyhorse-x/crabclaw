<template>
  <AppLayout>
    <div class="control-container">
      <div class="page-header">
        <h2>{{ t('controlPanelTitle') }}</h2>
      </div>
      
      <el-tabs type="border-card" class="platform-tabs">
        <el-tab-pane name="global">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon global-icon">⚙</span>
              <span>{{ t('controlGlobal') }}</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="config-row">
              <span>{{ t('controlGlobalEnable') }}</span>
              <el-switch v-model="config.enabled" />
            </div>
            <el-form label-width="120px" label-position="left">
              <el-form-item :label="t('controlCommandPrefix')">
                <el-input v-model="config.commandPrefix" />
              </el-form-item>
              <el-form-item :label="t('controlVerifyCode')">
                <el-input v-model="config.verifyCode" type="password" show-password />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="telegram">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon telegram-icon">✈</span>
              <span>Telegram</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="config-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="config.telegram.enabled" />
            </div>
            <el-form label-width="120px" label-position="left">
              <el-form-item :label="t('controlBotToken')">
                <el-input v-model="config.telegram.botToken" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlChatId')">
                <el-input v-model="config.telegram.chatId" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane name="discord">
          <template #label>
            <span class="platform-tab-label">
              <span class="platform-icon discord-icon">D</span>
              <span>Discord</span>
            </span>
          </template>
          <div class="platform-config">
            <div class="config-row">
              <span>{{ t('controlEnable') }}</span>
              <el-switch v-model="config.discord.enabled" />
            </div>
            <el-form label-width="120px" label-position="left">
              <el-form-item :label="t('controlBotToken')">
                <el-input v-model="config.discord.botToken" type="password" show-password />
              </el-form-item>
              <el-form-item :label="t('controlChannelId')">
                <el-input v-model="config.discord.channelId" />
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div class="save-btn">
        <el-button type="primary" @click="saveConfig" :loading="saving">
          {{ t('controlSave') }}
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
const saving = ref(false)

const config = reactive({
  enabled: false,
  commandPrefix: '/agent',
  verifyCode: '',
  telegram: {
    enabled: false,
    botToken: '',
    chatId: ''
  },
  discord: {
    enabled: false,
    botToken: '',
    channelId: ''
  }
})

async function loadConfig() {
  try {
    const res = await fetch('/api/remote-control/config')
    const data = await res.json()
    if (data.config) {
      Object.assign(config, data.config)
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await fetch('/api/remote-control/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config)
    })
    ElMessage.success(t('controlSaved'))
  } catch (error) {
    ElMessage.error('Save failed')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.control-container {
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

.platform-tabs {
  margin-bottom: 20px;
}

.platform-tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.platform-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.telegram-icon { background: #0088cc; }
.discord-icon { background: #5865f2; }
.global-icon { background: #667eea; }

.platform-config {
  background: #fff;
  padding: 24px;
  border-radius: 0 0 8px 8px;
}

.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.save-btn {
  display: flex;
  justify-content: flex-end;
}
</style>
