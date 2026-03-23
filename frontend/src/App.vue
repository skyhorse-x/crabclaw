<template>
  <div class="app-container">
    <!-- 左右布局 -->
    <div class="split-layout">
      <!-- 左侧边栏 -->
      <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-header">
          <div class="logo">
            <div class="logo-icon">AI</div>
            <div class="logo-text">
              <h1>Desktop Agent</h1>
            </div>
          </div>
          <div class="sidebar-toggle">
            <el-button :icon="Fold" circle plain @click="toggleSidebar" :title="t('sidebarFold')"></el-button>
          </div>
        </div>
        
        <!-- 导航菜单 -->
        <nav class="sidebar-nav">
          <div class="nav-header">
            <div class="new-chat-button">
              <el-button
                :icon="Plus"
                type="primary"
                @click="newChat"
                size="small"
                :circle="sidebarCollapsed"
                :class="{ 'new-chat-icon-only': sidebarCollapsed }"
              >
                <span v-if="!sidebarCollapsed">{{ t('newChat') }}</span>
              </el-button>
            </div>
          </div>
          <div
            v-for="item in navigationItems"
            :key="item.id"
            class="nav-item"
            :class="{ active: selectedNav === item.id }"
            @click="switchNav(item.id)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ t(item.labelKey) }}</span>
          </div>
          <template v-if="selectedNav === 'chat'">
            <div class="chat-history">
              <div class="history-header">{{ t('historyTitle') }}</div>
              <div class="history-list">
                <div
                  v-for="conv in conversations"
                  :key="conv.id"
                  class="history-item"
                  :class="{ active: conv.id === currentConversationId }"
                  @click="currentConversationId = conv.id"
                  @contextmenu.prevent="openConversationContextMenu($event, conv.id)"
                >
                  <el-icon><ChatLineRound /></el-icon>
                  <span class="history-title">{{ conv.title }}</span>
                </div>
              </div>
            </div>
          </template>
        </nav>
        
        <!-- 底部状态 -->
        <div class="sidebar-footer">
          <div class="status-info">
            <el-tag :type="backendOnline ? 'success' : 'danger'" size="small">
              {{ backendOnline ? t('statusOnline') : t('statusOffline') }}
            </el-tag>
          </div>
        </div>
      </aside>

      <!-- 右侧主内容区域 -->
      <main class="main-content">
        <!-- 顶部工具栏 -->
        <div class="main-toolbar">
          <div class="toolbar-left">
            <!-- 标题已移除 -->
          </div>
          <div class="toolbar-right">
            <div class="toolbar-actions">
              <!-- 菜单图标 -->
              <el-dropdown>
                <el-button :icon="Menu" circle plain :title="t('systemMenu')"></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="item in toolbarNavigationItems"
                      :key="`toolbar-${item.id}`"
                      @click="switchNav(item.id)"
                    >
                      <el-icon><component :is="item.icon" /></el-icon>
                      <span>{{ t(item.labelKey) }}</span>
                    </el-dropdown-item>
                    <el-dropdown-item divided @click="newChat">
                      <el-icon><Plus /></el-icon>
                      <span>{{ t('newChat') }}</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>

        <!-- 聊天面板 -->
        <div class="chat-panel" v-if="selectedNav === 'chat'" :class="{ 'monitor-visible': monitorPanelVisible }">

          <!-- 聊天消息区域 -->
          <div class="chat-messages" ref="chatMessagesRef">
            <div
              v-for="(message, index) in messages"
              :key="`${message.role}-${index}`"
              class="message-container"
              :class="[message.role, { error: message.error }]"
            >
              <div class="message-avatar">
                <div class="avatar" :class="message.role">
                  {{ message.role === 'assistant' ? t('avatarAi') : t('avatarUser') }}
                </div>
              </div>
              <div class="message-content">
                <div class="message-bubble" :class="message.role">
                  <div class="message-text" v-html="renderMessageText(message.text)"></div>
                  <span v-if="message.typing && message.text && message.text.trim()" class="print-cursor">|</span>
                  <span v-else-if="message.typing" class="typing-indicator" aria-label="AI 正在输入">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                  </span>
                  <div v-if="message.agentName" class="message-meta">{{ message.agentName }}</div>
                </div>
                <div v-if="message.pendingConfirm" class="confirm-card">
                  <div class="confirm-title">{{ t('confirmActionTitle') }}</div>
                  <div class="confirm-tool">{{ message.pendingConfirm.server }}/{{ message.pendingConfirm.tool }}</div>
                  <div class="confirm-args"><code>{{ JSON.stringify(message.pendingConfirm.args || {}) }}</code></div>
                  <div class="confirm-actions">
                    <el-button
                      size="small"
                      type="primary"
                      :loading="message.pendingConfirm.executing"
                      @click="executePendingConfirm(message)"
                    >
                      {{ t('confirmExecute') }}
                    </el-button>
                    <el-button
                      size="small"
                      :disabled="message.pendingConfirm.executing"
                      @click="cancelPendingConfirm(message)"
                    >
                      {{ t('confirmCancel') }}
                    </el-button>
                  </div>
                </div>
                <div
                  v-if="shouldShowInlineTrace(message, index)"
                  class="trace-panel trace-panel-inline"
                >
                  <div class="trace-panel-header">
                    <div class="trace-panel-title">
                      <span class="trace-panel-name">{{ message.agentName || 'assistant' }}</span>
                      <span class="trace-panel-subtitle">{{ t('runResultTitle') }}</span>
                    </div>
                    <span v-if="traceRunningCalls(message).length > 0" class="mcp-running">
                      {{ t('mcpRunning') }}: {{ traceRunningCalls(message).join(', ') }}
                    </span>
                  </div>
                  <div class="trace-list" v-if="traceDetails(message).length > 0">
                    <div v-for="(item, idx) in traceDetails(message)" :key="`${item.time}-${idx}`" class="trace-item">
                      <span class="trace-step">{{ traceStepLabel(idx) }}</span>
                      <span class="trace-text">{{ item.text }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="!message.typing" class="message-actions" :class="message.role">
                  <el-tooltip :content="t('copyMessage')" placement="bottom">
                    <el-button text size="small" class="message-action-btn" @click="copyMessageText(message.text)">
                      <el-icon><CopyDocument /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip v-if="message.role === 'user'" :content="t('resendMessage')" placement="bottom">
                    <el-button
                      text
                      size="small"
                      class="message-action-btn"
                      :disabled="loading.chat"
                      @click="resendMessage(message.text)"
                    >
                      <el-icon><RefreshRight /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip :content="t('rollbackMessage')" placement="bottom">
                    <el-button
                      text
                      size="small"
                      class="message-action-btn"
                      :disabled="loading.chat"
                      @click="rollbackToMessage(index)"
                    >
                      <el-icon><ArrowLeftBold /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </div>

          <!-- 聊天输入区域 -->
          <div class="chat-input-area">
            <div class="custom-ai-strip" v-if="customAskAiList.length > 0">
              <el-tooltip
                v-for="item in customAskAiList"
                :key="item.id"
                :content="`${item.name} · ${item.modelLabel}`"
                placement="top"
              >
                  <button
                    type="button"
                    class="custom-ai-avatar-btn"
                    :class="{ active: selectedCustomAskAiId === item.id }"
                    @click="selectCustomAskAi(item)"
                  >
                  <span class="custom-ai-avatar-text">{{ item.avatarText }}</span>
                </button>
              </el-tooltip>
            </div>

            <div class="input-container" @contextmenu.prevent="showContextMenu">
              <el-input
                ref="chatInputRef"
                v-model="chatInput"
                type="textarea"
                :rows="2"
                resize="none"
                :placeholder="t('inputPlaceholder')"
                @keydown="handleChatKeydown"
                class="message-input"
              >
                <template #prepend>
                  <el-button
                    type="text"
                    :icon="Paperclip"
                    @click="handleAttach"
                    class="attach-button"
                    :title="t('attach')"
                  />
                </template>
              </el-input>
            </div>

            <div class="input-footer">
              <div class="input-status-row">
                <el-tag v-if="selectedChatModelLabel" size="small" effect="plain" class="ai-name-tag">
                  {{ t('currentAiName') }}: {{ selectedAskAiDisplayName }}
                </el-tag>
                <el-tag v-if="customAiAutoAskRunning" size="small" type="warning" effect="dark" class="ai-auto-tag">
                  {{ t('customAiAutoAsking') }} · {{ customAiAutoAskModelLabel || selectedAskAiDisplayName }}
                </el-tag>
                <el-tag v-if="customAiAutoAskRunning && customAiAskForm.multiAiLoop" size="small" type="info" effect="plain" class="ai-auto-tag">
                  {{ t('customAiMultiLoop') }}
                </el-tag>
              </div>

              <div class="input-controls-row">
                <div class="left-controls">
                  <el-button
                    size="small"
                    plain
                    @click="openCustomAiAskDialog"
                  >
                    {{ t('customAiAsk') }}
                  </el-button>
                  <div class="model-selector">
                    <el-select 
                      v-model="selectedChatModel" 
                      :placeholder="t('selectModelPlaceholder')"
                      size="small" 
                      style="width: 220px"
                    >
                      <el-option
                        v-for="model in availableModels"
                        :key="model.value"
                        :label="model.label"
                        :value="model.value"
                      />
                    </el-select>
                  </div>
                  <div class="execution-mode-selector">
                    <el-select v-model="chatExecutionMode" size="small" style="width: 132px">
                      <el-option :label="t('executionModeAuto')" value="auto" />
                      <el-option :label="t('executionModeManual')" value="manual" />
                    </el-select>
                  </div>
                </div>

                <div class="right-controls">
                  <el-button
                    v-if="customAiAutoAskRunning"
                    size="small"
                    type="danger"
                    plain
                    @click="stopCustomAiAutoAsk"
                  >
                    {{ t('stopAutoAsk') }}
                  </el-button>

                  <el-button
                    v-if="loading.chat"
                    type="danger"
                    :icon="CloseBold"
                    @click="pauseChat"
                    class="pause-button"
                  >
                    {{ t('pause') }}
                  </el-button>
                  <el-button
                    v-else
                    type="primary"
                    :icon="Promotion"
                    @click="() => sendChat()"
                    :disabled="!chatInput.trim()"
                    class="send-button"
                    circle
                  />
                </div>
              </div>
            </div>

            <!-- 添加输入字数统计 -->
            <div class="input-meta">
              <span class="word-count">{{ chatInput.length }}/1000</span>
            </div>
          </div>
          <MonitorPanel
            :visible="monitorPanelVisible"
            :exec-info="monitorExecInfo"
            :current-bot-name="selectedAskAiDisplayName || '-'"
            :auto-run="chatExecutionAuto"
            :labels="monitorLabels"
            @toggle="toggleMonitorPanel"
            @open-bot-dialog="openCustomAiAskDialog"
            @update:auto-run="chatExecutionAuto = $event"
          />
        </div>

        <!-- 代理仪表盘面板 -->
        <div class="agents-panel" v-if="selectedNav === 'agents'">
          <AgentDashboard />
        </div>

        <!-- MCP 面板 -->
        <div class="mcp-panel" v-if="selectedNav === 'mcp'">
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

        <!-- 技能面板 -->
        <div class="settings-panel" v-if="selectedNav === 'skills'">
          <div class="panel-header">
            <div class="panel-header-left">
              <h3>{{ t('skillMarketTitle') }}</h3>
              <p class="panel-desc">{{ t('skillMarketDesc') }}</p>
            </div>
            <el-button :icon="Plus" type="primary" @click="skillDialogVisible = true">{{ t('addSkill') }}</el-button>
          </div>
          <div class="market-list" v-loading="skillLoading" :element-loading-text="t('loading')">
            <template v-if="skillMarket.length > 0">
              <div class="market-card" v-for="skill in skillMarket" :key="skill.id">
                <div class="market-card-header">
                  <div class="market-icon">{{ skill.name.charAt(0) }}</div>
                  <div class="market-info">
                    <div class="market-name">{{ skill.name }}</div>
                    <div class="market-category">{{ skill.category }}</div>
                  </div>
                  <el-tag :type="skill.installed ? 'success' : 'info'" size="small">
                    {{ skill.installed ? t('skillInstalled') : t('skillNotInstalled') }}
                  </el-tag>
                </div>
                <div class="market-desc">{{ skill.description }}</div>
                <div class="market-stats">
                  <span><el-icon><Star /></el-icon> {{ skill.downloads }}</span>
                  <span v-if="skill.author">{{ skill.author }}</span>
                </div>
                <div class="market-actions">
                  <el-button 
                    v-if="!skill.installed" 
                    size="small" 
                    type="primary"
                    @click="installSkill(skill)"
                  >{{ t('mcpInstall') }}</el-button>
                  <el-button 
                    v-else 
                    size="small" 
                    type="danger" 
                    plain
                    @click="uninstallSkill(skill)"
                  >{{ t('mcpUninstall') }}</el-button>
                  <el-button size="small" @click="openSkillUrl(skill.url)">{{ t('mcpDetails') }}</el-button>
                </div>
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

        <!-- 任务面板 -->
        <div class="settings-panel" v-if="selectedNav === 'tasks'">
          <div class="panel-header">
            <div class="panel-header-left">
              <h3>{{ t('taskPanelTitle') }}</h3>
              <p class="panel-desc">{{ t('taskPanelDesc') }}</p>
            </div>
          </div>
          <div class="tasks-overview">
            <div class="task-stat-card">
              <div class="task-stat-label">{{ t('taskTotal') }}</div>
              <div class="task-stat-value">{{ currentPlan.length }}</div>
            </div>
            <div class="task-stat-card">
              <div class="task-stat-label">{{ t('taskRunning') }}</div>
              <div class="task-stat-value">{{ runningPlanCount }}</div>
            </div>
            <div class="task-stat-card">
              <div class="task-stat-label">{{ t('taskCompleted') }}</div>
              <div class="task-stat-value">{{ completedPlanCount }}</div>
            </div>
          </div>
          <div class="task-automation-card">
            <div class="task-automation-title">{{ t('taskAutomationTitle') }}</div>
            <div class="task-automation-desc">{{ t('taskAutomationDesc') }}</div>
            <div class="task-automation-actions">
              <el-select v-model="chatExecutionMode" size="small" style="width: 180px">
                <el-option :label="t('executionModeAuto')" value="auto" />
                <el-option :label="t('executionModeManual')" value="manual" />
              </el-select>
              <el-button size="small" @click="switchNav('chat')">{{ t('taskGoChat') }}</el-button>
            </div>
          </div>
        </div>

        <!-- 控制端面板 -->
        <div class="settings-panel" v-if="selectedNav === 'control'">
          <div class="panel-header">
            <div class="panel-header-left">
              <h3>{{ t('controlPanelTitle') }}</h3>
              <p class="panel-desc">{{ t('controlPanelDesc') }}</p>
            </div>
          </div>

          <div class="control-global-card">
            <div class="control-global-main">
              <div class="control-global-title">{{ t('controlGlobalEnable') }}</div>
              <el-switch v-model="remoteControlConfig.enabled" />
            </div>
            <div class="control-global-row">
              <el-input v-model="remoteControlConfig.commandPrefix" :placeholder="t('controlCommandPrefix')">
                <template #prepend>{{ t('controlCommandPrefix') }}</template>
              </el-input>
            </div>
            <div class="control-global-row">
              <el-input v-model="remoteControlConfig.verifyCode" :placeholder="t('controlVerifyCode')">
                <template #prepend>{{ t('controlVerifyCode') }}</template>
              </el-input>
            </div>
            <div class="control-global-row control-webhook-row">
              <el-input :model-value="remoteControlWebhookUrl" readonly>
                <template #prepend>{{ t('controlWebhookUrl') }}</template>
              </el-input>
              <el-button size="small" @click="copyMessageText(remoteControlWebhookUrl)">{{ t('copyMessage') }}</el-button>
            </div>
          </div>

          <div class="control-grid">
            <div class="control-card">
              <div class="control-card-header">
                <span>{{ t('controlChannelTelegram') }}</span>
                <el-switch v-model="remoteControlConfig.telegram.enabled" />
              </div>
              <el-input v-model="remoteControlConfig.telegram.botToken" :placeholder="t('controlBotToken')" />
              <el-input v-model="remoteControlConfig.telegram.chatId" :placeholder="t('controlChatId')" />
            </div>

            <div class="control-card">
              <div class="control-card-header">
                <span>{{ t('controlChannelQq') }}</span>
                <el-switch v-model="remoteControlConfig.qq.enabled" />
              </div>
              <el-input v-model="remoteControlConfig.qq.botId" :placeholder="t('controlBotId')" />
              <el-input v-model="remoteControlConfig.qq.webhook" :placeholder="t('controlWebhook')" />
            </div>

            <div class="control-card">
              <div class="control-card-header">
                <span>{{ t('controlChannelFeishu') }}</span>
                <el-switch v-model="remoteControlConfig.feishu.enabled" />
              </div>
              <el-input v-model="remoteControlConfig.feishu.appId" :placeholder="t('controlAppId')" />
              <el-input v-model="remoteControlConfig.feishu.appSecret" :placeholder="t('controlAppSecret')" />
              <el-input v-model="remoteControlConfig.feishu.webhook" :placeholder="t('controlWebhook')" />
            </div>
          </div>

          <div class="control-footer">
            <el-button type="primary" @click="saveRemoteControlConfig">{{ t('controlSave') }}</el-button>
          </div>
        </div>

        <!-- 设置面板 -->
        <div class="settings-panel" v-if="selectedNav === 'settings'">
          <div class="settings-header">
            <h3>{{ t('systemSettings') }}</h3>
          </div>
          
          <el-tabs v-model="activeSettingTab">
            <el-tab-pane :label="t('basicSettings')" name="basic">
              <el-form label-position="top">
                <el-form-item :label="t('backendAddress')">
                  <el-input v-model="config.settings.backendPort" placeholder="17871" />
                </el-form-item>
                <el-form-item :label="t('themeSetting')">
                  <el-select v-model="config.settings.theme">
                    <el-option :label="t('light')" value="light" />
                    <el-option :label="t('dark')" value="dark" />
                    <el-option :label="t('gray')" value="gray" />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('languageSetting')">
                  <el-select v-model="config.settings.language">
                    <el-option :label="t('chinese')" value="zh-CN" />
                    <el-option :label="t('english')" value="en-US" />
                  </el-select>
                </el-form-item>
                <el-form-item :label="t('dataDirectory')">
                  <el-input v-model="chatStorageConfig.currentUserDataDir" />
                  <div class="path-hint">{{ chatStorageConfig.platform }}</div>
                  <el-button style="margin-top: 8px" @click="saveChatStorageDirectory">
                    {{ t('saveDataDirectory') }}
                  </el-button>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="persistConfig">{{ t('saveSettings') }}</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>
            <el-tab-pane :label="t('modelConfig')" name="model">
              <div class="model-config-container">
                <!-- 模型列表 -->
                <div class="model-list-simple">
                  <div 
                    v-for="model in config.models" 
                    :key="model.id"
                    class="model-item"
                    :class="{ active: model.id === config.settings.activeModelId }"
                  >
                    <div class="model-item-left" @click="activateModel(model.id)">
                      <div class="model-icon-small">{{ getProviderIcon(model.provider) }}</div>
                      <div class="model-item-info">
                        <div class="model-item-name">
                          {{ model.name }}
                          <el-tag v-if="model.isBuiltIn" type="info" size="small" effect="plain" class="type-tag">
                            {{ t('builtIn') }}
                          </el-tag>
                          <el-tag v-if="model.id === config.settings.activeModelId" type="primary" size="small" effect="dark" class="status-tag-inline">
                            ●
                          </el-tag>
                        </div>
                        <div class="model-item-provider">{{ model.customProviderName || getProviderName(model.provider) }}</div>
                      </div>
                    </div>
                    <div class="model-item-actions">
                      <el-button circle size="small" @click.stop="openModelDialog('edit', model)">
                        <el-icon><EditPen /></el-icon>
                      </el-button>
                      <el-button circle size="small" type="danger" @click.stop="deleteModel(model.id)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                  
                  <!-- 添加模型按钮 -->
                  <div class="model-add-simple" @click="openModelDialog('add')">
                    <el-icon :size="20"><Plus /></el-icon>
                    <span>{{ t('addModel') }}</span>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane :label="t('tokenStats')" name="token">
              <div class="token-stats-container">
                <el-row :gutter="20" v-if="tokenStats.totalTokens > 0">
                  <el-col :span="8">
                    <el-card shadow="hover" class="token-card">
                      <div class="token-stat-label">{{ t('totalTokens') }}</div>
                      <div class="token-stat-value">{{ formatNumber(tokenStats.totalTokens) }}</div>
                    </el-card>
                  </el-col>
                  <el-col :span="8">
                    <el-card shadow="hover" class="token-card">
                      <div class="token-stat-label">{{ t('promptTokens') }}</div>
                      <div class="token-stat-value">{{ formatNumber(tokenStats.totalPrompt) }}</div>
                    </el-card>
                  </el-col>
                  <el-col :span="8">
                    <el-card shadow="hover" class="token-card">
                      <div class="token-stat-label">{{ t('completionTokens') }}</div>
                      <div class="token-stat-value">{{ formatNumber(tokenStats.totalCompletion) }}</div>
                    </el-card>
                  </el-col>
                </el-row>
                <el-empty v-else :description="t('noTokenData')" />
                <el-divider v-if="Object.keys(tokenStats.byModel || {}).length > 0">{{ t('byModel') }}</el-divider>
                <el-table v-if="Object.keys(tokenStats.byModel || {}).length > 0" :data="tokenStatsTableData" stripe>
                  <el-table-column prop="model" :label="t('model')" />
                  <el-table-column prop="prompt" :label="t('promptTokens')" align="right">
                    <template #default="{ row }">{{ formatNumber(row.prompt) }}</template>
                  </el-table-column>
                  <el-table-column prop="completion" :label="t('completionTokens')" align="right">
                    <template #default="{ row }">{{ formatNumber(row.completion) }}</template>
                  </el-table-column>
                  <el-table-column prop="total" :label="t('totalTokens')" align="right">
                    <template #default="{ row }">{{ formatNumber(row.total) }}</template>
                  </el-table-column>
                </el-table>
              </div>
            </el-tab-pane>
          </el-tabs>

          <el-divider />
        </div>
      </main>
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

    <!-- MCP 安装配置对话框 -->
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

    <!-- 模型管理对话框 -->
    <el-dialog 
      v-model="modelDialogVisible" 
      :title="modelDialogMode === 'add' ? t('addModel') : t('edit')" 
      width="600px"
    >
      <el-form :model="currentModel" label-width="120px" v-if="currentModel">
        <el-form-item :label="t('modelName')">
          <el-input v-model="currentModel.name" :placeholder="t('enterModelName')" />
        </el-form-item>
        
        <el-form-item :label="t('provider')">
          <el-select v-model="currentModel.provider">
            <el-option label="OpenAI" value="openai" />
            <el-option label="Anthropic" value="anthropic" />
            <el-option label="Google" value="google" />
            <el-option label="Meta" value="meta" />
            <el-option label="Mistral AI" value="mistral" />
            <el-option label="OpenRouter" value="openrouter" />
            <el-option label="百度文心一言" value="baidu" />
            <el-option label="阿里云通义千问" value="aliyun" />
            <el-option label="腾讯混元大模型" value="tencent" />
            <el-option label="字节跳动豆包" value="bytedance" />
            <el-option label="智谱AI GLM" value="zhipu" />
            <el-option :label="t('localModel')" value="local" />
            <el-option :label="t('custom')" value="custom" />
          </el-select>
        </el-form-item>
        
        <el-form-item :label="t('customProviderName')" v-if="currentModel.provider === 'custom'">
          <el-input v-model="currentModel.customProviderName" :placeholder="t('customProviderName')" />
        </el-form-item>
        
        <el-form-item :label="t('apiKey')">
          <el-input 
            v-model="currentModel.apiKey" 
            type="password" 
            :placeholder="t('apiKey')" 
            :show-password="true"
          />
        </el-form-item>
        
        <el-form-item :label="t('modelIdentifier')">
          <el-input v-model="currentModel.modelName" placeholder="gpt-4o, claude-3-opus-20240229" />
        </el-form-item>
        
        <el-form-item :label="t('apiBaseUrl')">
          <el-input v-model="currentModel.apiBaseUrl" placeholder="https://api.openai.com/v1" />
        </el-form-item>
        
        <el-form-item :label="t('activeStatus')">
          <el-switch v-model="currentModel.isActive" />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="modelDialogVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="saveModel">
          {{ modelDialogMode === 'add' ? t('add') : t('save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyDialogVisible" :title="t('viewHistoryChats')" width="520px">
      <div class="history-list history-list-compact">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="history-item"
          :class="{ active: conv.id === currentConversationId }"
          @click="switchToHistoryConversation(conv.id)"
          @contextmenu.prevent="openConversationContextMenu($event, conv.id)"
        >
          <el-icon><ChatLineRound /></el-icon>
          <span class="history-title">{{ conv.title }}</span>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="customAiAskDialogVisible" :title="t('customAiAskTitle')" width="560px">
      <el-form label-position="top">
        <el-form-item :label="t('customAiSelectModel')">
          <el-select v-model="customAiAskForm.modelId" style="width: 100%" :placeholder="t('selectModelPlaceholder')">
            <el-option
              v-for="model in availableModels"
              :key="model.value"
              :label="model.label"
              :value="model.value"
            />
          </el-select>
          <div class="field-hint">
            {{ t('selectedAiName') }}: {{ customAiAskSelectedModelLabel || '-' }}
          </div>
        </el-form-item>
        <el-form-item :label="t('customAiDisplayName')">
          <el-input
            v-model="customAiAskForm.aiName"
            :placeholder="t('customAiDisplayNamePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('customAiPrompt')">
          <el-input
            v-model="customAiAskForm.prompt"
            type="textarea"
            :rows="3"
            :placeholder="t('customAiPromptPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('customAiSkill')">
          <el-select v-model="customAiAskForm.skillId" clearable style="width: 100%" :placeholder="t('selectSkillPlaceholder')">
            <el-option
              v-for="skill in config.skills"
              :key="skill.id"
              :label="skill.name"
              :value="skill.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('customAiMcp')">
          <el-select
            v-model="customAiAskForm.mcpServers"
            multiple
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
            :placeholder="t('customAiMcpPlaceholder')"
          >
            <el-option
              v-for="serverId in mcpToolServers"
              :key="serverId"
              :label="serverId"
              :value="serverId"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button plain @click="addCustomAskAi">{{ t('addCustomAskAi') }}</el-button>
        </el-form-item>
        <el-form-item v-if="customAskAiList.length > 0" :label="t('addedCustomAskAi')">
          <div class="custom-ai-list">
            <div v-for="item in customAskAiList" :key="item.id" class="custom-ai-list-item">
              <span class="custom-ai-list-avatar">{{ item.avatarText }}</span>
              <span class="custom-ai-list-name">
                {{ item.name }}
                <small class="custom-ai-list-sub">{{ item.modelLabel }} · {{ item.skillId || t('customAiNoSkill') }} · MCP {{ item.mcpServers.length }}</small>
              </span>
              <el-button text type="danger" size="small" @click="removeCustomAskAi(item.id)">
                {{ t('delete') }}
              </el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item :label="t('customAiQuestionLabel')">
          <el-input
            v-model="customAiAskForm.question"
            type="textarea"
            :rows="5"
            :placeholder="t('customAiAskPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('customAiAutoContinue')">
          <el-switch v-model="customAiAskForm.autoContinue" />
          <div class="field-hint">{{ t('customAiAutoContinueHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('customAiMultiLoop')">
          <el-switch v-model="customAiAskForm.multiAiLoop" :disabled="customAskAiList.length < 2" />
          <div class="field-hint">{{ t('customAiMultiLoopHint') }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="customAiAskDialogVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitCustomAiAsk">{{ t('send') }}</el-button>
      </template>
    </el-dialog>

    <div
      v-if="conversationContextMenu.visible"
      class="history-context-menu"
      :style="{ left: `${conversationContextMenu.x}px`, top: `${conversationContextMenu.y}px` }"
      @click.stop
    >
      <button type="button" class="history-context-menu-item" @click="copyConversationHistory()">
        {{ t('historyContextCopy') }}
      </button>
      <button type="button" class="history-context-menu-item danger" @click="deleteConversationHistory()">
        {{ t('historyContextDelete') }}
      </button>
    </div>

    <!-- 输入框右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <button type="button" class="context-menu-item" @click="copySelection()">
          复制
        </button>
        <button type="button" class="context-menu-item" @click="pasteFromClipboard()">
          粘贴
        </button>
        <button type="button" class="context-menu-item" @click="selectAll()">
          全选
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { ElMessage, ElMessageBox } from "element-plus"
import MonitorPanel from "./components/MonitorPanel.vue"
import AgentDashboard from "./components/AgentDashboard.vue"
import {
  ArrowLeftBold,
  ChatLineRound,
  CloseBold,
  Connection,
  CopyDocument,
  Delete,
  EditPen,
  Fold,
  Grid,
  Menu,
  Paperclip,
  Plus,
  Promotion,
  RefreshRight,
  Setting,
  Star,
  Timer,
} from "@element-plus/icons-vue"

const apiBase = ref("")

const loading = reactive({
  bootstrap: true,
  config: false,
  chat: false
})

const isChatPaused = ref(false)
let chatAbortController: AbortController | null = null
let typewriterTimer: ReturnType<typeof setInterval> | null = null
let chatHistorySaveTimer: ReturnType<typeof setTimeout> | null = null
let backendPollTimer: ReturnType<typeof setInterval> | null = null
const typewriterState = {
  messageIndex: -1,
  queue: [] as string[],
  resolver: null as null | (() => void)
}
const chatHistoryHydrating = ref(false)
const chatHistoryReady = ref(false)

const selectedChatModel = ref('')
const chatExecutionMode = ref<'auto' | 'manual'>('auto')
const customAiAskDialogVisible = ref(false)
const customAiAskForm = reactive({
  modelId: '',
  question: '',
  aiName: '',
  prompt: '',
  skillId: '',
  mcpServers: [] as string[],
  autoContinue: true,
  multiAiLoop: false
})
const customAiAutoAskRunning = ref(false)
const customAiAutoAskStopRequested = ref(false)
const customAiAutoAskModelId = ref('')
const selectedCustomAskAiId = ref('')
interface CustomAskAiItem {
  id: string
  modelId: string
  modelLabel: string
  name: string
  avatarText: string
  prompt: string
  skillId: string
  mcpServers: string[]
}
const customAskAiList = ref<CustomAskAiItem[]>([])
const mcpToolServers = ref<string[]>([])
const backendOnline = ref(false)

// 计划列表
const currentPlan = ref<any[]>([])

interface TraceDetailItem {
  stage: string
  text: string
  time: string
}

interface TraceMcpRuntimeItem {
  status: 'start' | 'success' | 'error'
  label: string
  time: string
  error?: string
}

interface MessageTraceState {
  planLines: string[]
  details: TraceDetailItem[]
  mcpRuntime: Record<string, TraceMcpRuntimeItem>
}

// 更新计划列表
const updatePlan = (plan: any[]) => {
  currentPlan.value = plan
}

// 清空计划列表
const clearPlan = () => {
  currentPlan.value = []
}
interface LiveState {
  mouse: { x: number; y: number }
  screen: { width: number; height: number }
}

const liveState = ref<LiveState>({
  mouse: { x: 0, y: 0 },
  screen: { width: 0, height: 0 }
})

interface AppConfig {
  settings: {
    backendPort: number
    theme: string
    language: string
    activeModelId: string
    userDataDir?: string
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

interface Conversation {
  id: string
  title: string
  messages: Array<{
    role: string
    text: string
    agentName?: string
    meta?: any
    typing?: boolean
    error?: boolean
    pendingConfirm?: {
      server: string
      tool: string
      args: Record<string, any>
      message?: string
      executing?: boolean
    } | null
  }>
}

const config = ref<AppConfig>({
  settings: { 
    backendPort: 17871, 
    theme: "light",
    language: "zh-CN",
    activeModelId: "",
    userDataDir: ""
  },
  models: [],
  skills: []
})

const historyDialogVisible = ref(false)
const tokenStats = reactive({
  totalPrompt: 0,
  totalCompletion: 0,
  totalTokens: 0,
  byModel: {} as Record<string, { prompt: number; completion: number; total: number }>
})
const conversationContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  conversationId: ""
})
const chatStorageConfig = reactive({
  platform: '',
  defaultUserDataDir: '',
  currentUserDataDir: ''
})

interface RemoteControlConfig {
  enabled: boolean
  commandPrefix: string
  verifyCode: string
  telegram: {
    enabled: boolean
    botToken: string
    chatId: string
  }
  qq: {
    enabled: boolean
    botId: string
    webhook: string
  }
  feishu: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
}

const remoteControlStorageKey = 'desktop-agent-remote-control-config'
function createDefaultRemoteControlConfig(): RemoteControlConfig {
  return {
    enabled: false,
    commandPrefix: '/agent',
    verifyCode: '',
    telegram: {
      enabled: false,
      botToken: '',
      chatId: ''
    },
    qq: {
      enabled: false,
      botId: '',
      webhook: ''
    },
    feishu: {
      enabled: false,
      appId: '',
      appSecret: '',
      webhook: ''
    }
  }
}

const remoteControlConfig = reactive<RemoteControlConfig>(createDefaultRemoteControlConfig())
const remoteControlWebhookUrl = computed(() => buildApiUrl('/api/remote-control/hook'))

const locales = {
  "zh-CN": {
    // 通用
    appTitle: "AI Agent",
    appSubtitle: "Desktop Studio",
    sidebarFold: "折叠侧边栏",
    newChat: "新建对话",
    navChat: "对话",
    navAgents: "代理",
    navMcp: "MCP",
    navSkills: "技能",
    navTasks: "任务",
    navControl: "远控端",
    navSettings: "设置",
    taskPanelTitle: "任务中心",
    taskPanelDesc: "查看执行进度，并调整 AI 自动执行策略",
    taskTotal: "总任务数",
    taskRunning: "进行中",
    taskCompleted: "已完成",
    taskAutomationTitle: "自动运行策略",
    taskAutomationDesc: "自动执行会直接运行工具调用，手动确认模式会在关键步骤等待你确认。",
    taskGoChat: "去对话页",
    controlPanelTitle: "远程控制端",
    controlPanelDesc: "通过 Telegram / QQ / 飞书远程下发指令，控制桌面代理执行。",
    controlGlobalEnable: "启用远程控制",
    controlCommandPrefix: "指令前缀",
    controlVerifyCode: "安全校验码",
    controlWebhookUrl: "Webhook 地址",
    controlSave: "保存控制端配置",
    controlSaved: "控制端配置已保存",
    controlEnable: "启用",
    controlChannelTelegram: "Telegram",
    controlChannelQq: "QQ",
    controlChannelFeishu: "飞书",
    controlBotToken: "Bot Token",
    controlChatId: "Chat ID",
    controlWebhook: "Webhook",
    controlBotId: "Bot ID",
    controlAppId: "App ID",
    controlAppSecret: "App Secret",
    statusOnline: "在线",
    statusOffline: "离线",
    loading: "加载中...",

    // 聊天
    chatTitle: "AI 对话",
    chatSubtitle: "与AI助手进行对话",
    selectSkillPlaceholder: "选择技能",
    selectModelPlaceholder: "选择模型",
    inputPlaceholder: "按 Enter 发送，Shift+Enter 换行",
    customAiAsk: "添加提问机器人",
    customAiAskTitle: "添加提问机器人（支持多个）",
    customAiSelectModel: "选择提问机器人模型",
    customAiQuestionLabel: "提问内容",
    customAiAskPlaceholder: "输入你想问的问题，使用所选听听文AI模型进行问答",
    currentAiName: "当前提问机器人",
    selectedAiName: "已选提问机器人",
    customAiDisplayName: "提问机器人名称",
    customAiDisplayNamePlaceholder: "例如：产品顾问机器人 / 代码助手机器人",
    customAiPrompt: "提问机器人提示词",
    customAiPromptPlaceholder: "为这个AI单独设置系统提示词，例如：你是严谨的代码审查助手...",
    customAiSkill: "绑定技能",
    customAiMcp: "可调用MCP",
    customAiMcpPlaceholder: "不选表示不限制（可调用全部已连接MCP）",
    customAiNoSkill: "未绑定技能",
    addCustomAskAi: "添加到提问机器人列表",
    addedCustomAskAi: "已添加提问机器人",
    customAiAdded: "提问机器人已添加",
    customAiRemoved: "提问机器人已移除",
    customAiExists: "该模型已在提问机器人列表中",
    customAiSwitched: "已切换当前提问机器人",
    customAiAutoContinue: "自动连续追问",
    customAiAutoContinueHint: "开启后会在提问机器人回复后自动继续基于回复提问，直到你手动停止。",
    customAiMultiLoop: "多提问机器人轮询",
    customAiMultiLoopHint: "开启后会在已添加提问机器人中按顺序轮流提问（至少添加 2 个）。",
    customAiAutoAsking: "提问机器人自动追问中",
    stopAutoAsk: "停止自动提问",
    autoAskStarted: "已开启自动提问",
    autoAskStopped: "已停止自动提问",
    autoAskNoReply: "自动提问停止：未收到有效回复",
    customAiNoModel: "请先在设置中配置至少一个提问机器人模型",
    customAiQuestionRequired: "请输入问题内容",
    executionModeAuto: "自动执行",
    executionModeManual: "手动确认",
    send: "发送",
    pause: "暂停",
    avatarAi: "AI",
    avatarUser: "我",
    attach: "添加附件",
    planTitle: "执行计划",
    showPlan: "查看执行详情",
    hidePlan: "收起执行详情",
    viewHistoryChats: "查看聊天历史对话",
    aiDetailTitle: "AI 处理细节",
    runResultTitle: "运行结果",
    mcpRunning: "当前调用 MCP",
    mcpRecent: "最近调用",
    monitorTitle: "监控面板",
    monitorShow: "显示监控",
    monitorHide: "隐藏监控",
    monitorCurrentExec: "本次执行信息",
    monitorModel: "模型",
    monitorToken: "Token 消耗",
    monitorDuration: "执行时间",
    monitorMcpTools: "MCP 工具",
    monitorSnapshot: "快照",
    monitorCurrentBot: "当前提问机器人",
    monitorAddBot: "添加机器人",
    monitorAutoRun: "自动执行",
    historyContextCopy: "复制会话",
    historyContextDelete: "删除会话",
    historyCopied: "会话内容已复制",
    historyDeleted: "会话已删除",
    historyDeleteTitle: "删除会话",
    historyDeleteConfirm: "确定删除该历史会话吗？删除后不可恢复。",
    copyMessage: "复制内容",
    resendMessage: "重新发送",
    rollbackMessage: "回退到此处",
    copied: "已复制",
    rolledBack: "已回退到该消息",
    confirmActionTitle: "待确认工具调用",
    confirmExecute: "确认执行",
    confirmCancel: "取消",
    confirmExecuted: "已手动执行工具调用",
    confirmCanceled: "已取消工具调用",

    // MCP
    mcpMarketTitle: "MCP 服务器市场",
    mcpMarketDesc: "发现和安装 MCP 服务器",
    mcpStatusInstalled: "已安装",
    mcpStatusNotInstalled: "未安装",
    mcpInstall: "安装",
    mcpUninstall: "卸载",
    mcpDetails: "详情",
    mcpNoData: "暂无 MCP 服务器数据",
    mcpLoadFailed: "加载 MCP 服务器失败",

    // 技能
    skillMarketTitle: "技能市场",
    skillMarketDesc: "发现和安装技能",
    addSkill: "添加技能",
    skillNoData: "暂无技能数据",
    skillLoadFailed: "加载技能失败",
    skillInstalled: "已安装",
    skillNotInstalled: "未安装",

    // 设置
    systemSettings: "系统设置",
    systemMenu: "系统菜单",
    basicSettings: "基本设置",
    backendAddress: "后端地址",
    dataDirectory: "用户数据目录",
    saveDataDirectory: "保存目录",
    saveSettings: "保存设置",
    themeSetting: "主题设置",
    languageSetting: "语言",
    light: "浅色",
    dark: "深色",
    gray: "灰色",
    chinese: "简体中文",
    english: "English",
    modelConfig: "大模型配置",
    tokenStats: "Token 统计",

    // 模型
    addModel: "添加模型",
    allModels: "所有模型",
    count: "个",
    activated: "已激活",
    builtIn: "内置",
    custom: "自定义",
    edit: "编辑",
    delete: "删除",
    noModels: "暂无模型",
    addFirstModel: "添加第一个模型",
    totalTokens: "总 Tokens",
    promptTokens: "提示 Tokens",
    completionTokens: "完成 Tokens",
    noTokenData: "暂无 Token 数据",
    byModel: "按模型分组",
    model: "模型",
    modelName: "模型名称",
    provider: "提供商",
    customProviderName: "自定义提供商名称",
    apiKey: "API 密钥",
    modelIdentifier: "模型标识",
    apiBaseUrl: "API 基础 URL",
    activeStatus: "激活状态",
    cancel: "取消",
    add: "添加",
    save: "保存",
    confirmDelete: "确认删除",
    deleteConfirmMessage: "确定要删除这个模型吗？此操作不可撤销。",
    confirm: "确定",
    deleteSuccess: "模型删除成功",
    modelActivated: "模型已激活",
    enterModelName: "请输入模型名称",
    enterApiBaseUrl: "请输入API基础URL",
    modelAdded: "模型添加成功",
    modelUpdated: "模型更新成功",
    modelDataEmpty: "模型数据为空",
    localModel: "本地模型",

    // 系统 - 历史 / 编辑器
    historyTitle: "历史会话",
    configEditorTitle: "配置编辑器",
    skillConfigTab: "技能配置",
    skillNameLabel: "技能名称",
    skillDescLabel: "技能描述",
    selectSkillPrompt: "请选择技能",
    skillNameRequired: "请输入技能名称",
    skillCreated: "技能已创建",
    newChatCreated: "新对话已创建",
    skillDeleted: "技能已删除",
    networkError: "网络错误，请稍后重试",
    jsonParseError: "JSON 格式错误，请检查配置",
    mcpConfigMissing: "配置中必须包含 mcpServers",
    installFailed: "安装失败",
    uninstallFailed: "卸载失败",
    confirmUninstall: "确定要卸载 {name} 吗？",
    confirmUninstallTitle: "确认卸载",
    confirmDeleteSkill: "确定要删除这个技能吗？",
    deleteSkillTitle: "删除技能",
    skillStarted: "技能已启动",
    saveSuccess: "配置已保存",
    saveFailed: "保存失败",
    dataDirectorySaved: "聊天数据目录已更新"
  },
  "en-US": {
    // Common
    appTitle: "AI Agent",
    appSubtitle: "Desktop Studio",
    sidebarFold: "Collapse sidebar",
    newChat: "New Chat",
    navChat: "Chat",
    navAgents: "Agents",
    navMcp: "MCP",
    navSkills: "Skills",
    navTasks: "Tasks",
    navControl: "Control",
    navSettings: "Settings",
    taskPanelTitle: "Task Center",
    taskPanelDesc: "Track execution progress and adjust AI automation policy",
    taskTotal: "Total",
    taskRunning: "Running",
    taskCompleted: "Completed",
    taskAutomationTitle: "Automation Policy",
    taskAutomationDesc: "Auto mode runs tool calls directly, while Manual mode waits for your confirmation.",
    taskGoChat: "Go to Chat",
    controlPanelTitle: "Remote Control",
    controlPanelDesc: "Send remote commands through Telegram / QQ / Feishu to control desktop execution.",
    controlGlobalEnable: "Enable remote control",
    controlCommandPrefix: "Command prefix",
    controlVerifyCode: "Verification code",
    controlWebhookUrl: "Webhook URL",
    controlSave: "Save control settings",
    controlSaved: "Control settings saved",
    controlEnable: "Enable",
    controlChannelTelegram: "Telegram",
    controlChannelQq: "QQ",
    controlChannelFeishu: "Feishu",
    controlBotToken: "Bot Token",
    controlChatId: "Chat ID",
    controlWebhook: "Webhook",
    controlBotId: "Bot ID",
    controlAppId: "App ID",
    controlAppSecret: "App Secret",
    statusOnline: "Online",
    statusOffline: "Offline",
    loading: "Loading...",

    // Chat
    chatTitle: "AI Chat",
    chatSubtitle: "Chat with AI assistant",
    selectSkillPlaceholder: "Select skill",
    selectModelPlaceholder: "Select model",
    inputPlaceholder: "Press Enter to send, Shift+Enter for newline",
    customAiAsk: "Add Question Bot",
    customAiAskTitle: "Add Question Bots (Multiple Supported)",
    customAiSelectModel: "Select Question Bot model",
    customAiQuestionLabel: "Question",
    customAiAskPlaceholder: "Enter your question and ask with the selected Question Bot model",
    currentAiName: "Current Question Bot",
    selectedAiName: "Selected Question Bot",
    customAiDisplayName: "Question Bot name",
    customAiDisplayNamePlaceholder: "e.g. Product Advisor Bot / Code Assistant Bot",
    customAiPrompt: "Question Bot prompt",
    customAiPromptPlaceholder: "Set dedicated system prompt for this AI, e.g. You are a strict code reviewer...",
    customAiSkill: "Bound skill",
    customAiMcp: "Allowed MCPs",
    customAiMcpPlaceholder: "Empty means no restriction (all connected MCPs allowed)",
    customAiNoSkill: "No skill bound",
    addCustomAskAi: "Add to Question Bot list",
    addedCustomAskAi: "Added Question Bots",
    customAiAdded: "Question Bot added",
    customAiRemoved: "Question Bot removed",
    customAiExists: "This model is already in the Question Bot list",
    customAiSwitched: "Switched current Question Bot",
    customAiAutoContinue: "Auto follow-up",
    customAiAutoContinueHint: "When enabled, it keeps asking based on each Question Bot reply until you stop it.",
    customAiMultiLoop: "Multi-Bot rotation",
    customAiMultiLoopHint: "When enabled, it rotates through added Question Bots in order (requires at least 2).",
    customAiAutoAsking: "Question Bot auto follow-up",
    stopAutoAsk: "Stop auto ask",
    autoAskStarted: "Auto ask started",
    autoAskStopped: "Auto ask stopped",
    autoAskNoReply: "Auto ask stopped: no valid reply",
    customAiNoModel: "Please configure at least one Question Bot model in Settings first",
    customAiQuestionRequired: "Please enter a question",
    executionModeAuto: "Auto Run",
    executionModeManual: "Manual Confirm",
    send: "Send",
    pause: "Pause",
    avatarAi: "AI",
    avatarUser: "Me",
    attach: "Attach",
    planTitle: "Execution Plan",
    showPlan: "View execution details",
    hidePlan: "Hide execution details",
    viewHistoryChats: "View chat history",
    aiDetailTitle: "AI details",
    runResultTitle: "Run Results",
    mcpRunning: "Running MCP",
    mcpRecent: "Recent MCP calls",
    monitorTitle: "Monitor",
    monitorShow: "Show",
    monitorHide: "Hide",
    monitorCurrentExec: "Current Run",
    monitorModel: "Model",
    monitorToken: "Token Usage",
    monitorDuration: "Duration",
    monitorMcpTools: "MCP Tools",
    monitorSnapshot: "Snapshot",
    monitorCurrentBot: "Current Bot",
    monitorAddBot: "Add Bot",
    monitorAutoRun: "Auto Run",
    historyContextCopy: "Copy conversation",
    historyContextDelete: "Delete conversation",
    historyCopied: "Conversation copied",
    historyDeleted: "Conversation deleted",
    historyDeleteTitle: "Delete conversation",
    historyDeleteConfirm: "Delete this conversation history? This cannot be undone.",
    copyMessage: "Copy",
    resendMessage: "Resend",
    rollbackMessage: "Rollback to here",
    copied: "Copied",
    rolledBack: "Rolled back to this message",
    confirmActionTitle: "Pending Tool Call",
    confirmExecute: "Execute",
    confirmCancel: "Cancel",
    confirmExecuted: "Tool call executed manually",
    confirmCanceled: "Tool call canceled",

    // MCP
    mcpMarketTitle: "MCP Server Market",
    mcpMarketDesc: "Discover and install MCP servers",
    mcpStatusInstalled: "Installed",
    mcpStatusNotInstalled: "Not installed",
    mcpInstall: "Install",
    mcpUninstall: "Uninstall",
    mcpDetails: "Details",
    mcpNoData: "No MCP servers found",
    mcpLoadFailed: "Failed to load MCP servers",

    // Skills
    skillMarketTitle: "Skill Market",
    skillMarketDesc: "Discover and install skills",
    addSkill: "Add Skill",
    skillNoData: "No skills found",
    skillLoadFailed: "Failed to load skills",
    skillInstalled: "Installed",
    skillNotInstalled: "Not installed",

    // Settings
    systemSettings: "System Settings",
    systemMenu: "System Menu",
    basicSettings: "Basic",
    backendAddress: "Backend Port",
    dataDirectory: "User data directory",
    saveDataDirectory: "Save directory",
    saveSettings: "Save",
    themeSetting: "Theme",
    languageSetting: "Language",
    light: "Light",
    dark: "Dark",
    gray: "Gray",
    chinese: "Simplified Chinese",
    english: "English",
    modelConfig: "Model Configuration",
    tokenStats: "Token Statistics",

    // Models
    addModel: "Add Model",
    allModels: "All Models",
    count: "",
    activated: "Activated",
    builtIn: "Built-in",
    custom: "Custom",
    edit: "Edit",
    delete: "Delete",
    noModels: "No models available",
    addFirstModel: "Add First Model",
    totalTokens: "Total Tokens",
    promptTokens: "Prompt Tokens",
    completionTokens: "Completion Tokens",
    noTokenData: "No Token Data",
    byModel: "By Model",
    model: "Model",
    modelName: "Model Name",
    provider: "Provider",
    customProviderName: "Custom Provider Name",
    apiKey: "API Key",
    modelIdentifier: "Model Identifier",
    apiBaseUrl: "API Base URL",
    activeStatus: "Active Status",
    cancel: "Cancel",
    add: "Add",
    save: "Save",
    confirmDelete: "Confirm Delete",
    deleteConfirmMessage: "Are you sure you want to delete this model? This action cannot be undone.",
    confirm: "Confirm",
    deleteSuccess: "Model deleted successfully",
    modelActivated: "Model activated",
    enterModelName: "Please enter model name",
    enterApiBaseUrl: "Please enter API base URL",
    modelAdded: "Model added successfully",
    modelUpdated: "Model updated successfully",
    modelDataEmpty: "Model data is empty",
    localModel: "Local Model",

    // System - History / Editor
    historyTitle: "Conversation History",
    configEditorTitle: "Configuration Editor",
    skillConfigTab: "Skill Configuration",
    skillNameLabel: "Skill Name",
    skillDescLabel: "Skill Description",
    selectSkillPrompt: "Please select skill",
    skillNameRequired: "Please enter skill name",
    skillCreated: "Skill created",
    newChatCreated: "New chat created",
    skillDeleted: "Skill deleted",
    networkError: "Network error, please try again later",
    jsonParseError: "JSON format error, please check the configuration",
    mcpConfigMissing: "Configuration must contain mcpServers",
    installFailed: "Installation failed",
    uninstallFailed: "Uninstall failed",
    confirmUninstall: "Are you sure you want to uninstall {name}?",
    confirmUninstallTitle: "Confirm Uninstall",
    confirmDeleteSkill: "Are you sure you want to delete this skill?",
    deleteSkillTitle: "Delete Skill",
    skillStarted: "Skill started",
    saveSuccess: "Configuration saved",
    saveFailed: "Save failed",
    dataDirectorySaved: "Chat data directory updated"
  }
}

const t = (key: string) => {
  const lang = config.value.settings.language || "zh-CN"
  const localeData = locales[lang as keyof typeof locales]
  return localeData?.[key as keyof typeof localeData] || key
}

type NavKey = "chat" | "agents" | "mcp" | "skills" | "tasks" | "control" | "settings"
interface NavigationItem {
  id: NavKey
  icon: any
  labelKey: string
  showInToolbar?: boolean
}

const navigationItems = computed<NavigationItem[]>(() => [
  { id: "chat", icon: ChatLineRound, labelKey: "navChat", showInToolbar: true },
  { id: "agents", icon: Grid, labelKey: "navAgents", showInToolbar: true },
  { id: "mcp", icon: Connection, labelKey: "navMcp" },
  { id: "skills", icon: Star, labelKey: "navSkills", showInToolbar: true },
  { id: "tasks", icon: Timer, labelKey: "navTasks", showInToolbar: true },
  { id: "control", icon: Promotion, labelKey: "navControl", showInToolbar: true },
  { id: "settings", icon: Setting, labelKey: "navSettings", showInToolbar: true }
])

const toolbarNavigationItems = computed(() =>
  navigationItems.value.filter(item => item.showInToolbar)
)

const tokenStatsTableData = computed(() => {
  const byModel = tokenStats.byModel || {}
  return Object.entries(byModel).map(([model, data]) => ({
    model,
    ...data
  }))
})

function applyTheme() {
  const theme = String(config.value.settings.theme || "light").toLowerCase()
  const classes = ["theme-dark", "theme-gray"]
  document.documentElement.classList.remove(...classes)
  if (theme === "dark") {
    document.documentElement.classList.add("theme-dark")
  } else if (theme === "gray") {
    document.documentElement.classList.add("theme-gray")
  }
}

watch(
  () => config.value.settings.theme,
  () => applyTheme(),
  { immediate: true }
)

const chatInput = ref("")
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const selectedChatSkillId = ref("")
const skillDialogVisible = ref(false)
const selectedNav = ref<NavKey>("chat")
const sidebarCollapsed = ref(false)
const activeSettingTab = ref("basic")
const monitorPanelVisible = ref(true)

watch(activeSettingTab, (newTab) => {
  if (newTab === 'token') {
    loadTokenStats()
  }
})

// 聊天历史记录支持
const conversations = ref<Conversation[]>([{
  id: "default",
  title: "新对话",
  messages: [
    {
      role: "assistant",
      text: "欢迎使用AI助手！我可以帮您处理各种任务。"
    }
  ]
}])

const currentConversationId = ref("default")

const currentConversation = computed(() =>
  conversations.value.find((c) => c.id === currentConversationId.value) || conversations.value[0]
)

const messages = computed(() => currentConversation.value.messages)
const chatMessagesRef = ref<HTMLElement | null>(null)
const completedPlanCount = computed(() =>
  currentPlan.value.filter(step => Boolean(step?.completed)).length
)
const runningPlanCount = computed(() =>
  currentPlan.value.filter(step => Boolean(step?.active) && !step?.completed).length
)

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    if (!chatMessagesRef.value) return
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
  })
}

function traceStepLabel(index: number) {
  return `${index + 1}`
}

function createEmptyTrace(): MessageTraceState {
  return {
    planLines: [],
    details: [],
    mcpRuntime: {}
  }
}

function getMessageTrace(message: any): MessageTraceState | null {
  const trace = message?.meta?.trace
  if (!trace || typeof trace !== 'object') return null
  if (!Array.isArray(trace.planLines) || !Array.isArray(trace.details) || !trace.mcpRuntime || typeof trace.mcpRuntime !== 'object') return null
  return trace as MessageTraceState
}

function ensureMessageTrace(message: any): MessageTraceState {
  if (!message || typeof message !== 'object') {
    return createEmptyTrace()
  }

  let safeMeta: Record<string, any>
  if (message.meta && typeof message.meta === 'object' && !Array.isArray(message.meta)) {
    safeMeta = message.meta as Record<string, any>
  } else {
    safeMeta = {}
  }

  const existingTrace = safeMeta.trace
  if (
    !existingTrace ||
    typeof existingTrace !== 'object' ||
    !Array.isArray(existingTrace.planLines) ||
    !Array.isArray(existingTrace.details) ||
    !existingTrace.mcpRuntime ||
    typeof existingTrace.mcpRuntime !== 'object'
  ) {
    safeMeta.trace = createEmptyTrace()
  }

  message.meta = safeMeta
  return message.meta.trace as MessageTraceState
}

function syncPlanToMessage(message: any, plan: any[]) {
  const trace = ensureMessageTrace(message)
  trace.planLines = (Array.isArray(plan) ? plan : [])
    .map((step, index) => String(step?.title || step?.description || `步骤 ${index + 1}`))
    .filter(Boolean)
}

function pushExecutionDetailToMessage(message: any, stage: string, text: string, time?: string) {
  const trace = ensureMessageTrace(message)
  trace.details.push({
    stage: String(stage || 'detail'),
    text: String(text || ''),
    time: String(time || new Date().toISOString())
  })
  if (trace.details.length > 60) {
    trace.details.splice(0, trace.details.length - 60)
  }
}

function applyMcpEventToMessage(message: any, eventData: any) {
  const trace = ensureMessageTrace(message)
  const server = String(eventData?.server || '')
  const tool = String(eventData?.tool || '')
  if (!server || !tool) return
  const key = `${server}/${tool}`
  const label = `${server}/${tool}`
  const status = eventData?.status === 'error' ? 'error' : eventData?.status === 'success' ? 'success' : 'start'
  trace.mcpRuntime[key] = {
    status,
    label,
    time: String(eventData?.time || new Date().toISOString()),
    error: eventData?.error ? String(eventData.error) : undefined
  }

  if (status === 'error') {
    const errText = String(eventData?.error || '未知错误')
    pushExecutionDetailToMessage(message, 'mcp', `${label} 调用失败：${errText}`, eventData?.time)
  } else if (status === 'success') {
    pushExecutionDetailToMessage(message, 'mcp', `${label} 调用完成`, eventData?.time)
  } else {
    pushExecutionDetailToMessage(message, 'mcp', `${label} 调用中`, eventData?.time)
  }
}

function updateConversationTitleFromMessage(message: string) {
  const conv = currentConversation.value
  if (!conv) return
  const existingTitle = String(conv.title || '').trim()
  const isDefaultTitle = ['新对话', 'New Chat', '默认对话', 'default'].includes(existingTitle)
  if (!isDefaultTitle) return
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return
  conv.title = normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized
}

function shouldShowInlineTrace(message: any, index: number) {
  if (!message || message.role !== 'assistant') return false
  const trace = getMessageTrace(message)
  if (!trace) return false
  const hasTrace = trace.planLines.length > 0 || trace.details.length > 0 || Object.keys(trace.mcpRuntime).length > 0
  if (!hasTrace) return false
  return index >= 0
}

function traceDetails(message: any): TraceDetailItem[] {
  const trace = getMessageTrace(message)
  if (!trace) return []
  const planItems = trace.planLines.map((text, idx) => ({
    stage: 'plan',
    text,
    time: `plan-${idx}`
  }))
  return [...planItems, ...trace.details]
}

function traceRunningCalls(message: any): string[] {
  const runtime = getMessageTrace(message)?.mcpRuntime || {}
  return Object.values(runtime)
    .filter(item => item.status === 'start')
    .map(item => item.label)
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

function renderMessageText(text: string): string {
  if (!text) return ""

  const codeBlocks: string[] = []
  let html = escapeHtml(text)

  html = html.replace(/```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_all, lang, code) => {
    const codeHtml = `<pre class="md-code"><div class="md-code-lang">${lang || "text"}</div><code>${String(code).trimEnd()}</code></pre>`
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`
    codeBlocks.push(codeHtml)
    return token
  })

  html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
  html = html.replace(/\n/g, "<br/>")

  html = html.replace(/@@CODE_BLOCK_(\d+)@@/g, (_m, i) => codeBlocks[Number(i)] || "")

  return html
}

watch(() => messages.value.length, () => scrollChatToBottom())
watch(() => currentConversationId.value, () => scrollChatToBottom())

const skillDialogForm = reactive({
  name: "",
  description: ""
})

const mcpInstallDialogVisible = ref(false)
const mcpConfigJson = ref("")
const mcpInstalling = ref(false)

const mcpServers = ref<any[]>([])
const mcpLoading = ref(false)
const skillMarket = ref<any[]>([])
const skillLoading = ref(false)
const skillCurrentPage = ref(1)
const skillPageSize = ref(10)
const skillPagination = ref({ total: 0, totalPages: 0, hasMore: false })

async function fetchMcpServers() {
  mcpLoading.value = true
  try {
    const res = await fetch(buildApiUrl('/api/mcp'))
    const data = await res.json()
    if (data.ok) {
      mcpServers.value = Array.isArray(data.servers) ? data.servers : []
      const toolMap = data.tools && typeof data.tools === 'object' ? data.tools : {}
      mcpToolServers.value = Object.keys(toolMap)
    } else {
      mcpServers.value = []
      mcpToolServers.value = []
      ElMessage.error(data.error || t('mcpLoadFailed'))
    }
  } catch (e) {
    console.error("Failed to fetch MCP servers:", e)
    mcpServers.value = []
    mcpToolServers.value = []
    ElMessage.error(t('networkError'))
  } finally {
    mcpLoading.value = false
  }
}

async function fetchSkillMarket(page: number = 1) {
  skillLoading.value = true
  try {
    const res = await fetch(buildApiUrl(`/api/skill-market?page=${page}&pageSize=${skillPageSize.value}`))
    const data = await res.json()
    if (data.ok) {
      skillMarket.value = Array.isArray(data.skills) ? data.skills : []
      skillPagination.value = data.pagination || { total: 0, totalPages: 0, hasMore: false }
      skillCurrentPage.value = page
    } else {
      skillMarket.value = []
      ElMessage.error(data.error || t('skillLoadFailed'))
    }
  } catch (e) {
    console.error("Failed to fetch skill market:", e)
    skillMarket.value = []
    ElMessage.error(t('networkError'))
  } finally {
    skillLoading.value = false
  }
}

function handleSkillPageChange(page: number) {
  fetchSkillMarket(page)
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
    const res = await fetch(buildApiUrl('/api/mcp/install'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config })
    })
    const data = await res.json()
    if (data.ok) {
      mcpInstallDialogVisible.value = false
      ElMessage.success(data.message)
      fetchMcpServers()
    } else {
      ElMessage.error(data.error)
    }
  } catch (e) {
    ElMessage.error(t('installFailed'))
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
    
    const res = await fetch(buildApiUrl('/api/mcp/uninstall'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: server.id })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success(data.message)
      fetchMcpServers()
    } else {
      ElMessage.error(data.error)
    }
  } catch {}
}

async function installSkill(skill: any) {
  try {
    const res = await fetch(buildApiUrl('/api/skill-market/install'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: skill.id })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success(data.message)
      fetchSkillMarket(skillCurrentPage.value)
    } else {
      ElMessage.error(data.error)
    }
  } catch (e) {
    ElMessage.error(t('installFailed'))
  }
}

