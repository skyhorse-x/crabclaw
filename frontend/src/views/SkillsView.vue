<template>
  <div class="settings-panel">
      <div class="panel-header">
        <div class="panel-header-left">
          <h3>{{ t('skillMarketTitle') }}</h3>
          <p class="panel-desc">{{ t('skillMarketDesc') }}</p>
        </div>
        <el-button :icon="Plus" type="primary" @click="skillDialogVisible = true">{{ t('addSkill') }}</el-button>
      </div>
      <div class="market-list" v-loading="skillLoading" :element-loading-text="t('loading')">
        <template v-if="skillMarket.length > 0">
          <div class="market-card" v-for="skill in skillMarket" :key="skill.id" @click="showSkillDetail(skill)">
            <div class="market-card-header">
              <div class="market-icon">{{ skill.name.charAt(0) }}</div>
              <div class="market-info">
                <div class="market-name">{{ skill.name }}</div>
                <div class="market-category">{{ skill.category }}</div>
              </div>
              <el-tag v-if="skill.author === 'local' || skill.isBuiltIn" type="info" size="small" effect="plain" style="margin-right:6px">内置</el-tag>
              <el-tag :type="skill.installed ? 'success' : 'info'" size="small">
                {{ skill.installed ? t('skillInstalled') : t('skillNotInstalled') }}
              </el-tag>
              <el-dropdown style="margin-left:8px" @click.stop>
                <el-button :icon="MoreFilled" circle plain size="small"></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!skill.installed" @click.stop="installSkill(skill)">
                      {{ t('mcpInstall') }}
                    </el-dropdown-item>
                    <el-dropdown-item @click.stop="showSkillDetail(skill)">
                      {{ t('mcpDetails') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="market-desc">{{ skill.description }}</div>
          </div>
        </template>
        <el-empty v-else-if="!skillLoading" :description="t('skillNoData')" />
      </div>
      <div class="pagination-container" v-if="skillPagination.total > 0">
        <el-pagination
          v-model:current-page="skillCurrentPage"
          :page-size="skillPageSize"
          :total="skillPagination.total"
          layout="total, prev, pager, next"
          @current-change="handleSkillPageChange"
        />
      </div>
    </div>

    <!-- 创建技能对话框 -->
    <el-dialog v-model="skillDialogVisible" title="创建技能" width="500px">
      <el-form :model="skillDialogForm" label-width="80px">
        <el-form-item label="技能名称">
          <el-input v-model="skillDialogForm.name" />
        </el-form-item>
        <el-form-item label="技能描述">
          <el-input v-model="skillDialogForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skillDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createSkill">创建</el-button>
      </template>
    </el-dialog>

    <!-- 技能详情对话框 -->
    <el-dialog v-model="skillDetailVisible" title="技能详情" width="560px">
      <template v-if="skillDetailData">
        <div class="skill-detail-header">
          <div class="skill-detail-icon">{{ skillDetailData.name?.charAt(0) || 'S' }}</div>
          <div class="skill-detail-info">
            <h3>{{ skillDetailData.name }}</h3>
            <div class="skill-detail-meta">
              <el-tag size="small">{{ skillDetailData.category }}</el-tag>
              <el-tag v-if="skillDetailData.author === 'local' || skillDetailData.isBuiltIn" size="small" type="info" effect="plain">内置</el-tag>
              <el-tag v-else size="small" type="warning" effect="plain">自定义</el-tag>
              <span v-if="skillDetailData.author && skillDetailData.author !== 'local'" class="skill-detail-author">作者: {{ skillDetailData.author }}</span>
              <span v-if="skillDetailData.stepsCount != null" class="skill-detail-steps">步骤: {{ skillDetailData.stepsCount }}</span>
              <span v-if="skillDetailData.downloads != null" class="skill-detail-downloads">下载: {{ skillDetailData.downloads }}</span>
            </div>
          </div>
        </div>
        <div class="skill-detail-section">
          <label>简介</label>
          <p>{{ skillDetailData.description }}</p>
        </div>
        <div v-if="skillDetailData.tags && skillDetailData.tags.length > 0" class="skill-detail-section">
          <label>标签</label>
          <div class="skill-detail-tags">
            <el-tag v-for="tag in skillDetailData.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="skillDetailVisible = false">{{ t('close') }}</el-button>
        <el-button v-if="!skillDetailData?.installed" type="primary" @click="installSkillFromDetail">
          {{ t('mcpInstall') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 技能选择对话框 -->
    <el-dialog v-model="skillSelectorVisible" title="选择技能" width="440px">
      <div class="skill-selector-list">
        <div
          v-for="skill in config.skills"
          :key="skill.id"
          class="skill-selector-item"
          :class="{ active: selectedChatSkillIds.includes(skill.id) }"
          @click="toggleSkillSelection(skill.id)"
        >
          <span class="skill-selector-check">
            <el-icon v-if="selectedChatSkillIds.includes(skill.id)" color="#1a1a1a"><CircleCheckFilled /></el-icon>
            <span v-else class="skill-selector-empty-circle"></span>
          </span>
          <span class="skill-selector-name">{{ skill.name }}</span>
          <el-tag v-if="(skill as any).category" size="small" effect="plain" class="skill-selector-tag">{{ (skill as any).category }}</el-tag>
        </div>
      </div>
      <template #footer>
        <div class="skill-selector-footer">
          <button class="skill-clear-btn" @click="clearSkillSelection">清除全部</button>
          <button class="skill-confirm-btn" @click="confirmSkillSelection">
            确认{{ selectedChatSkillIds.length > 0 ? `（${selectedChatSkillIds.length}）` : '' }}
          </button>
        </div>
      </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Plus, MoreFilled, CircleCheckFilled } from '@element-plus/icons-vue'
import { apiClient } from '../utils/api-client'

const { t } = useI18n()

const skillMarket = ref<any[]>([])
const skillLoading = ref(false)
const skillCurrentPage = ref(1)
const skillPageSize = ref(10)
const skillPagination = ref({ total: 0, totalPages: 0, hasMore: false })

const skillDialogVisible = ref(false)
const skillSelectorVisible = ref(false)
const skillDetailVisible = ref(false)
const skillDetailData = ref<any>(null)

const skillDialogForm = reactive({
  name: "",
  description: ""
})

const selectedChatSkillIds = ref<string[]>([])

interface AppConfig {
  settings: {
    backendPort: number
    theme: string
    language: string
    activeModelId: string
    userDataDir?: string
    skillsDir?: string
    username?: string
    proxy?: {
      enabled: boolean
      protocol: string
      host: string
      port: number
      username?: string
      password?: string
    }
  }
  models: Array<{
    id: string
    name: string
    provider: string
    customProviderName?: string
    apiKey?: string
    apiKeyEncrypted?: string
    modelName: string
    apiBaseUrl: string
    isBuiltIn: boolean
    isActive: boolean
    createdAt: string
    updatedAt: string
  }>
  skills: Array<{
    id: string
    name: string
    description: string
    steps: any[]
  }>
}

const config = ref<AppConfig>({
  settings: {
    backendPort: __BACKEND_PORT__,
    theme: "light",
    language: "zh-CN",
    activeModelId: "",
    userDataDir: "",
    skillsDir: "",
    proxy: { enabled: false, protocol: 'http', host: '', port: 0, username: '', password: '' }
  },
  models: [],
  skills: []
})

async function fetchSkillMarket(page: number = 1) {
  skillLoading.value = true
  try {
    const data = await apiClient.get(`/api/skill-market?page=${page}&pageSize=${skillPageSize.value}`) as any
    skillMarket.value = Array.isArray(data.skills) ? data.skills : []
    skillPagination.value = data.pagination || { total: 0, totalPages: 0, hasMore: false }
    skillCurrentPage.value = page
  } catch (e: any) {
    console.error("Failed to fetch skill market:", e)
    skillMarket.value = []
    ElMessage.error(e?.message || t('skillLoadFailed'))
  } finally {
    skillLoading.value = false
  }
}

function handleSkillPageChange(page: number) {
  fetchSkillMarket(page)
}

function showSkillDetail(skill: any) {
  skillDetailData.value = skill
  skillDetailVisible.value = true
}

async function installSkill(skill: any) {
  try {
    const data = await apiClient.post('/api/skill-market/install', { id: skill.id }) as any
    ElMessage.success(data.message)
    fetchSkillMarket(skillCurrentPage.value)
    loadConfig()
  } catch (e: any) {
    ElMessage.error(e?.message || t('installFailed'))
  }
}

async function installSkillFromDetail() {
  if (!skillDetailData.value) return
  await installSkill(skillDetailData.value)
  skillDetailVisible.value = false
}

async function uninstallSkill(skill: any) {
  try {
    const data = await apiClient.post('/api/skill-market/uninstall', { id: skill.id }) as any
    ElMessage.success(data.message)
    fetchSkillMarket(skillCurrentPage.value)
    loadConfig()
  } catch (e: any) {
    ElMessage.error(e?.message || "卸载失败")
  }
}

function slugifySkillName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || 'skill-' + Date.now()
}

async function createSkill() {
  if (!skillDialogForm.name.trim()) {
    ElMessage.error("请输入技能名称")
    return
  }

  const skill = {
    id: slugifySkillName(skillDialogForm.name),
    name: skillDialogForm.name,
    description: skillDialogForm.description,
    steps: []
  }

  config.value.skills.push(skill)
  skillDialogVisible.value = false
  skillDialogForm.name = ""
  skillDialogForm.description = ""

  await persistConfig(t('skillCreated'))
}

async function loadConfig() {
  try {
    const result = await apiClient.get('/api/config') as any
    const data = result?.data?.config
    if (data) {
      config.value = {
        settings: {
          backendPort: data?.settings?.backendPort ?? __BACKEND_PORT__,
          theme: data?.settings?.theme ?? "light",
          language: data?.settings?.language ?? "zh-CN",
          activeModelId: data?.settings?.activeModelId ?? "",
          userDataDir: data?.settings?.userDataDir ?? "",
          skillsDir: data?.settings?.skillsDir ?? "",
          proxy: data?.settings?.proxy ?? { enabled: false, protocol: 'http', host: '', port: 0, username: '', password: '' }
        },
        models: Array.isArray(data?.models) && data.models.length > 0 ? data.models : [],
        skills: Array.isArray(data?.skills) ? data.skills : []
      }
    }
  } catch (error) {
    console.error("加载配置失败:", error)
  }
}

async function persistConfig(message = t('saveSuccess')) {
  try {
    const result = await apiClient.put('/api/config', config.value as unknown as Record<string, unknown>) as any
    const displayMessage = result?.message || message || t('saveSuccess')
    ElMessage.success(displayMessage)
  } catch (error: any) {
    ElMessage.error(String(error.message || error || t('saveFailed')))
  }
}

function toggleSkillSelection(skillId: string) {
  const idx = selectedChatSkillIds.value.indexOf(skillId)
  if (idx === -1) {
    selectedChatSkillIds.value = [...selectedChatSkillIds.value, skillId]
  } else {
    selectedChatSkillIds.value = selectedChatSkillIds.value.filter(id => id !== skillId)
  }
}

function confirmSkillSelection() {
  skillSelectorVisible.value = false
}

function clearSkillSelection() {
  selectedChatSkillIds.value = []
}

onMounted(() => {
  fetchSkillMarket()
})
</script>

<style scoped>
.pagination-container {
  display: flex;
  justify-content: center;
  padding: 20px 0;
  margin-top: 10px;
}

.skill-detail-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.skill-detail-icon {
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
  flex-shrink: 0;
}

.skill-detail-info {
  flex: 1;
}

.skill-detail-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
}

.skill-detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.skill-detail-author,
.skill-detail-steps,
.skill-detail-downloads {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.skill-detail-section {
  margin-bottom: 16px;
}

.skill-detail-section label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.skill-detail-section p {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.skill-detail-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.skill-selector-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.skill-selector-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.skill-selector-item:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.skill-selector-item.active {
  background: var(--accent-light);
  border-color: var(--accent-primary);
}

.skill-selector-name {
  font-size: 14px;
  color: var(--text-primary);
  flex: 1;
}

.skill-selector-check {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.skill-selector-empty-circle {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #d0d0d0;
}

.skill-selector-item.active .skill-selector-empty-circle {
  display: none;
}

.skill-selector-tag {
  flex-shrink: 0;
  font-size: 11px;
  border-color: #e0e0e0 !important;
  color: #888 !important;
}

.skill-selector-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.skill-clear-btn {
  background: none;
  border: none;
  font-size: 13px;
  color: #888;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}

.skill-clear-btn:hover {
  background: #f0f0f0;
  color: #444;
}

.skill-confirm-btn {
  background: #1a1a1a;
  color: #fff;
  border: none;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.skill-confirm-btn:hover {
  opacity: 0.85;
}
</style>
