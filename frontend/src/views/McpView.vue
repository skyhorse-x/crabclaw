<template>
  <div class="mcp-panel">
      <div class="panel-header">
        <div class="panel-header-left">
          <h3>{{ t('mcpMarketTitle') }}</h3>
          <p class="panel-desc">{{ t('mcpMarketDesc') }}</p>
        </div>
      </div>
      <div class="market-list" v-loading="mcpLoading" :element-loading-text="t('loading')">
        <template v-if="mcpServers.length > 0">
          <div class="market-card" v-for="server in mcpServers" :key="server.id">
            <div class="market-card-header">
              <div class="market-icon">{{ server.name.charAt(0) }}</div>
              <div class="market-info">
                <div class="market-name">{{ server.name }}</div>
                <div class="market-category">{{ server.category }}</div>
              </div>
              <el-tag :type="server.installed ? 'success' : 'info'" size="small">
                {{ server.installed ? t('mcpStatusInstalled') : t('mcpStatusNotInstalled') }}
              </el-tag>
            </div>
            <div class="market-desc">{{ server.description }}</div>
            <div class="market-stats">
              <span><el-icon><Star /></el-icon> {{ server.downloads }}</span>
              <span v-if="server.author">{{ server.author }}</span>
            </div>
            <div class="market-actions">
              <el-button
                v-if="!server.installed"
                size="small"
                type="primary"
                @click="showMcpInstallDialog(server)"
              >{{ t('mcpInstall') }}</el-button>
              <el-button
                v-if="server.installed"
                size="small"
                type="danger"
                plain
                @click="uninstallMcpServer(server)"
              >{{ t('mcpUninstall') }}</el-button>
              <el-button size="small" @click="openMcpUrl(server.url)">{{ t('mcpDetails') }}</el-button>
            </div>
          </div>
        </template>
        <el-empty v-else-if="!mcpLoading" :description="t('mcpNoData')" />
      </div>
    </div>

    <el-dialog v-model="mcpInstallDialogVisible" title="安装 MCP 服务器" width="600px">
      <div class="mcp-config-editor">
        <div class="mcp-config-hint">
          请输入 MCP 服务器配置（JSON 格式）：
        </div>
        <el-input
          v-model="mcpConfigJson"
          type="textarea"
          :rows="12"
          placeholder='{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}'
          class="mcp-config-textarea"
        />
        <div class="mcp-config-example">
          <el-collapse>
            <el-collapse-item title="查看配置示例" name="examples">
              <div class="example-item">
                <strong>Playwright:</strong>
                <pre>{ "command": "npx", "args": ["@playwright/mcp@latest"] }</pre>
              </div>
              <div class="example-item">
                <strong>Filesystem:</strong>
                <pre>{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"] }</pre>
              </div>
              <div class="example-item">
                <strong>SQLite:</strong>
                <pre>{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/path/to/db.sqlite"] }</pre>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>
      <template #footer>
        <el-button @click="mcpInstallDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmInstallMcpServer" :loading="mcpInstalling">确认安装</el-button>
      </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Star } from '@element-plus/icons-vue'
import { apiClient } from '../utils/api-client'

const { t } = useI18n()

const mcpServers = ref<any[]>([])
const mcpLoading = ref(false)
const mcpInstallDialogVisible = ref(false)
const mcpConfigJson = ref("")
const mcpInstalling = ref(false)

async function fetchMcpServers() {
  mcpLoading.value = true
  try {
    const data = await apiClient.get('/api/mcp') as any
    mcpServers.value = Array.isArray(data.servers) ? data.servers : []
  } catch (e: any) {
    console.error("Failed to fetch MCP servers:", e)
    mcpServers.value = []
    ElMessage.error(e?.message || t('mcpLoadFailed'))
  } finally {
    mcpLoading.value = false
  }
}

function showMcpInstallDialog(server: any) {
  mcpConfigJson.value = `{
  "mcpServers": {
    "${server.id}": {
      "command": "npx",
      "args": ["-y", "${server.id}"]
    }
  }
}`
  mcpInstallDialogVisible.value = true
}

async function confirmInstallMcpServer() {
  let config: any
  try {
    config = JSON.parse(mcpConfigJson.value)
  } catch (e) {
    ElMessage.error(t('jsonParseError'))
    return
  }

  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    ElMessage.error(t('mcpConfigMissing'))
    return
  }

  mcpInstalling.value = true
  try {
    const data = await apiClient.post('/api/mcp/install', { config }) as any
    mcpInstallDialogVisible.value = false
    ElMessage.success(data.message)
    fetchMcpServers()
  } catch (e: any) {
    ElMessage.error(e?.message || t('installFailed'))
  } finally {
    mcpInstalling.value = false
  }
}

async function uninstallMcpServer(server: any) {
  try {
    const confirmText = t('confirmUninstall').replace('{name}', server.name)
    await ElMessageBox.confirm(confirmText, t('confirmUninstallTitle'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: "warning"
    })

    const data = await apiClient.post('/api/mcp/uninstall', { id: server.id }) as any
    ElMessage.success(data.message)
    fetchMcpServers()
  } catch (err: any) {
    if (err !== 'cancel' && err?.message !== 'cancel') {
      ElMessage.error(String(err?.message || '卸载失败'))
    }
  }
}

function openMcpUrl(url: string) {
  if (url) {
    window.open(url, "_blank")
  }
}

onMounted(() => {
  fetchMcpServers()
})
</script>

<style scoped>
.mcp-config-editor {
  padding: 10px 0;
}

.mcp-config-hint {
  margin-bottom: 10px;
  color: #606266;
  font-size: 14px;
}

.path-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.mcp-config-textarea :deep(textarea) {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.mcp-config-example {
  margin-top: 15px;
}

.example-item {
  margin-bottom: 10px;
}

.example-item pre {
  background: #f5f7fa;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 5px 0 0 0;
}

.field-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

.market-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-muted, #909399);
  margin-bottom: var(--space-md, 12px);
}

.market-stats span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.market-actions {
  display: flex;
  gap: 8px;
}
</style>