async function uninstallSkill(skill: any) {
  try {
    const res = await fetch(buildApiUrl('/api/skill-market/uninstall'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: skill.id })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success(data.message)
      fetchSkillMarket(skillCurrentPage.value)
    } else {
      ElMessage.error(data.error)
    }
  } catch (e) {
    ElMessage.error("卸载失败")
  }
}

function openSkillUrl(url: string) {
  if (url) {
    window.open(url, "_blank")
  }
}

function openMcpUrl(url: string) {
  if (url) {
    window.open(url, "_blank")
  }
}

function loadRemoteControlConfig() {
  try {
    const raw = localStorage.getItem(remoteControlStorageKey)
    if (!raw) return
    const parsed = JSON.parse(raw || '{}') as Partial<RemoteControlConfig>

    remoteControlConfig.enabled = Boolean(parsed.enabled)
    remoteControlConfig.commandPrefix = String(parsed.commandPrefix || '/agent')
    remoteControlConfig.verifyCode = String(parsed.verifyCode || '')

    remoteControlConfig.telegram.enabled = Boolean(parsed.telegram?.enabled)
    remoteControlConfig.telegram.botToken = String(parsed.telegram?.botToken || '')
    remoteControlConfig.telegram.chatId = String(parsed.telegram?.chatId || '')

    remoteControlConfig.qq.enabled = Boolean(parsed.qq?.enabled)
    remoteControlConfig.qq.botId = String(parsed.qq?.botId || '')
    remoteControlConfig.qq.webhook = String(parsed.qq?.webhook || '')

    remoteControlConfig.feishu.enabled = Boolean(parsed.feishu?.enabled)
    remoteControlConfig.feishu.appId = String(parsed.feishu?.appId || '')
    remoteControlConfig.feishu.appSecret = String(parsed.feishu?.appSecret || '')
    remoteControlConfig.feishu.webhook = String(parsed.feishu?.webhook || '')
  } catch (error) {
    console.error('加载远程控制配置失败:', error)
  }
}

function saveRemoteControlConfig() {
  try {
    localStorage.setItem(remoteControlStorageKey, JSON.stringify(remoteControlConfig))
    ElMessage.success(t('controlSaved'))
  } catch (error: any) {
    ElMessage.error(String(error?.message || error || t('saveFailed')))
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function switchNav(nav: NavKey) {
  selectedNav.value = nav
  if (nav === "mcp" && !mcpLoading.value && mcpServers.value.length === 0) {
    void fetchMcpServers()
  }
  if (nav === "skills" && !skillLoading.value && skillMarket.value.length === 0) {
    void fetchSkillMarket(1)
  }
}

function newChat() {
  const newId = `chat-${Date.now()}`
  conversations.value.unshift({
    id: newId,
    title: "新对话",
    messages: [
      {
        role: "assistant",
        text: "欢迎使用AI助手！我可以帮您处理各种任务。"
      }
    ]
  })
  currentConversationId.value = newId
  selectedChatSkillId.value = ""
  chatInput.value = ""
  ElMessage.success(t('newChatCreated'))
}

function openConversationContextMenu(event: MouseEvent, conversationId: string) {
  const menuWidth = 164
  const menuHeight = 84
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const x = Math.min(event.clientX, viewportWidth - menuWidth - 8)
  const y = Math.min(event.clientY, viewportHeight - menuHeight - 8)

  conversationContextMenu.conversationId = conversationId
  conversationContextMenu.x = Math.max(8, x)
  conversationContextMenu.y = Math.max(8, y)
  conversationContextMenu.visible = true
}

function closeConversationContextMenu() {
  conversationContextMenu.visible = false
}

function handleGlobalPointerDown(event: MouseEvent) {
  if (!conversationContextMenu.visible) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.history-context-menu')) return
  closeConversationContextMenu()
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (contextMenuVisible.value) {
    if (event.key === 'Escape') {
      hideContextMenu()
      event.preventDefault()
    }
  }
  if (event.ctrlKey || event.metaKey) {
    if (event.key === 'v' && document.activeElement?.closest('.chat-input-area')) {
      if (chatInputRef.value) {
        event.preventDefault()
        void pasteFromClipboard()
      }
    }
  }
}

function handleGlobalScroll() {
  if (conversationContextMenu.visible) {
    closeConversationContextMenu()
  }
}

function getConversationById(conversationId: string) {
  return conversations.value.find((conv) => conv.id === conversationId) || null
}

function buildConversationPlainText(conversationId: string) {
  const conv = getConversationById(conversationId)
  if (!conv) return ""
  const header = `${conv.title}`
  const body = conv.messages
    .map((msg) => {
      const role = msg.role === "assistant" ? "AI" : "User"
      return `${role}: ${String(msg.text || "")}`
    })
    .join("\n\n")
  return `${header}\n\n${body}`.trim()
}

async function copyConversationHistory() {
  const conversationId = conversationContextMenu.conversationId
  closeConversationContextMenu()
  const content = buildConversationPlainText(conversationId)
  if (!content) return
  await copyMessageText(content, false)
  ElMessage.success(t("historyCopied"))
}

async function deleteConversationHistory() {
  const conversationId = conversationContextMenu.conversationId
  closeConversationContextMenu()

  const targetIndex = conversations.value.findIndex((conv) => conv.id === conversationId)
  if (targetIndex < 0) return

  try {
    await ElMessageBox.confirm(t("historyDeleteConfirm"), t("historyDeleteTitle"), {
      confirmButtonText: t("confirm"),
      cancelButtonText: t("cancel"),
      type: "warning"
    })
  } catch {
    return
  }

  conversations.value.splice(targetIndex, 1)

  if (conversations.value.length === 0) {
    newChat()
  } else if (currentConversationId.value === conversationId) {
    currentConversationId.value = conversations.value[Math.max(0, targetIndex - 1)]?.id || conversations.value[0].id
  }

  ElMessage.success(t("historyDeleted"))
}

function pushMessage(role: string, text: string, meta?: any, options: any = {}) {
  currentConversation.value.messages.push({ role, text, meta, ...options })
  scrollChatToBottom()
}

function serializeConversationsForSave() {
  return conversations.value.map((conv) => ({
    id: conv.id,
    title: conv.title,
    messages: conv.messages.map((msg) => ({
      role: msg.role,
      text: msg.text,
      agentName: msg.agentName,
      meta: msg.meta,
      error: Boolean(msg.error)
    }))
  }))
}

async function saveChatHistoryNow() {
  if (chatHistoryHydrating.value || !chatHistoryReady.value) return

  try {
    await request('/api/chat-history', {
      method: 'PUT',
      body: JSON.stringify({
        conversations: serializeConversationsForSave()
      })
    })
  } catch (error) {
    console.error('保存聊天记录失败:', error)
  }
}

function scheduleSaveChatHistory() {
  if (chatHistoryHydrating.value || !chatHistoryReady.value) return

  if (chatHistorySaveTimer) {
    clearTimeout(chatHistorySaveTimer)
  }

  chatHistorySaveTimer = setTimeout(() => {
    void saveChatHistoryNow()
    chatHistorySaveTimer = null
  }, 800)
}

async function loadChatHistory() {
  chatHistoryHydrating.value = true
  try {
    const response = await request('/api/chat-history') as any
    const storedConversations = response?.data?.conversations

    if (Array.isArray(storedConversations) && storedConversations.length > 0) {
      conversations.value = storedConversations
      const defaultConversation = conversations.value[0]
      currentConversationId.value = defaultConversation?.id || 'default'
    }
  } catch (error) {
    console.error('加载聊天记录失败:', error)
  } finally {
    chatHistoryHydrating.value = false
    chatHistoryReady.value = true
  }
}

async function loadChatStorageConfig() {
  try {
    const response = await request('/api/chat-history/config') as any
    const data = response?.data || {}
    chatStorageConfig.platform = String(data.platform || '')
    chatStorageConfig.defaultUserDataDir = String(data.defaultUserDataDir || '')
    chatStorageConfig.currentUserDataDir = String(data.currentUserDataDir || '')

    if (chatStorageConfig.currentUserDataDir) {
      config.value.settings.userDataDir = chatStorageConfig.currentUserDataDir
    }
  } catch (error) {
    console.error('加载聊天存储配置失败:', error)
  }
}

async function loadTokenStats() {
  try {
    const response = await request('/api/token-stats') as any
    if (response?.ok && response?.data) {
      tokenStats.totalPrompt = response.data.totalPrompt || 0
      tokenStats.totalCompletion = response.data.totalCompletion || 0
      tokenStats.totalTokens = response.data.totalTokens || 0
      tokenStats.byModel = response.data.byModel || {}
    }
  } catch (error) {
    console.error('加载 Token 统计失败:', error)
  }
}

async function saveChatStorageDirectory() {
  try {
    const response = await request('/api/chat-history/config', {
      method: 'PUT',
      body: JSON.stringify({
        userDataDir: chatStorageConfig.currentUserDataDir
      })
    }) as any

    const data = response?.data || {}
    chatStorageConfig.platform = String(data.platform || chatStorageConfig.platform || '')
    chatStorageConfig.defaultUserDataDir = String(data.defaultUserDataDir || chatStorageConfig.defaultUserDataDir || '')
    chatStorageConfig.currentUserDataDir = String(data.currentUserDataDir || chatStorageConfig.currentUserDataDir || '')
    config.value.settings.userDataDir = chatStorageConfig.currentUserDataDir

    ElMessage.success(t('dataDirectorySaved'))

    await loadChatHistory()
  } catch (error: any) {
    ElMessage.error(String(error.message || error))
  }
}

function switchToHistoryConversation(conversationId: string) {
  currentConversationId.value = conversationId
  historyDialogVisible.value = false
}

function stopTypewriter() {
  if (typewriterTimer) {
    clearInterval(typewriterTimer)
    typewriterTimer = null
  }
  typewriterState.messageIndex = -1
  typewriterState.queue = []
  if (typewriterState.resolver) {
    typewriterState.resolver()
    typewriterState.resolver = null
  }
}

function enqueueTypewriter(messageIndex: number, text: string) {
  if (!text) return

  if (typewriterState.messageIndex !== messageIndex) {
    stopTypewriter()
    typewriterState.messageIndex = messageIndex
  }

  typewriterState.queue.push(text)

  if (typewriterTimer) return

  typewriterTimer = setInterval(() => {
    const queueItem = typewriterState.queue[0]
    if (!queueItem) {
      clearInterval(typewriterTimer!)
      typewriterTimer = null
      if (typewriterState.resolver) {
        typewriterState.resolver()
        typewriterState.resolver = null
      }
      return
    }

    const chunk = queueItem.slice(0, 2)
    if (!messages.value[messageIndex]) {
      stopTypewriter()
      return
    }
    messages.value[messageIndex].text += chunk
    typewriterState.queue[0] = queueItem.slice(2)
    if (!typewriterState.queue[0]) {
      typewriterState.queue.shift()
    }
    scrollChatToBottom()
  }, 18)
}

function waitTypewriterDrain(): Promise<void> {
  if (!typewriterState.queue.length && !typewriterTimer) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    typewriterState.resolver = resolve
  })
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBase.value}${normalizedPath}`
}

function getBackendCandidates(): string[] {
  const port = config.value?.settings?.backendPort || 17871
  const candidates = new Set<string>()

  // 开发环境（Vite 代理）优先
  candidates.add('')

  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    candidates.add(window.location.origin)
  }

  const ports = [port, 17871, 17872]
  for (const p of ports) {
    candidates.add(`http://127.0.0.1:${p}`)
    candidates.add(`http://localhost:${p}`)
  }

  return Array.from(candidates)
}

async function detectBackend(): Promise<boolean> {
  for (const candidate of getBackendCandidates()) {
    const url = `${candidate}/api/health`
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      if (data?.ok) {
        apiBase.value = candidate
        return true
      }
    } catch {
      // try next candidate
    }
  }

  return false
}

async function bootstrap() {
  loading.bootstrap = true
  try {
    await checkBackend()
    await loadConfig()
    await checkBackend()
    await loadChatStorageConfig()
    await loadChatHistory()
    // 设置默认聊天模型（使用模型 ID，复用已配置模型）
    const activeModel = config.value?.models?.find(m => m.id === config.value.settings.activeModelId)
    if (activeModel) {
      selectedChatModel.value = activeModel.id
    } else if (config.value.models && config.value.models.length > 0) {
      // 如果没有激活模型，使用第一个已添加模型的 ID
      selectedChatModel.value = config.value.models[0].id
    }
    await loadState()
    await Promise.all([fetchMcpServers(), fetchSkillMarket(1)])
  } finally {
    loading.bootstrap = false
  }
}

async function checkBackend() {
  backendOnline.value = await detectBackend()
}

async function loadConfig() {
  loading.config = true
  try {
    const response = await request("/api/config") as any
    const data = response?.data?.config
    config.value = {
      settings: {
        backendPort: data?.settings?.backendPort ?? 17871,
        theme: data?.settings?.theme ?? "light",
        language: data?.settings?.language ?? "zh-CN",
        activeModelId: data?.settings?.activeModelId ?? "",
        userDataDir: data?.settings?.userDataDir ?? ""
      },
      models: Array.isArray(data?.models) && data.models.length > 0 ? data.models : [],
      skills: Array.isArray(data?.skills) ? data.skills : []
    }
  } catch (error) {
    console.error("加载配置失败:", error)
  } finally {
    loading.config = false
  }
}

async function loadState() {
  try {
    liveState.value = await request("/api/system/state") as LiveState
  } catch (error) {
    console.error("加载状态失败:", error)
  }
}

async function persistConfig(message = t('saveSuccess')) {
  try {
    const response = await request("/api/config", {
      method: "PUT",
      body: JSON.stringify(config.value)
    }) as any
    // 优先使用后端返回的 message，否则使用默认消息
    const displayMessage = response?.message || message || t('saveSuccess')
    ElMessage.success(displayMessage)
  } catch (error: any) {
    ElMessage.error(String(error.message || error || t('saveFailed')))
  }
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

async function sendChat(
  messageOverride?: string,
  modelOverride?: string,
  aiNameOverride?: string,
  aiConfigOverride?: { skillId?: string; prompt?: string; mcpServers?: string[] }
) {
  const message = (messageOverride ?? chatInput.value).trim()
  if (!message) return null

  pushMessage("user", message)
  updateConversationTitleFromMessage(message)
  chatInput.value = ""
  loading.chat = true
  isChatPaused.value = false
  
  // 清空计划列表
  clearPlan()
  
  // 创建 AbortController 用于取消请求
  chatAbortController = new AbortController()

  try {
    // 创建一个临时的 assistant 消息，用于显示打字效果
    const messageIndex = messages.value.length
    messages.value.push({
      role: "assistant",
      text: "",
      typing: true,
      agentName: aiNameOverride || getModelLabelById(modelOverride || selectedChatModel.value) || undefined
    })
    const traceMessage = messages.value[messageIndex]
    ensureMessageTrace(traceMessage)
    
    // 获取对话历史用于上下文
    const conversationHistory = messages.value
      .filter(m => !m.typing && m.text)
      .slice(-20)
      .map(m => ({ role: m.role, text: m.text }))
    
    // 发送聊天请求（流式响应）
    const response = await fetch(buildApiUrl('/api/chat'), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        conversationHistory,
        selectedSkillId: aiConfigOverride?.skillId || selectedChatSkillId.value,
        model: modelOverride || selectedChatModel.value,
        executionMode: chatExecutionMode.value,
        promptInstruction: aiConfigOverride?.prompt || '',
        allowedMcpServers: Array.isArray(aiConfigOverride?.mcpServers) ? aiConfigOverride?.mcpServers : undefined
      }),
      signal: chatAbortController.signal
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    // 处理流式响应
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("无法读取响应流")
    }

    const decoder = new TextDecoder()
    let buffer = ""

    let streamError: string | null = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          let chunk: any
          try {
            chunk = JSON.parse(line.slice(6))
          } catch (e) {
            console.error("解析流数据失败:", e)
            continue
          }

          if (chunk.type === "plan") {
            updatePlan(chunk.plan)
            syncPlanToMessage(traceMessage, chunk.plan)
          } else if (chunk.type === "detail") {
            const detail = chunk.detail || {}
            pushExecutionDetailToMessage(traceMessage, String(detail.stage || 'detail'), String(detail.text || ''), String(detail.time || ''))
          } else if (chunk.type === "mcp") {
            applyMcpEventToMessage(traceMessage, chunk.mcp || {})
          } else if (chunk.type === "confirm") {
            const confirmData = chunk.confirm || {}
            traceMessage.pendingConfirm = {
              server: String(confirmData.server || ''),
              tool: String(confirmData.tool || ''),
              args: confirmData.args && typeof confirmData.args === 'object' ? confirmData.args : {},
              message: String(confirmData.message || ''),
              executing: false
            }
            pushExecutionDetailToMessage(
              traceMessage,
              'confirm',
              String(confirmData.message || `待确认执行：${traceMessage.pendingConfirm.server}/${traceMessage.pendingConfirm.tool}`)
            )
          } else if (chunk.type === "reply") {
            const replyText = String(chunk.reply || "")
            if (!chunk.delta) {
              messages.value[messageIndex].text = ""
            }
            enqueueTypewriter(messageIndex, replyText)
          } else if (chunk.type === "error") {
            streamError = String(chunk.error || "未知流式错误")
            break
          } else if (chunk.type === "done") {
            if (chunk.usage && messages.value[messageIndex]) {
              messages.value[messageIndex].meta = {
                ...messages.value[messageIndex].meta,
                total_tokens: chunk.usage.totalTokens,
                prompt_tokens: chunk.usage.promptTokens,
                completion_tokens: chunk.usage.completionTokens
              }
            }
          }
        }
      }

      if (streamError) break
    }

    if (streamError) {
      throw new Error(streamError)
    }

    await waitTypewriterDrain()
    if (messages.value[messageIndex]) {
      messages.value[messageIndex].typing = false
      return String(messages.value[messageIndex].text || '')
    }
  } catch (error) {
    stopTypewriter()
    const errorMessage = String((error as any).message || error || '')
    const abortedByUser =
      customAiAutoAskStopRequested.value ||
      errorMessage.toLowerCase().includes('abort') ||
      errorMessage.includes('The user aborted a request')

    if (abortedByUser) {
      if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === "assistant" && messages.value[messages.value.length - 1].typing) {
        messages.value[messages.value.length - 1].typing = false
        if (!messages.value[messages.value.length - 1].text) {
          messages.value.pop()
        }
      }
      return null
    }

    if (isChatPaused.value) {
      // 如果是用户主动暂停，不显示错误消息
      if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === "assistant" && messages.value[messages.value.length - 1].typing) {
        messages.value[messages.value.length - 1].text = "对话已暂停"
        messages.value[messages.value.length - 1].typing = false
      }
    } else {
      // 移除临时消息，添加错误消息
      if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === "assistant" && messages.value[messages.value.length - 1].typing) {
        messages.value.pop()
      }
      
      // 检查是否是配置相关的友好提示
      if (errorMessage.includes('ARK_API_KEY') || errorMessage.includes('未配置') || errorMessage.includes('请在 .env 中设置')) {
        // 显示友好的配置提示弹窗
        ElMessageBox.alert(
          '聊天 AI 功能需要配置大模型 API 密钥。\n\n请在 .env 文件中设置 ARK_API_KEY 环境变量，或联系管理员进行配置。',
          '配置提示',
          {
            confirmButtonText: '确定',
            type: 'warning',
            customClass: 'config-alert'
          }
        )
        pushMessage("assistant", "聊天 AI 功能暂不可用，请先配置大模型 API 密钥。")
      } else {
        pushMessage("assistant", `请求失败: ${errorMessage}`, null, { error: true })
      }
    }
    return null
  } finally {
    loading.chat = false
    chatAbortController = null
  }
  return null
}

async function copyMessageText(text: string, showToast = true) {
  const safeText = String(text || '')
  if (!safeText) return
  try {
    await navigator.clipboard.writeText(safeText)
    if (showToast) {
      ElMessage.success(t('copied'))
    }
  } catch {
    const textArea = document.createElement('textarea')
    textArea.value = safeText
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    if (showToast) {
      ElMessage.success(t('copied'))
    }
  }
}

async function resendMessage(text: string) {
  if (loading.chat) return
  await sendChat(text)
}

function rollbackToMessage(index: number) {
  if (loading.chat) return
  if (index < 0 || index >= messages.value.length) return

  const target = messages.value[index]
  currentConversation.value.messages.splice(index + 1)
  clearPlan()
  if (target?.role === 'user') {
    chatInput.value = String(target.text || '')
  }
  ElMessage.success(t('rolledBack'))
}

async function executePendingConfirm(message: any) {
  const pending = message?.pendingConfirm
  if (!pending || pending.executing) return

  pending.executing = true
  try {
    const result = await request('/api/mcp/call', {
      method: 'POST',
      body: JSON.stringify({
        server: pending.server,
        tool: pending.tool,
        args: pending.args || {}
      })
    }) as any

    const text = String(result?.data?.result || '')
    const reply = text || '运行结束，已完成。'
    message.text = [String(message.text || ''), reply].filter(Boolean).join('\n\n')
    pushExecutionDetailToMessage(message, 'confirm', `${pending.server}/${pending.tool} 已手动执行`)
    message.pendingConfirm = null
    ElMessage.success(t('confirmExecuted'))
  } catch (error: any) {
    const errText = String(error?.message || error || '执行失败')
    pushExecutionDetailToMessage(message, 'confirm', `${pending.server}/${pending.tool} 手动执行失败：${errText}`)
    message.text = [String(message.text || ''), `执行失败：${errText}`].filter(Boolean).join('\n\n')
    message.pendingConfirm = null
    ElMessage.error(errText)
  } finally {
    pending.executing = false
  }
}

function cancelPendingConfirm(message: any) {
  const pending = message?.pendingConfirm
  if (!pending) return
  pushExecutionDetailToMessage(message, 'confirm', `${pending.server}/${pending.tool} 已取消执行`)
  message.pendingConfirm = null
  ElMessage.info(t('confirmCanceled'))
}

async function pauseChat() {
  customAiAutoAskStopRequested.value = true
  customAiAutoAskRunning.value = false
  stopTypewriter()
  isChatPaused.value = true
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }
  loading.chat = false
  ElMessage.success("对话已暂停")
}

function handleChatKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault()
    void sendChat()
  }
}

function showContextMenu(event: MouseEvent) {
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

function hideContextMenu() {
  contextMenuVisible.value = false
}

function copySelection() {
  const selection = window.getSelection()
  if (selection && selection.toString()) {
    navigator.clipboard.writeText(selection.toString())
    ElMessage.success('已复制')
  }
  hideContextMenu()
}

function pasteFromClipboard() {
  navigator.clipboard.readText().then(text => {
    const textarea = document.querySelector('.chat-input-area textarea') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = chatInput.value.substring(0, start)
      const after = chatInput.value.substring(end)
      chatInput.value = before + text + after
      nextTick(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length
        textarea.focus()
      })
    } else if (chatInput.value !== undefined) {
      chatInput.value += text
    }
  }).catch(() => {
    ElMessage.error('无法访问剪贴板')
  })
  hideContextMenu()
}

function selectAll() {
  const textarea = document.querySelector('.chat-input-area textarea') as HTMLTextAreaElement
  if (textarea) {
    textarea.select()
  }
  hideContextMenu()
}

function handleAttach() {
  // 附件功能处理逻辑，目前为空实现
  ElMessage.info('附件功能开发中')
}

function openCustomAiAskDialog() {
  if (!availableModels.value.length) {
    ElMessage.warning(t('customAiNoModel'))
    return
  }
  const selectedAi = customAskAiList.value.find(item => item.id === selectedCustomAskAiId.value)
  customAiAskForm.modelId = selectedAi?.modelId || selectedChatModel.value || availableModels.value[0].value
  customAiAskForm.question = ''
  customAiAskForm.aiName = selectedAi?.name || ''
  customAiAskForm.prompt = selectedAi?.prompt || ''
  customAiAskForm.skillId = selectedAi?.skillId || ''
  customAiAskForm.mcpServers = [...(selectedAi?.mcpServers || [])]
  customAiAskForm.autoContinue = true
  customAiAskForm.multiAiLoop = false
  customAiAskDialogVisible.value = true
}

function getAvatarText(name: string) {
  const value = String(name || '').trim()
  if (!value) return 'AI'
  const chars = Array.from(value)
  if (chars.length >= 2) return `${chars[0]}${chars[1]}`.toUpperCase()
  return chars[0].toUpperCase()
}

function addCustomAskAi() {
  if (!customAiAskForm.modelId) {
    ElMessage.warning(t('customAiNoModel'))
    return
  }
  const model = availableModels.value.find(item => item.value === customAiAskForm.modelId)
  if (!model) {
    ElMessage.warning(t('customAiNoModel'))
    return
  }
  const displayName = String(customAiAskForm.aiName || '').trim() || model.label
  const newAi: CustomAskAiItem = {
    id: `ask-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    modelId: customAiAskForm.modelId,
    modelLabel: model.label,
    name: displayName,
    avatarText: getAvatarText(displayName),
    prompt: String(customAiAskForm.prompt || '').trim(),
    skillId: String(customAiAskForm.skillId || '').trim(),
    mcpServers: Array.isArray(customAiAskForm.mcpServers) ? [...customAiAskForm.mcpServers] : []
  }
  customAskAiList.value.push(newAi)
  selectedCustomAskAiId.value = newAi.id
  ElMessage.success(t('customAiAdded'))
}

function removeCustomAskAi(id: string) {
  const index = customAskAiList.value.findIndex(item => item.id === id)
  if (index < 0) return
  customAskAiList.value.splice(index, 1)
  if (selectedCustomAskAiId.value === id) {
    selectedCustomAskAiId.value = customAskAiList.value[0]?.id || ''
  }
  ElMessage.success(t('customAiRemoved'))
}

function selectCustomAskAi(item: CustomAskAiItem) {
  selectedCustomAskAiId.value = item.id
  selectedChatModel.value = item.modelId
  customAiAskForm.modelId = item.modelId
  customAiAskForm.aiName = item.name
  customAiAskForm.prompt = item.prompt
  customAiAskForm.skillId = item.skillId
  customAiAskForm.mcpServers = [...(item.mcpServers || [])]
  selectedChatSkillId.value = item.skillId || ''
  ElMessage.success(`${t('customAiSwitched')}: ${item.name}`)
}

async function submitCustomAiAsk() {
  const question = String(customAiAskForm.question || '').trim()
  if (!question) {
    ElMessage.warning(t('customAiQuestionRequired'))
    return
  }
  if (!customAiAskForm.modelId) {
    ElMessage.warning(t('customAiNoModel'))
    return
  }
  customAiAskDialogVisible.value = false
  const selectedAiById = customAskAiList.value.find(item => item.id === selectedCustomAskAiId.value)
  const selectedAiByModel = customAskAiList.value.find(item => item.modelId === customAiAskForm.modelId)
  const selectedAi = selectedAiById?.modelId === customAiAskForm.modelId ? selectedAiById : selectedAiByModel
  if (!customAiAskForm.autoContinue) {
    await sendChat(question, customAiAskForm.modelId, selectedAi?.name, {
      skillId: selectedAi?.skillId || customAiAskForm.skillId,
      prompt: selectedAi?.prompt || customAiAskForm.prompt,
      mcpServers: selectedAi?.mcpServers || customAiAskForm.mcpServers
    })
    return
  }
  if (customAiAskForm.multiAiLoop && customAskAiList.value.length >= 2) {
    await runCustomAiMultiLoop(question)
    return
  }
  await runCustomAiAutoAsk(question, customAiAskForm.modelId, selectedAi || undefined)
}

async function runCustomAiAutoAsk(initialQuestion: string, modelId: string, selectedAi?: CustomAskAiItem) {
  if (customAiAutoAskRunning.value) {
    ElMessage.warning(t('customAiAutoAsking'))
    return
  }

  customAiAutoAskRunning.value = true
  customAiAutoAskStopRequested.value = false
  customAiAutoAskModelId.value = modelId
  ElMessage.success(t('autoAskStarted'))
  const runtimeAi = selectedAi || customAskAiList.value.find(item => item.modelId === modelId)

  try {
    let nextQuestion = String(initialQuestion || '').trim()
    while (!customAiAutoAskStopRequested.value && nextQuestion) {
      const reply = await sendChat(nextQuestion, modelId, runtimeAi?.name, {
        skillId: runtimeAi?.skillId,
        prompt: runtimeAi?.prompt,
        mcpServers: runtimeAi?.mcpServers
      })
      if (customAiAutoAskStopRequested.value) break
      const normalizedReply = String(reply || '').trim()
      if (!normalizedReply) {
        ElMessage.info(t('autoAskNoReply'))
        break
      }
      // 让 AI 基于上一轮输出继续推进
      nextQuestion = normalizedReply
    }
  } finally {
    const shouldNotifyStopped = !customAiAutoAskStopRequested.value
    customAiAutoAskRunning.value = false
    customAiAutoAskStopRequested.value = false
    customAiAutoAskModelId.value = ''
    if (shouldNotifyStopped) {
      ElMessage.info(t('autoAskStopped'))
    }
  }
}

async function runCustomAiMultiLoop(initialQuestion: string) {
  const askAiList = customAskAiList.value.filter(item => item.modelId)
  if (askAiList.length < 2) {
    await runCustomAiAutoAsk(initialQuestion, customAiAskForm.modelId)
    return
  }
  if (customAiAutoAskRunning.value) {
    ElMessage.warning(t('customAiAutoAsking'))
    return
  }

  customAiAutoAskRunning.value = true
  customAiAutoAskStopRequested.value = false
  ElMessage.success(t('autoAskStarted'))

  try {
    let nextQuestion = String(initialQuestion || '').trim()
    let index = Math.max(0, askAiList.findIndex(item => item.modelId === customAiAskForm.modelId))
    while (!customAiAutoAskStopRequested.value && nextQuestion) {
      const currentAi = askAiList[index % askAiList.length]
      customAiAutoAskModelId.value = currentAi.modelId
      const reply = await sendChat(nextQuestion, currentAi.modelId, currentAi.name, {
        skillId: currentAi.skillId,
        prompt: currentAi.prompt,
        mcpServers: currentAi.mcpServers
      })
      if (customAiAutoAskStopRequested.value) break
      const normalizedReply = String(reply || '').trim()
      if (!normalizedReply) {
        ElMessage.info(t('autoAskNoReply'))
        break
      }
      nextQuestion = normalizedReply
      index += 1
    }
  } finally {
    const shouldNotifyStopped = !customAiAutoAskStopRequested.value
    customAiAutoAskRunning.value = false
    customAiAutoAskStopRequested.value = false
    customAiAutoAskModelId.value = ''
    if (shouldNotifyStopped) {
      ElMessage.info(t('autoAskStopped'))
    }
  }
}

function stopCustomAiAutoAsk() {
  customAiAutoAskStopRequested.value = true
  if (chatAbortController) {
    chatAbortController.abort()
  }
  customAiAutoAskRunning.value = false
  ElMessage.info(t('autoAskStopped'))
}

function slugifySkillName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || 'skill-' + Date.now()
}

// 可用模型列表：只显示已添加模型（值使用 model.id，避免同名冲突）
const availableModels = computed(() => {
  if (!config.value?.models || config.value.models.length === 0) {
    return []
  }
  
  // 返回已添加模型的标识列表（value 使用 id）
  return config.value.models.map(model => ({
    value: model.id,
    label: model.name
  }))
})
const selectedChatModelLabel = computed(() =>
  availableModels.value.find(item => item.value === selectedChatModel.value)?.label || ''
)
const selectedAskAiDisplayName = computed(() =>
  customAskAiList.value.find(item => item.id === selectedCustomAskAiId.value)?.name || selectedChatModelLabel.value
)
const customAiAskSelectedModelLabel = computed(() =>
  availableModels.value.find(item => item.value === customAiAskForm.modelId)?.label || ''
)
const customAiAutoAskModelLabel = computed(() =>
  customAskAiList.value.find(item => item.id === selectedCustomAskAiId.value && item.modelId === customAiAutoAskModelId.value)?.name ||
  customAskAiList.value.find(item => item.modelId === customAiAutoAskModelId.value)?.name ||
  availableModels.value.find(item => item.value === customAiAutoAskModelId.value)?.label || ''
)

const chatExecutionAuto = computed({
  get: () => chatExecutionMode.value === 'auto',
  set: (value: boolean) => {
    chatExecutionMode.value = value ? 'auto' : 'manual'
  }
})

const latestAssistantMessage = computed(() =>
  [...messages.value].reverse().find(msg => msg.role === 'assistant' && !msg.typing)
)

function pickNumberValue(meta: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = meta?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (value && typeof value === 'object') {
      const nested = pickNumberValue(value, keys)
      if (nested !== null) return nested
    }
  }
  return null
}

function pickStringValue(meta: any, keys: string[]): string {
  for (const key of keys) {
    const value = meta?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object') {
      const nested = pickStringValue(value, keys)
      if (nested) return nested
    }
  }
  return ''
}

const monitorExecInfo = computed(() => {
  const message = latestAssistantMessage.value as any
  const meta = message?.meta || {}
  const trace = getMessageTrace(message)

  const tokenNumber = pickNumberValue(meta, ['total_tokens', 'totalTokens', 'tokenCount', 'tokens'])
  const durationMs = pickNumberValue(meta, ['durationMs', 'elapsedMs', 'latencyMs'])
  const durationSeconds = pickNumberValue(meta, ['durationSec', 'durationSeconds', 'elapsedSeconds'])

  const mcpTools = trace
    ? Object.values(trace.mcpRuntime).map(item => item.label).slice(0, 3).join(', ')
    : ''

  const snapshotFromMeta = pickStringValue(meta, ['snapshot', 'snapshotFile', 'screenshot', 'image'])
  const snapshotFromText = pickStringValue({ text: message?.text || '' }, ['snapshot'])
  const snapshot =
    snapshotFromMeta ||
    ((message?.text || '').match(/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)/i)?.[0] || '') ||
    snapshotFromText

  const duration = durationMs !== null
    ? `${(durationMs / 1000).toFixed(1)} s`
    : durationSeconds !== null
      ? `${durationSeconds.toFixed(1)} s`
      : '-'

  return {
    model: message?.agentName || selectedAskAiDisplayName.value || selectedChatModelLabel.value || '-',
    token: tokenNumber !== null ? tokenNumber.toLocaleString() : '-',
    duration,
    mcpTools: mcpTools || '-',
    snapshot: snapshot || '-'
  }
})

const monitorLabels = computed(() => ({
  title: t('monitorTitle'),
  show: t('monitorShow'),
  hide: t('monitorHide'),
  currentExec: t('monitorCurrentExec'),
  model: t('monitorModel'),
  token: t('monitorToken'),
  duration: t('monitorDuration'),
  mcpTools: t('monitorMcpTools'),
  snapshot: t('monitorSnapshot'),
  currentBot: t('monitorCurrentBot'),
  addBot: t('monitorAddBot'),
  autoRun: t('monitorAutoRun')
}))

function getModelLabelById(modelId: string) {
  if (!modelId) return ''
  return availableModels.value.find(item => item.value === modelId)?.label || modelId
}

function toggleMonitorPanel() {
  monitorPanelVisible.value = !monitorPanelVisible.value
}

function syncSelectedChatModelWithConfig() {
  const models = Array.isArray(config.value?.models) ? config.value.models : []
  if (models.length === 0) {
    selectedChatModel.value = ''
    return
  }

  if (selectedChatModel.value && models.some(m => m.id === selectedChatModel.value)) {
    return
  }

  const activeModel = models.find(m => m.id === config.value.settings.activeModelId)
  selectedChatModel.value = activeModel?.id || models[0].id
}

onMounted(() => {
  loadRemoteControlConfig()
  void bootstrap()
  backendPollTimer = setInterval(() => {
    void checkBackend()
    void loadState()
  }, 5000) as unknown as ReturnType<typeof setInterval> | null
  window.addEventListener('pointerdown', handleGlobalPointerDown)
  window.addEventListener('scroll', handleGlobalScroll, true)
  window.addEventListener('resize', handleGlobalScroll)
  window.addEventListener('keydown', handleGlobalKeydown)
})

watch(
  () => [config.value.settings.activeModelId, config.value.models.map(m => m.id).join(',')],
  () => {
    syncSelectedChatModelWithConfig()
    const validModelIds = new Set(config.value.models.map(m => m.id))
    customAskAiList.value = customAskAiList.value.filter(item => validModelIds.has(item.modelId))
    if (!customAskAiList.value.some(item => item.id === selectedCustomAskAiId.value)) {
      selectedCustomAskAiId.value = customAskAiList.value[0]?.id || ''
    }
  }
)

onBeforeUnmount(() => {
  if (backendPollTimer) {
    clearInterval(backendPollTimer)
    backendPollTimer = null
  }
  window.removeEventListener('pointerdown', handleGlobalPointerDown)
  window.removeEventListener('scroll', handleGlobalScroll, true)
  window.removeEventListener('resize', handleGlobalScroll)
})

watch(
  () => conversations.value,
  () => {
    scheduleSaveChatHistory()
  },
  { deep: true }
)

async function request(path: string, options: any = {}) {
  if (!apiBase.value && path.startsWith('/api')) {
    const online = await detectBackend()
    if (!online) {
      throw new Error('后端不可用，请确认服务已启动')
    }
  }

  const response = await fetch(buildApiUrl(path), {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  }).catch((err) => {
    throw new Error(`网络请求失败: ${err.message}`)
  })

  const text = await response.text()
  let data: any = {}
  if (text && text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text.slice(0, 200) || "Invalid JSON response" }
    }
  }
  if (!response.ok) {
    const statusInfo = `HTTP ${response.status} ${response.statusText}`
    throw new Error(data.error || data.reply || statusInfo || "Request failed")
  }
  return data
}
// 模型管理相关功能
const modelDialogVisible = ref(false)
const modelDialogMode = ref('add') // 'add' 或 'edit'
const currentModel = ref<{
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
} | null>(null)

// 提供商图标映射
function getProviderIcon(provider: string) {
  const icons: Record<string, string> = {
    openai: 'O',
    anthropic: 'A',
    google: 'G',
    meta: 'M',
    mistral: 'M',
    openrouter: 'R',
    baidu: 'B',
    aliyun: 'A',
    tencent: 'T',
    bytedance: 'B',
    zhipu: 'Z',
    local: 'L',
    custom: 'C'
  }
  return icons[provider] || '?'
}

// 提供商名称映射
function getProviderName(provider: string) {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    meta: 'Meta',
    mistral: 'Mistral AI',
    openrouter: 'OpenRouter',
    baidu: '百度文心一言',
    aliyun: '阿里云通义千问',
    tencent: '腾讯混元大模型',
    bytedance: '字节跳动豆包',
    zhipu: '智谱AI GLM',
    local: '本地模型',
    custom: '自定义'
  }
  return names[provider] || provider
}

// 激活模型
function activateModel(modelId: string) {
  config.value.settings.activeModelId = modelId
  selectedChatModel.value = modelId
  persistConfig()
  ElMessage.success(t('modelActivated'))
}

// 打开模型对话框
function openModelDialog(mode: 'add' | 'edit', model: any = null) {
  modelDialogMode.value = mode
  if (model) {
    currentModel.value = { ...model }
  } else {
    currentModel.value = {
      id: '',
      name: '',
      provider: 'openai',
      customProviderName: '',
      apiKey: '',
      modelName: '',
      apiBaseUrl: '',
      isBuiltIn: false,
      isActive: true,
      createdAt: '',
      updatedAt: ''
    }
  }
  modelDialogVisible.value = true
}

// 保存模型
function saveModel() {
  if (!currentModel.value) {
    ElMessage.error(t('modelDataEmpty'))
    return
  }
  
  if (!currentModel.value.name.trim()) {
    ElMessage.error(t('enterModelName'))
    return
  }
  
  if (!currentModel.value.modelName.trim()) {
    ElMessage.error(t('enterModelName'))
    return
  }
  
  if (!currentModel.value.apiBaseUrl.trim()) {
    ElMessage.error(t('enterApiBaseUrl'))
    return
  }
  
  if (modelDialogMode.value === 'add') {
    // 添加新模型
    if (currentModel.value) {
      currentModel.value.id = 'model-' + Date.now()
      currentModel.value.createdAt = new Date().toISOString()
      currentModel.value.updatedAt = new Date().toISOString()
      currentModel.value.isBuiltIn = false
      
      if (!config.value.models) {
        config.value.models = []
      }
      config.value.models.push(currentModel.value)
      if (!config.value.settings.activeModelId) {
        config.value.settings.activeModelId = currentModel.value.id
      }
      if (!selectedChatModel.value) {
        selectedChatModel.value = currentModel.value.id
      }
    }
  } else {
    // 编辑现有模型
    if (currentModel.value) {
      const index = config.value.models.findIndex(m => m.id === currentModel.value!.id)
      if (index !== -1) {
        currentModel.value.updatedAt = new Date().toISOString()
        // 保留原有的 isBuiltIn 字段
        currentModel.value.isBuiltIn = config.value.models[index].isBuiltIn
        config.value.models[index] = currentModel.value
      }
    }
  }
  
  persistConfig()
  modelDialogVisible.value = false
}

// 删除模型
function deleteModel(modelId: string) {
  ElMessageBox.confirm(
    t('deleteConfirmMessage'),
    t('confirmDelete'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning',
    }
  ).then(() => {
    config.value.models = config.value.models.filter(m => m.id !== modelId)
    
    // 如果删除的是当前激活的模型，重置激活模型
    if (config.value.settings.activeModelId === modelId) {
      const firstModel = config.value.models[0]
      config.value.settings.activeModelId = firstModel?.id || ''
    }
    if (selectedChatModel.value === modelId) {
      selectedChatModel.value = config.value.models[0]?.id || ''
    }
    
    persistConfig()
    ElMessage.success(t('deleteSuccess'))
  }).catch(() => {
    // 用户取消删除
  })
}

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

.pagination-container {
  display: flex;
  justify-content: center;
  padding: 20px 0;
  margin-top: 10px;
}

/* 模型配置样式 */
.model-config-container {
  padding: 0;
}

/* 简洁的模型列表 */
.model-list-simple {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.model-item:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-fill-color-light);
}

.model-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.model-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.model-icon-small {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--el-color-primary-light-4) 0%, var(--el-color-primary) 100%);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
}

.model-item-info {
  flex: 1;
  min-width: 0;
}

.model-item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.model-item-provider {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.model-item-actions {
  display: flex;
  gap: 8px;
}

.model-item-actions .el-button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 添加模型按钮 */
.model-add-simple {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

.model-add-simple:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

/* 类型标签 */
.type-tag {
  font-size: 11px;
  padding: 2px 6px;
}

.status-tag-inline {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
}

.execution-mode-selector {
  margin-left: 0;
}

.ai-name-tag,
.ai-auto-tag {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-ai-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.custom-ai-avatar-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
}

.custom-ai-avatar-btn:hover {
  border-color: var(--el-color-primary);
}

.custom-ai-avatar-btn.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.custom-ai-avatar-text {
  font-size: 11px;
  font-weight: 600;
}

.custom-ai-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-ai-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 8px 10px;
}

.custom-ai-list-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary-dark-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}

.custom-ai-list-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  line-height: 1.4;
}

.custom-ai-list-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.confirm-card {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color-page);
}

.confirm-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.confirm-tool {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.confirm-args {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.confirm-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.tasks-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px 20px 0;
}

.task-stat-card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 14px;
}

.task-stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.task-stat-value {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-automation-card {
  margin: 14px 20px 20px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
}

.task-automation-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-automation-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.task-automation-actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.control-global-card {
  margin: 14px 20px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 14px;
}

.control-global-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.control-global-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.control-global-row {
  margin-top: 10px;
}

.control-webhook-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  padding: 0 20px;
}

.control-card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.control-footer {
  margin: 14px 20px 20px;
}

.chat-panel.monitor-visible .chat-messages,
.chat-panel.monitor-visible .chat-input-area {
  margin-right: 320px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .task-automation-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .control-webhook-row {
    flex-direction: column;
    align-items: stretch;
  }

  .chat-panel.monitor-visible .chat-messages,
  .chat-panel.monitor-visible .chat-input-area {
    margin-right: 0;
  }
}

/* 输入框右键菜单 */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  padding: 4px 0;
  min-width: 100px;
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.context-menu-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}
</style>
