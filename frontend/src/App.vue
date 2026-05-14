<template>
  <div class="app-container">
    <!-- 启动加载画面 -->
    <div v-if="isInitializing" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-icon">
          <img src="/icons/appIcon.png" alt="Logo" class="loading-logo" />
        </div>
        <div class="loading-text">{{ t('initializing') || '启动中...' }}</div>
        <div class="loading-progress">
          <div class="loading-progress-bar" :style="{ width: initProgress + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 三列布局 -->
    <div class="three-column-layout">
      <!-- 第一列：一级导航 -->
      <aside class="nav-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-header">
          <div class="logo">
            <img class="logo-icon" src="/icons/appIcon.png" alt="Logo" />
            <div class="logo-text" v-if="!sidebarCollapsed">
              <h1>{{ t('appTitle') }}</h1>
            </div>
          </div>
          <el-button :icon="Fold" circle plain @click="toggleSidebar" :title="sidebarCollapsed ? t('sidebarExpand') : t('sidebarFold')"></el-button>
        </div>
        
        <nav class="sidebar-nav">
          <div
            v-for="item in navigationItems"
            :key="item.id"
            class="nav-item"
            :class="{ active: selectedNav === item.id }"
            @click="switchNav(item.id)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span v-if="!sidebarCollapsed">{{ t(item.labelKey) }}</span>
          </div>
        </nav>
      </aside>

      <!-- 第二列：代理列表和记录 -->
      <aside class="agent-sidebar" v-if="selectedNav === 'chat'">
        <div class="agent-sidebar-header">
          <span class="agent-sidebar-title">{{ t('navAgents') }}</span>
          <el-button :icon="Plus" size="small" plain @click="newChat">
            <span>{{ t('newChat') }}</span>
          </el-button>
        </div>
        
        <div class="agent-list">
          <div
            v-for="agent in agents"
            :key="agent.id"
            class="agent-item"
            :class="{ active: selectedAgentId === agent.id, expanded: expandedAgents.includes(agent.id) }"
            @click="toggleAgent(agent.id)"
          >
            <div class="agent-header">
              <span class="agent-icon">{{ agent.avatar }}</span>
              <span class="agent-name">{{ agent.name }}</span>
              <el-icon class="agent-expand-icon"><ArrowRight /></el-icon>
            </div>
            <div class="agent-history" v-if="expandedAgents.includes(agent.id)">
              <div
                v-for="conv in getAgentConversations(agent.id)"
                :key="conv.id"
                class="agent-history-item"
                :class="{ active: currentConversationId === conv.id, 'remote-control': conv.id.startsWith('remote-') }"
                @click.stop="currentConversationId = conv.id"
                @contextmenu.prevent="showConversationMenu($event, conv)"
              >
                <el-icon v-if="conv.id.startsWith('remote-')" class="remote-icon"><Cellphone /></el-icon>
                <el-icon v-else><ChatLineRound /></el-icon>
                <span class="history-title">{{ conv.title }}</span>
                <el-button class="context-menu-trigger" :icon="More" size="mini" @click.stop="showConversationMenu($event, conv)"></el-button>
              </div>
              <div v-if="getAgentConversations(agent.id).length === 0" class="agent-history-empty">
                {{ t('noConversation') }}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 第三列：主内容区域 -->
      <main class="main-content">
        <!-- 顶部工具栏 -->
        <div class="main-toolbar">
          <div class="toolbar-left">
            <!-- 标题已移除 -->
          </div>
          <div class="toolbar-right">
            <div class="toolbar-actions">
              <button
                class="monitor-toggle-btn"
                type="button"
                @click="toggleMonitorPanel"
              >
                {{ monitorPanelVisible ? t('monitorHide') : t('monitorShow') }}
              </button>
              <el-button class="office-entry-btn" plain @click="openOffice3d">
                3D代理办公室
              </el-button>
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

        <!-- 聊天面板 (含文件编辑器) -->
        <div class="chat-panel" v-if="selectedNav === 'chat'" :class="{ 'monitor-visible': monitorPanelVisible, 'editor-open': fileEditorVisible }">
          <div class="chat-panel-main">
            <!-- 聊天消息区域 -->
            <div class="chat-messages" ref="chatMessagesRef" @click="handleChatClick">
            <div
              v-for="(message, index) in messages"
              :key="`${message.role}-${index}`"
              class="message-container"
              :class="[message.role, { error: message.error }]"
            >
              <!-- ===== USER 消息 ===== -->
              <div v-if="message.role === 'user'" class="message-content">
                <div
                  class="message-bubble user"
                  @contextmenu.prevent="showMessageContextMenu($event, message.text)"
                >
                  <div class="message-text" v-html="renderMessageText(message.text)"></div>
                  <div v-if="message.meta?.attachments?.length" class="msg-image-attachments">
                    <template v-for="(att, i) in message.meta.attachments" :key="i">
                      <img v-if="att.dataUrl" :src="att.dataUrl" :alt="att.name" class="msg-image-thumb" />
                      <span v-else class="msg-file-chip">📎 {{ att.name }}</span>
                    </template>
                  </div>
                </div>
                <div v-if="!message.typing" class="message-actions user">
                  <el-tooltip :content="t('resendMessage')" placement="bottom">
                    <el-button text size="small" class="message-action-btn" :disabled="loading.chat" @click="resendMessage(message.text)">
                      <el-icon><RefreshRight /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip :content="t('copyMessage')" placement="bottom">
                    <el-button text size="small" class="message-action-btn" @click="copyMessageText(message.text)">
                      <el-icon><CopyDocument /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip :content="t('rollbackMessage')" placement="bottom">
                    <el-button text size="small" class="message-action-btn" :disabled="loading.chat" @click="rollbackToMessage(index)">
                      <el-icon><ArrowLeftBold /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </div>

              <!-- ===== ASSISTANT 消息卡片 ===== -->
              <div v-else class="message-content ai-result-card-wrap">
                <div class="ai-result-card" :class="{ typing: message.typing, error: message.error }">

                  <!-- 工具使用过程（时间线风格）- 放在回复文本前面 -->
                  <div
                    v-if="groupedTraceDetails(message).length > 0 || (message.typing && traceRunningCalls(message).length > 0)"
                    class="ai-result-trace"
                  >
                    <div
                      class="ai-result-trace-header"
                      @click="toggleTraceInline(message)"
                    >
                      <span class="ai-result-trace-icon">
                        <el-icon style="font-size:16px;color:#6366f1"><Tools /></el-icon>
                      </span>
                      <span class="ai-result-trace-label">执行记录</span>
                      <span class="ai-result-trace-count" v-if="groupedTraceDetails(message).length > 0">
                        {{ groupedTraceDetails(message).reduce((n, g) => n + g.items.length, 0) }} 步
                      </span>
                      <el-icon class="ai-result-trace-arrow" :class="{ expanded: !message.meta?.traceCollapsed }">
                        <ArrowDown />
                      </el-icon>
                    </div>
                    <div v-if="!message.meta?.traceCollapsed" class="ai-result-trace-body">
                      <!-- 正在运行的工具 -->
                      <div
                        v-if="message.typing && traceRunningCalls(message).length > 0"
                        class="ai-trace-running"
                      >
                        <div class="ai-trace-running-icon">
                          <el-icon style="font-size:17px;color:#6366f1"><LoadingIcon /></el-icon>
                        </div>
                        <span class="ai-trace-running-label">{{ traceRunningCalls(message)[0] }}</span>
                        <span class="ai-trace-running-badge">
                          <el-icon style="font-size:12px"><LoadingIcon /></el-icon>
                          调用中
                        </span>
                      </div>
                      <!-- 时间线节点列表 -->
                      <div class="ai-trace-timeline">
                        <template v-for="group in groupedTraceDetails(message)" :key="group.key">
                          <div
                            v-for="(item, idx) in group.items"
                            :key="`${item.time}-${idx}`"
                            class="ai-trace-node"
                            :class="getNodeStatusClass(item)"
                          >
                            <div class="ai-trace-node-content">
                              <span class="ai-trace-tool-icon">
                                <el-icon style="font-size:17px"><component :is="getToolIconComponent(item)" /></el-icon>
                              </span>
                              <span class="ai-trace-node-label" v-html="renderTraceNodeLabel(item.text)"></span>
                              <span class="ai-trace-tool-tag">{{ group.key }}</span>
                              <span v-if="item.time && !item.time.startsWith('plan-')" class="ai-trace-node-time">{{ formatTraceTime(item.time) }}</span>
                              <span class="ai-trace-node-status">
                                <el-icon v-if="isStepSuccess(item)" color="#10b981"><CircleCheckFilled /></el-icon>
                                <el-icon v-else-if="isStepError(item)" color="#ef4444"><WarningFilled /></el-icon>
                                <el-icon v-else color="#94a3b8" style="opacity:0.3"><CircleCheckFilled /></el-icon>
                              </span>
                            </div>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- 正文回复区 -->
                  <div
                    v-if="message.text && message.text.trim()"
                    class="ai-result-body"
                    @contextmenu.prevent="showMessageContextMenu($event, message.text)"
                  >
                    <div class="message-text" v-html="renderMessageText(message.text)"></div>
                    <span v-if="message.typing" class="print-cursor">|</span>
                  </div>
                  <div v-else-if="message.typing && !message.text" class="ai-result-body ai-result-body--thinking">
                    <span class="typing-indicator" aria-label="AI 正在思考">
                      <span class="typing-dot"></span>
                      <span class="typing-dot"></span>
                      <span class="typing-dot"></span>
                    </span>
                    <span class="trace-status-sub">{{ tracePanelSubtitle(message) }}</span>
                  </div>

                  <!-- 确认操作卡 -->
                  <div v-if="message.pendingConfirm" class="confirm-card">
                    <div class="confirm-title">{{ t('confirmActionTitle') }}</div>
                    <div class="confirm-tool">{{ message.pendingConfirm.server }}/{{ message.pendingConfirm.tool }}</div>
                    <div class="confirm-args"><code>{{ JSON.stringify(message.pendingConfirm.args || {}) }}</code></div>
                    <div class="confirm-actions">
                      <el-button size="small" type="primary" :loading="message.pendingConfirm.executing" @click="executePendingConfirm(message)">{{ t('confirmExecute') }}</el-button>
                      <el-button size="small" :disabled="message.pendingConfirm.executing" @click="cancelPendingConfirm(message)">{{ t('confirmCancel') }}</el-button>
                    </div>
                  </div>

                  <!-- 卡片底部操作栏 -->
                  <div v-if="!message.typing" class="ai-result-footer">
                    <div class="ai-result-footer-actions">
                      <el-tooltip content="复制结果" placement="top">
                        <button class="ai-footer-btn" @click="copyMessageText(message.text)">
                          <el-icon><CopyDocument /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip :content="message.isReading ? '停止朗读' : '朗读'" placement="top">
                        <button class="ai-footer-btn" :class="{ 'is-reading': message.isReading }" @click="toggleReadAloud(message)">
                          <el-icon><VideoPause v-if="message.isReading" /><Bell v-else /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip :content="t('rollbackMessage')" placement="top">
                        <button class="ai-footer-btn" @click="rollbackToMessage(index)">
                          <el-icon><ArrowLeftBold /></el-icon>
                        </button>
                      </el-tooltip>
                    </div>
                  </div>

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

            <!-- 新设计的输入表单 -->
            <div class="task-input-container">
              <div class="input-form" :class="{ 'is-focused': isInputFocused }">
                <textarea
                  ref="chatInputRef"
                  v-model="chatInput"
                  class="main-input"
                  :disabled="isRemoteAgentConversation"
                  :placeholder="isRemoteAgentConversation ? '🤖 CraBot 远程代理对话，请通过微信/Telegram 发送指令' : (supportsVision ? t('inputPlaceholder') + '（支持 Ctrl+V 粘贴图片）' : t('inputPlaceholder'))"
                  @keydown="handleChatKeydown"
                  @paste="handlePaste"
                  @focus="isInputFocused = true"
                  @blur="isInputFocused = false"
                  @contextmenu.prevent="showContextMenu"
                ></textarea>

                <!-- 附件预览区 -->
                <div v-if="pendingAttachments.length > 0" class="attachment-preview-list">
                  <div
                    v-for="(att, idx) in pendingAttachments"
                    :key="idx"
                    class="attachment-chip"
                  >
                    <img v-if="att.type.startsWith('image/')" :src="att.dataUrl" class="attachment-thumb" />
                    <div v-else class="attachment-icon">📄</div>
                    <div class="attachment-info">
                      <span class="attachment-name">{{ att.name }}</span>
                      <span class="attachment-size">{{ formatFileSize(att.size) }}</span>
                    </div>
                    <button class="attachment-remove" @click="removeAttachment(idx)">×</button>
                  </div>
                </div>

                <div class="input-options">
                  <div class="option-group">
                    <el-popover
                      v-model:visible="modelSelectorVisible"
                      placement="top-start"
                      :width="200"
                      trigger="click"
                      popper-class="model-selector-popover"
                    >
                      <template #reference>
                        <button class="option-btn">
                          <span class="option-text">{{ selectedChatModelLabel || '默认大模型' }}</span>
                          <el-icon class="option-arrow"><ArrowDown /></el-icon>
                        </button>
                      </template>
                      <div class="model-selector-list">
                        <div
                          v-for="model in availableModels"
                          :key="model.value"
                          class="model-selector-item"
                          :class="{ active: model.value === selectedChatModel }"
                          @click="selectChatModel(model.value)"
                        >
                          <span class="model-selector-name">{{ model.label }}</span>
                          <el-icon v-if="model.value === selectedChatModel" class="model-selector-check"><Check /></el-icon>
                        </div>
                        <div v-if="availableModels.length === 0" class="model-selector-empty">
                          请先在设置中添加大模型
                        </div>
                        <div class="model-selector-divider"></div>
                        <div class="model-selector-add" @click="openModelFromSelector">
                          <el-icon><Plus /></el-icon>
                          <span>添加自定义大模型</span>
                        </div>
                      </div>
                    </el-popover>
                    <button class="option-btn" @click="openSkillsDialog">
                      <span class="option-text">{{ selectedSkillName }}</span>
                      <el-icon class="option-arrow"><ArrowDown /></el-icon>
                    </button>
                    <button class="option-btn" @click="openInspirationDialog">
                      <span class="option-text">虾灵感</span>
                      <el-icon class="option-arrow"><ArrowDown /></el-icon>
                    </button>
                  </div>
                  <div class="input-actions">
                    <el-button
                      link
                      :icon="Microphone"
                      @click="handleVoiceInput"
                      class="action-btn"
                      :class="{ 'voice-active': voiceInput.isRecording.value }"
                      :title="voiceInput.isRecording.value ? '停止录音' : '语音输入'"
                    />
                    <el-button
                      link
                      :icon="Paperclip"
                      @click="handleAttach"
                      class="action-btn"
                      :title="t('attach')"
                    />
                    <!-- 发送按钮移到用户头像位置 -->
                    <button 
                      v-if="loading.chat"
                      class="user-avatar-btn send-btn"
                      @click="pauseChat"
                      title="停止"
                    >
                      <el-icon><CloseBold /></el-icon>
                    </button>
                    <button
                      v-else
                      class="user-avatar-btn send-btn"
                      :class="{ 'send-disabled': !chatInput.trim() || isRemoteAgentConversation }"
                      :disabled="isRemoteAgentConversation"
                      @click="() => sendChat()"
                      :title="t('sendMessage')"
                    >
                      <el-icon><Promotion /></el-icon>
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- 状态栏 -->
              <div class="send-controls">
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
        <FileEditor
          :visible="fileEditorVisible"
          :file-path="fileEditorPath"
          @close="closeFileEditor"
        />
      </div>

      <!-- 代理仪表盘面板 -->
        <div class="agents-panel" v-if="selectedNav === 'agents'">
          <AgentDashboard />
        </div>

        <!-- 流水线面板 -->
        <div class="agents-panel" v-if="selectedNav === 'pipeline'">
          <PipelineDashboard />
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

        <!-- 任务面板 -->
        <div class="settings-panel tasks-settings-panel" v-if="selectedNav === 'tasks'">
          <div class="panel-header">
            <div class="panel-header-left">
              <h3>{{ t('taskPanelTitle') }}</h3>
              <p class="panel-desc">{{ t('taskPanelDesc') }}</p>
            </div>
            <el-button size="small" @click="loadScheduledTasks">{{ t('refresh') }}</el-button>
          </div>

          <!-- 定时任务列表 -->
          <div class="scheduled-tasks-section">
            <h4>{{ t('scheduledTasksTitle') }}</h4>
            <div v-if="scheduledTasksLoading" class="tasks-loading">
              <el-icon class="is-loading"><LoadingIcon /></el-icon> {{ t('loading') }}
            </div>
            <div v-else-if="scheduledTasks.length === 0" class="tasks-empty">
              {{ t('scheduledTasksEmpty') }}
            </div>
            <div v-else class="scheduled-task-list">
              <div v-for="task in scheduledTasks" :key="task.id" class="scheduled-task-card">
                <div class="scheduled-task-header">
                  <span class="scheduled-task-name">{{ task.name }}</span>
                  <el-tag :type="task.enabled ? 'success' : 'info'" size="small">
                    {{ task.enabled ? t('enabled') : t('disabled') }}
                  </el-tag>
                </div>
                <div class="scheduled-task-info">
                  <div class="scheduled-task-row">
                    <span class="scheduled-task-label">{{ t('taskInterval') }}:</span>
                    <span>{{ formatInterval(task.intervalMs) }}</span>
                  </div>
                  <div class="scheduled-task-row">
                    <span class="scheduled-task-label">{{ t('taskLastRun') }}:</span>
                    <span>{{ formatTime(task.lastRun) }}</span>
                  </div>
                  <div class="scheduled-task-row">
                    <span class="scheduled-task-label">{{ t('taskNextRun') }}:</span>
                    <span>{{ formatTime(task.nextRun) }}</span>
                  </div>
                  <div class="scheduled-task-row">
                    <span class="scheduled-task-label">{{ t('taskTool') }}:</span>
                    <span class="scheduled-task-tool">{{ task.toolName }}</span>
                  </div>
                </div>
                <div class="scheduled-task-actions">
                  <el-button size="small" @click="viewTaskLogs(task.id)">
                    {{ selectedTaskId === task.id ? t('close') : t('viewLogs') }}
                  </el-button>
                  <el-button size="small" @click="editScheduledTask(task)">
                    {{ t('edit') }}
                  </el-button>
                  <el-switch
                    :model-value="task.enabled"
                    @change="(val: boolean) => toggleScheduledTask(task.id, val)"
                    :disabled="false"
                  />
                  <el-button size="small" type="danger" @click="deleteScheduledTask(task.id)">
                    {{ t('delete') }}
                  </el-button>
                </div>

                <div v-if="selectedTaskId === task.id" class="task-logs-section task-logs-inline">
                  <div class="logs-header">
                    <h4>{{ t('taskLogsTitle') }}</h4>
                    <div class="logs-header-actions">
                      <el-button
                        size="small"
                        :disabled="taskLogsLoading || taskLogs.length === 0"
                        @click="copyAllTaskLogs"
                      >
                        {{ t('taskLogsCopyAll') }}
                      </el-button>
                      <el-button
                        size="small"
                        type="danger"
                        plain
                        :disabled="taskLogsLoading || taskLogs.length === 0"
                        @click="clearTaskLogs"
                      >
                        {{ t('taskLogsClear') }}
                      </el-button>
                    </div>
                  </div>
                  <div v-if="taskLogsLoading" class="tasks-loading">
                    <el-icon class="is-loading"><LoadingIcon /></el-icon> {{ t('loading') }}
                  </div>
                  <div v-else-if="taskLogs.length === 0" class="tasks-empty">
                    {{ t('taskLogsEmpty') }}
                  </div>
                  <div v-else class="task-log-list">
                    <div v-for="log in taskLogs" :key="log.id" class="task-log-item" :class="'log-' + log.status">
                      <div class="task-log-header">
                        <el-tag :type="log.status === 'success' ? 'success' : 'danger'" size="small">
                          {{ log.status === 'success' ? t('success') : t('failed') }}
                        </el-tag>
                        <span class="task-log-time">{{ formatTime(log.executedAt) }}</span>
                        <el-button text size="small" @click="copyTaskLog(log)">{{ t('copyMessage') }}</el-button>
                      </div>
                      <div v-if="log.result" class="task-log-result">{{ log.result }}</div>
                      <div v-if="log.error" class="task-log-error">{{ log.error }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 编辑任务对话框 -->
          <el-dialog v-model="editingTask" :title="t('editTask')" width="500px" v-if="editingTask">
            <el-form label-width="100px">
              <el-form-item :label="t('taskName')">
                <el-input v-model="editingTask.name" />
              </el-form-item>
              <el-form-item :label="t('taskInterval')">
                <el-input-number v-model="editingTask.intervalMs" :min="1000" :step="1000" />
                <span style="margin-left: 8px">ms</span>
              </el-form-item>
              <el-form-item :label="t('taskTool')">
                <el-input v-model="editingTask.toolName" />
              </el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="cancelEditTask">{{ t('cancel') }}</el-button>
              <el-button type="primary" @click="saveScheduledTask">{{ t('save') }}</el-button>
            </template>
          </el-dialog>

          <!-- 执行计划概览 -->
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
              <el-input :model-value="remoteControlWebhookUrl" readonly>
                <template #prepend>{{ t('controlWebhookUrl') }}</template>
              </el-input>
              <el-button size="small" @click="copyMessageText(remoteControlWebhookUrl)">{{ t('copyMessage') }}</el-button>
            </div>
          </div>

          <el-tabs type="border-card" class="platform-tabs">
            <el-tab-pane name="telegram">
              <template #label>
                <span class="platform-tab-label">
                  <span>{{ t('controlChannelTelegram') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.telegram.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlBotToken')">
                    <el-input v-model="remoteControlConfig.telegram.botToken" type="password" show-password />
                  </el-form-item>
                  <el-form-item :label="t('controlChatId')">
                    <el-input v-model="remoteControlConfig.telegram.chatId" />
                  </el-form-item>
                  <el-form-item :label="t('controlTestMessage')">
                    <el-input v-model="telegramTestMessage" :placeholder="t('controlTestMessagePlaceholder') || '输入测试消息内容'" />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="sendTestToTelegram" :loading="sendingToTelegram">
                      {{ t('controlSendTest') || '发送测试' }}
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="qq">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon qq-icon">Q</span>
                  <span>{{ t('controlChannelQq') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.qq.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlBotId')">
                    <el-input v-model="remoteControlConfig.qq.botId" />
                  </el-form-item>
                  <el-form-item :label="t('controlWebhook')">
                    <el-input v-model="remoteControlConfig.qq.webhook" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="wechat">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon wechat-icon">微</span>
                  <span>{{ t('controlChannelWechat') || '企业微信' }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.wechat.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlWebhook')">
                    <el-input v-model="remoteControlConfig.wechat.webhook" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="wechat-personal">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon wechat-personal-icon">信</span>
                  <span>{{ '个人微信' }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="wechat-personal-login-section">
                  <div v-if="wechatAccounts.length === 0" class="wechat-personal-empty">
                    <p style="color:#94a3b8;margin-bottom:16px;">扫码登录个人微信，接收消息并控制 Agent</p>
                    <el-button type="primary" size="large" @click="startWechatLogin" :loading="wechatLoginLoading">
                      扫码登录微信
                    </el-button>
                  </div>

                  <div v-if="wechatQrCodeUrl" class="wechat-personal-qrcode">
                    <img :src="wechatQrCodeUrl" alt="微信登录二维码" style="width:200px;height:200px;border:1px solid #e2e8f0;border-radius:8px;" />
                    <p style="color:#94a3b8;font-size:13px;margin-top:8px;">请用微信扫码登录</p>
                    <p v-if="wechatLoginStatus === 'waiting'" style="color:#f59e0b;font-size:12px;">
                      <el-icon style="font-size:12px"><LoadingIcon /></el-icon> 等待扫码...
                    </p>
                    <p v-else-if="wechatLoginStatus === 'success'" style="color:#10b981;font-size:12px;">登录成功</p>
                    <el-button size="small" @click="cancelWechatLogin" style="margin-top:8px;">取消</el-button>
                  </div>

                  <div v-if="wechatAccounts.length > 0" class="wechat-personal-accounts">
                    <div class="wechat-personal-accounts-header">
                      <span>已登录账号 ({{ wechatAccounts.length }})</span>
                      <el-button size="small" type="primary" plain @click="startWechatLogin" :loading="wechatLoginLoading">添加账号</el-button>
                    </div>
                    <div v-for="acc in wechatAccounts" :key="acc.wxid" class="wechat-personal-account-item">
                      <div class="wechat-personal-account-info">
                        <span class="wechat-personal-account-nickname">{{ acc.nickname }}</span>
                        <span class="wechat-personal-account-wxid">{{ acc.wxid }}</span>
                      </div>
                      <el-button size="small" type="danger" plain @click="logoutWechatAccount(acc.wxid)">登出</el-button>
                    </div>
                  </div>
                </div>

                <el-divider />

                <div v-if="wechatAccounts.length > 0" class="wechat-received-section">
                  <div class="wechat-received-header">
                    <span>接收的消息</span>
                    <el-button size="small" @click="fetchWechatStatus" :disabled="wechatMessages.length === 0">
                      <el-icon style="font-size:12px"><Refresh /></el-icon> 刷新
                    </el-button>
                  </div>
                  <div v-if="wechatMessages.length === 0" class="wechat-received-empty">
                    <p style="color:#94a3b8;font-size:13px;">暂无消息，请在手机上给 bot 发消息测试</p>
                  </div>
                  <div v-else class="wechat-received-list">
                    <div v-for="(msg, i) in wechatMessages.slice().reverse()" :key="i" class="wechat-received-item">
                      <div class="wechat-received-item-header">
                        <span class="wechat-received-sender">{{ msg.senderName || msg.sender }}</span>
                        <span class="wechat-received-time">{{ formatWechatTime(msg.timestamp) }}</span>
                      </div>
                      <div class="wechat-received-text">{{ msg.text }}</div>
                    </div>
                  </div>
                </div>

                <el-divider />

                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlTestMessage')">
                    <el-input v-model="wechatTestMessage" :placeholder="t('controlTestMessagePlaceholder') || '输入要发送给自己的消息'" />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="sendTestToWechat" :loading="wechatSending" :disabled="wechatAccounts.length === 0">
                      {{ t('controlSendTest') || '发送测试' }}
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="feishu">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon feishu-icon">飞</span>
                  <span>{{ t('controlChannelFeishu') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.feishu.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlAppId')">
                    <el-input v-model="remoteControlConfig.feishu.appId" />
                  </el-form-item>
                  <el-form-item :label="t('controlAppSecret')">
                    <el-input v-model="remoteControlConfig.feishu.appSecret" type="password" show-password />
                  </el-form-item>
                  <el-form-item :label="t('controlWebhook')">
                    <el-input v-model="remoteControlConfig.feishu.webhook" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="discord">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon discord-icon">D</span>
                  <span>{{ t('controlChannelDiscord') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.discord.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlBotToken')">
                    <el-input v-model="remoteControlConfig.discord.botToken" type="password" show-password />
                  </el-form-item>
                  <el-form-item :label="t('controlChannelId')">
                    <el-input v-model="remoteControlConfig.discord.channelId" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="slack">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon slack-icon">S</span>
                  <span>{{ t('controlChannelSlack') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.slack.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlBotToken')">
                    <el-input v-model="remoteControlConfig.slack.botToken" type="password" show-password />
                  </el-form-item>
                  <el-form-item :label="t('controlChannelId')">
                    <el-input v-model="remoteControlConfig.slack.channelId" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="teams">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon teams-icon">T</span>
                  <span>{{ t('controlChannelTeams') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.teams.enabled" />
                </div>
                <el-form label-width="100px" label-position="left">
                  <el-form-item :label="t('controlAppId')">
                    <el-input v-model="remoteControlConfig.teams.appId" />
                  </el-form-item>
                  <el-form-item :label="t('controlAppSecret')">
                    <el-input v-model="remoteControlConfig.teams.appSecret" type="password" show-password />
                  </el-form-item>
                  <el-form-item :label="t('controlWebhook')">
                    <el-input v-model="remoteControlConfig.teams.webhook" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane name="whatsapp">
              <template #label>
                <span class="platform-tab-label">
                  <span class="platform-icon whatsapp-icon">W</span>
                  <span>{{ t('controlChannelWhatsApp') }}</span>
                </span>
              </template>
              <div class="platform-config">
                <div class="platform-enable-row">
                  <span>{{ t('controlEnable') }}</span>
                  <el-switch v-model="remoteControlConfig.whatsapp.enabled" />
                </div>
                <el-form label-width="120px" label-position="left">
                  <el-form-item :label="t('controlTwilioSid')">
                    <el-input v-model="remoteControlConfig.whatsapp.accountSid" />
                  </el-form-item>
                  <el-form-item :label="t('controlTwilioToken')">
                    <el-input v-model="remoteControlConfig.whatsapp.authToken" type="password" show-password />
                  </el-form-item>
                  <el-form-item :label="t('controlFromNumber')">
                    <el-input v-model="remoteControlConfig.whatsapp.fromNumber" placeholder="+1234567890" />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>
          </el-tabs>

          <div class="control-footer">
            <el-button type="primary" size="large" @click="saveRemoteControlConfig">{{ t('controlSave') }}</el-button>
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
              <el-form-item :label="t('skillsDir')">
                <el-input v-model="config.settings.skillsDir" :placeholder="t('skillsDirPlaceholder')" />
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
                      <div class="model-item-info">
                        <div class="model-item-name">
                          {{ model.name }}
                          <el-tag v-if="model.isBuiltIn" type="info" size="small" effect="plain" class="type-tag">
                            {{ t('builtIn') }}
                          </el-tag>
                          <el-tag v-if="model.id === config.settings.activeModelId" size="small" effect="plain" class="status-tag-inline">
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

            <el-tab-pane label="关于" name="about">
              <div class="about-container">
                <div class="about-logo">
                  <img class="logo-icon" style="width: 60px; height: 60px;" src="/icons/appIcon.png" alt="Logo" />
                  <h2>{{ t('appTitle') }}</h2>
                </div>
                <div class="about-version">版本 v1.0.0</div>
                <div class="about-desc">一个智能桌面助手，帮助你完成各种任务</div>
                <el-divider />
                <div class="about-actions">
                  <el-button type="primary" @click="checkForUpdate">检查更新</el-button>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>

          <el-divider />
        </div>
      </main>
    </div>

    <!-- 对话右键菜单 -->
    <Teleport to="body">
      <div 
        v-if="conversationMenuVisible" 
        class="conversation-context-menu"
        :style="{ left: conversationMenuPosition.x + 'px', top: conversationMenuPosition.y + 'px' }"
        @click.self="conversationMenuVisible = false"
      >
        <div class="context-menu-item" @click="renameConv">
          <el-icon><EditPen /></el-icon>
          <span>{{ t('rename') }}</span>
        </div>
        <div class="context-menu-item" @click="clearConv">
          <el-icon><Delete /></el-icon>
          <span>{{ t('clearMessages') }}</span>
        </div>
        <div class="context-menu-item danger" @click="deleteConv">
          <el-icon><Delete /></el-icon>
          <span>{{ t('delete') }}</span>
        </div>
      </div>
    </Teleport>

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

    <el-dialog
      v-model="office3dVisible"
      width="92%"
      top="4vh"
      destroy-on-close
    >
      <template #header>
        <div class="office-dialog-header">
          <span>3D代理办公室</span>
          <el-button size="small" @click="loadOfficeAgents">刷新</el-button>
        </div>
      </template>
      <AgentOffice3D :agents="officeAgents" />
    </el-dialog>

    <!-- 输入框/消息右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :class="{ 'context-menu-active': contextMenuTargetText }"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <template v-if="contextMenuTargetText">
          <button type="button" class="context-menu-item" @click="copyMessageContent()">
            复制
          </button>
          <button type="button" class="context-menu-item" @click="pasteToInput()">
            粘贴
          </button>
          <button type="button" class="context-menu-item" @click="selectMessageAll()">
            全选
          </button>
        </template>
        <template v-else>
          <button type="button" class="context-menu-item" @click="copySelection()">
            复制
          </button>
          <button type="button" class="context-menu-item" @click="pasteFromClipboard()">
            粘贴
          </button>
          <button type="button" class="context-menu-item" @click="selectAll()">
            全选
          </button>
        </template>
      </div>
    </Teleport>

    <!-- 微信消息面板 -->
    <div v-if="wechatMessages.length > 0" class="wechat-msg-panel" :class="{ collapsed: !wechatPanelOpen }">
      <div class="wechat-msg-header">
        <span class="wechat-msg-header-label">
          <el-icon style="font-size:14px;margin-right:4px;color:#6366f1"><ChatLineRound /></el-icon>
          微信消息
          <span class="wechat-msg-badge">{{ wechatMessages.length }}</span>
        </span>
        <div class="wechat-msg-header-actions">
          <button class="wechat-msg-btn" @click="wechatPanelOpen = !wechatPanelOpen" :title="wechatPanelOpen ? '收起' : '展开'">
            <el-icon><ArrowDown v-if="wechatPanelOpen" /><ArrowUp v-else /></el-icon>
          </button>
          <button class="wechat-msg-btn wechat-msg-btn-close" @click="clearWechatMessages" title="关闭">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>
      <div v-if="wechatPanelOpen" class="wechat-msg-list">
        <div v-for="(msg, i) in wechatMessages" :key="i" class="wechat-msg-item">
          <div class="wechat-msg-sender">
            <span class="wechat-msg-sender-name">{{ msg.senderName || msg.sender }}</span>
            <span class="wechat-msg-time">{{ formatWechatTime(msg.timestamp) }}</span>
          </div>
          <div class="wechat-msg-text">{{ msg.text }}</div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { ElMessage, ElMessageBox } from "element-plus"
import { ArrowRight, More, Cellphone } from "@element-plus/icons-vue"
import MonitorPanel from "./components/MonitorPanel.vue"
import AgentDashboard from "./components/AgentDashboard.vue"
import PipelineDashboard from "./components/PipelineDashboard.vue"
import AgentOffice3D from "./components/AgentOffice3D.vue"
import FileEditor from "./components/FileEditor.vue"
import hljs from "highlight.js"
import { useVoiceInput } from "./composables/useVoiceInput"
import { useWebSocket } from "./composables/useWebSocket"
import { ArrowDown,
  ArrowLeftBold,
  Check,
  ChatLineRound,
  CircleCheckFilled,
  CloseBold,
  Connection,
  CopyDocument,
  Cpu,
  DataBoard,
  Delete,
  Document,
  EditPen,
  Fold,
  Folder,
  Grid,
  Loading as LoadingIcon,
  Menu,
  Microphone,
  Paperclip,
  Plus,
  Promotion,
  Refresh,
  RefreshRight,
  Search,
  Setting,
  Bell,
  VideoPause,
  Star,
  Timer,
  Tools,
  Monitor,
  MoreFilled,
  Share,
  Calendar,
  ChatDotSquare,
} from "@element-plus/icons-vue"

const apiBase = ref("")

const traceIcons: Record<string, any> = {
  Tools, Monitor, Timer, Bell, Promotion, Document, CircleCheckFilled, LoadingIcon
}

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
let officePollTimer: ReturnType<typeof setInterval> | null = null
const typewriterState = {
  messageIndex: -1,
  queue: [] as string[],
  resolver: null as null | (() => void)
}
const fastStreamDisplay = ref(false)
const TYPEWRITER_CHUNK_SIZE = 6
const TYPEWRITER_INTERVAL_MS = 10
const chatHistoryHydrating = ref(false)
const chatHistoryReady = ref(false)

const selectedChatModel = ref('')
const chatExecutionMode = ref<'auto' | 'manual'>('auto')
const fileEditorVisible = ref(false)
const fileEditorPath = ref('')

function openFileEditor(filePath: string) {
  fileEditorPath.value = filePath
  fileEditorVisible.value = true
}

function closeFileEditor() {
  fileEditorVisible.value = false
  fileEditorPath.value = ''
}

function buildFileApiUrl(path: string): string {
  const port = location.port === '4173' ? '17870' : location.port
  return `http://${location.hostname}:${port}${path}`
}

async function handleChatClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const fileLink = target.closest('[data-file-path]')
  if (fileLink) {
    const path = fileLink.getAttribute('data-file-path')
    if (path) {
      event.preventDefault()
      try {
        const res = await fetch(buildFileApiUrl('/api/file/type?path=' + encodeURIComponent(path)))
        const data = await res.json()
        if (data.ok && data.isDirectory) {
          try {
            await fetch(buildFileApiUrl('/api/file/open-in-finder'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path })
            })
          } catch {
            // 打开 Finder 失败，静默处理
          }
        } else if (data.ok && data.isFile) {
          openFileEditor(path)
        } else {
          const hasExt = /\.[a-zA-Z0-9]+$/.test(path)
          if (hasExt) {
            openFileEditor(path)
          } else {
            try {
              await fetch(buildFileApiUrl('/api/file/open-in-finder'), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path })
              })
            } catch {
              // 无法判断类型，尝试在 Finder 打开
            }
          }
        }
      } catch {
        const hasExt = /\.[a-zA-Z0-9]+$/.test(path)
        if (hasExt) {
          openFileEditor(path)
        } else {
          try {
            await fetch(buildFileApiUrl('/api/file/open-in-finder'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path })
            })
          } catch {
            // API 调用失败，静默处理
          }
        }
      }
    }
  }
}
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

const voiceInput = useVoiceInput({ lang: 'zh-CN', continuous: false, interimResults: true })
const showVoiceIndicator = ref(false)

const chatWs = useWebSocket()

// 定时任务列表
interface ScheduledTask {
  id: string
  name: string
  type: 'interval' | 'cron'
  intervalMs?: number
  toolName: string
  toolInput: Record<string, unknown>
  enabled: boolean
  lastRun?: number
  nextRun?: number
  createdAt: number
}

interface TaskLog {
  id: string
  taskId: string
  taskName: string
  status: 'success' | 'error'
  result?: string
  error?: string
  executedAt: number
}

const scheduledTasks = ref<ScheduledTask[]>([])
const scheduledTasksLoading = ref(false)
const taskLogs = ref<TaskLog[]>([])
const taskLogsLoading = ref(false)
const selectedTaskId = ref<string | null>(null)
let taskLogsInterval: ReturnType<typeof setInterval> | null = null

async function loadScheduledTasks() {
  scheduledTasksLoading.value = true
  try {
    const res = await fetch(buildApiUrl('/api/scheduled-tasks'))
    const data = await res.json()
    if (data.ok) {
      scheduledTasks.value = data.tasks
    }
  } catch (err) {
    console.error('加载定时任务失败:', err)
  } finally {
    scheduledTasksLoading.value = false
  }
}

async function loadTaskLogs(taskId?: string) {
  taskLogsLoading.value = true
  try {
    let url = '/api/scheduled-tasks/logs'
    if (taskId) {
      url += `?taskId=${taskId}`
    }
    const res = await fetch(buildApiUrl(url))
    const data = await res.json()
    if (data.ok) {
      taskLogs.value = data.logs
    }
  } catch (err) {
    console.error('加载任务日志失败:', err)
  } finally {
    taskLogsLoading.value = false
  }
}

function viewTaskLogs(taskId: string) {
  if (selectedTaskId.value === taskId) {
    selectedTaskId.value = null
    taskLogs.value = []
    return
  }
  selectedTaskId.value = taskId
  loadTaskLogs(taskId)
}

watch(selectedTaskId, (taskId) => {
  if (taskLogsInterval) {
    clearInterval(taskLogsInterval)
    taskLogsInterval = null
  }
  if (!taskId) return
  taskLogsInterval = setInterval(() => {
    loadTaskLogs(taskId)
  }, 2000) as unknown as ReturnType<typeof setInterval>
})

async function clearTaskLogs() {
  if (!selectedTaskId.value) return

  try {
    await ElMessageBox.confirm(
      t('taskLogsClearConfirm'),
      t('taskLogsClearTitle'),
      { type: 'warning' }
    )
  } catch {
    return
  }

  try {
    const res = await fetch(buildApiUrl('/api/scheduled-tasks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'clear_logs',
        taskId: selectedTaskId.value
      })
    })
    const data = await res.json()
    if (data.ok) {
      taskLogs.value = []
      ElMessage.success(t('taskLogsCleared'))
    }
  } catch (err) {
    console.error('清空任务日志失败:', err)
    ElMessage.error(t('taskLogsClearFailed'))
  }
}

function formatTaskLogText(log: TaskLog): string {
  const lines = [
    `${t('taskName')}: ${log.taskName || ''}`,
    `${t('taskLogsTitle')}: ${log.status === 'success' ? t('success') : t('failed')}`,
    `${t('taskLastRun')}: ${formatTime(log.executedAt)}`
  ]
  if (log.result) {
    lines.push(`result: ${log.result}`)
  }
  if (log.error) {
    lines.push(`error: ${log.error}`)
  }
  return lines.join('\n')
}

async function copyTaskLog(log: TaskLog) {
  await copyMessageText(formatTaskLogText(log), true)
}

async function copyAllTaskLogs() {
  if (taskLogs.value.length === 0) return
  const content = taskLogs.value.map((log) => formatTaskLogText(log)).join('\n\n----------------\n\n')
  await copyMessageText(content, true)
}

const editingTask = ref<ScheduledTask | null>(null)

function editScheduledTask(task: ScheduledTask) {
  editingTask.value = { ...task }
}

function cancelEditTask() {
  editingTask.value = null
}

async function saveScheduledTask() {
  if (!editingTask.value) return
  try {
    const res = await fetch(buildApiUrl('/api/scheduled-tasks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: editingTask.value.id,
        updates: {
          name: editingTask.value.name,
          intervalMs: editingTask.value.intervalMs,
          enabled: editingTask.value.enabled,
          toolName: editingTask.value.toolName,
          toolInput: editingTask.value.toolInput
        }
      })
    })
    const data = await res.json()
    if (data.ok) {
      editingTask.value = null
      await loadScheduledTasks()
    }
  } catch (err) {
    console.error('保存任务失败:', err)
  }
}

async function toggleScheduledTask(id: string, enabled: boolean) {
  const action = enabled ? 'enable' : 'disable'
  try {
    const res = await fetch(buildApiUrl('/api/scheduled-tasks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, id })
    })
    const data = await res.json()
    if (data.ok) {
      await loadScheduledTasks()
    }
  } catch (err) {
    console.error('切换定时任务状态失败:', err)
  }
}

async function deleteScheduledTask(id: string) {
  try {
    const res = await fetch(buildApiUrl('/api/scheduled-tasks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    })
    const data = await res.json()
    if (data.ok) {
      await loadScheduledTasks()
    }
  } catch (err) {
    console.error('删除定时任务失败:', err)
  }
}

function formatInterval(ms?: number): string {
  if (!ms) return '-'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.round(hours / 24)} 天`
}

function formatTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

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
    skillsDir?: string
    username?: string
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
  agentId?: string
  messages: Array<{
    role: string
    text: string
    agentName?: string
    meta?: any
    typing?: boolean
    error?: boolean
    isReading?: boolean
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
    userDataDir: "",
    skillsDir: ""
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
  wechat: {
    enabled: boolean
    webhook: string
  }
  feishu: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
  discord: {
    enabled: boolean
    botToken: string
    channelId: string
  }
  slack: {
    enabled: boolean
    botToken: string
    channelId: string
  }
  teams: {
    enabled: boolean
    appId: string
    appSecret: string
    webhook: string
  }
  whatsapp: {
    enabled: boolean
    accountSid: string
    authToken: string
    fromNumber: string
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
    wechat: {
      enabled: false,
      webhook: ''
    },
    feishu: {
      enabled: false,
      appId: '',
      appSecret: '',
      webhook: ''
    },
    discord: {
      enabled: false,
      botToken: '',
      channelId: ''
    },
    slack: {
      enabled: false,
      botToken: '',
      channelId: ''
    },
    teams: {
      enabled: false,
      appId: '',
      appSecret: '',
      webhook: ''
    },
    whatsapp: {
      enabled: false,
      accountSid: '',
      authToken: '',
      fromNumber: ''
    }
  }
}
const remoteControlConfig = reactive<RemoteControlConfig>(createDefaultRemoteControlConfig())
const remoteControlWebhookUrl = computed(() => buildApiUrl('/api/remote-control/hook'))

const locales = {
  "zh-CN": {
    // 通用
    appTitle: "crabclaw",
    appSubtitle: "crabclaw - AI桌面助手",
    initializing: "小螃蟹启动中",
    sidebarFold: "折叠侧边栏",
    newChat: "新建对话",
    navChat: "对话",
    navAgents: "代理",
    navPipeline: "流水线",
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
    taskAutomationTitle: "自动化策略",
    taskAutomationDesc: "自动执行会直接运行工具调用，手动确认模式会在关键步骤等待你确认。",
    taskGoChat: "去对话页",
    scheduledTasksTitle: "定时任务",
    scheduledTasksEmpty: "暂无定时任务，请通过 AI 对话创建",
    taskInterval: "执行间隔",
    taskLastRun: "上次执行",
    taskNextRun: "下次执行",
    taskTool: "执行工具",
    refresh: "刷新",
    enabled: "已启用",
    disabled: "已停用",
    delete: "删除",
    viewLogs: "查看日志",
    taskLogsTitle: "执行日志",
    taskLogsEmpty: "暂无执行日志",
    taskLogsCopyAll: "复制全部",
    taskLogsClear: "清空日志",
    taskLogsClearTitle: "清空执行日志",
    taskLogsClearConfirm: "确定清空当前任务的执行日志吗？",
    taskLogsCleared: "日志已清空",
    taskLogsClearFailed: "清空日志失败",
    close: "关闭",
    success: "成功",
    failed: "失败",
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
    controlChannelWechat: "企业微信",
    controlChannelFeishu: "飞书",
    controlChannelDiscord: "Discord",
    controlChannelSlack: "Slack",
    controlChannelTeams: "Teams",
    controlChannelWhatsApp: "WhatsApp",
    controlChannelId: "Channel ID",
    controlTwilioSid: "Twilio Account SID",
    controlTwilioToken: "Twilio Auth Token",
    controlFromNumber: "From Number",
    controlTestMessage: "测试消息",
    controlTestMessagePlaceholder: "输入测试消息内容",
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
    inputPlaceholder: "Enter 换行，Ctrl/Cmd+Enter 发送",
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
    noData: "暂无数据",
    runProcessingTitle: "正在执行",
    runResultTitle: "任务已运行完成",
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
    skillsDir: "技能目录",
    skillsDirPlaceholder: "例如：/Users/xxx/server/data/skills",
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
    noModels: "暂无模型",
    addFirstModel: "添加第一个模型",
    taskName: "任务名称",
    editTask: "编辑任务",
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
    appTitle: "crabclaw",
    appSubtitle: "Desktop Studio",
    initializing: "Initializing...",
    sidebarFold: "Collapse sidebar",
    newChat: "New Chat",
    navChat: "Chat",
    navAgents: "Agents",
    navPipeline: "Pipeline",
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
    scheduledTasksTitle: "Scheduled Tasks",
    scheduledTasksEmpty: "No scheduled tasks, create via AI chat",
    taskInterval: "Interval",
    taskLastRun: "Last Run",
    taskNextRun: "Next Run",
    taskTool: "Tool",
    refresh: "Refresh",
    enabled: "Enabled",
    disabled: "Disabled",
    viewLogs: "View Logs",
    taskLogsTitle: "Execution Logs",
    taskLogsEmpty: "No execution logs",
    taskLogsCopyAll: "Copy All",
    taskLogsClear: "Clear Logs",
    taskLogsClearTitle: "Clear Execution Logs",
    taskLogsClearConfirm: "Clear execution logs for this task?",
    taskLogsCleared: "Logs cleared",
    taskLogsClearFailed: "Failed to clear logs",
    close: "Close",
    success: "Success",
    failed: "Failed",
    edit: "Edit",
    taskName: "Task Name",
    editTask: "Edit Task",
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
    controlChannelWechat: "Enterprise WeChat",
    controlChannelFeishu: "Feishu",
    controlChannelDiscord: "Discord",
    controlChannelSlack: "Slack",
    controlChannelTeams: "Teams",
    controlChannelWhatsApp: "WhatsApp",
    controlChannelId: "Channel ID",
    controlTwilioSid: "Twilio Account SID",
    controlTwilioToken: "Twilio Auth Token",
    controlFromNumber: "From Number",
    controlTestMessage: "Test Message",
    controlTestMessagePlaceholder: "Enter test message content",
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
    inputPlaceholder: "Enter for newline, Ctrl/Cmd+Enter to send",
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
    noData: "No data",
    runProcessingTitle: "Running",
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
    skillsDir: "Skills directory",
    skillsDirPlaceholder: "e.g. /Users/xxx/server/data/skills",
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
    noConversation: "No conversations",
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

type NavKey = "chat" | "agents" | "pipeline" | "mcp" | "skills" | "tasks" | "control" | "settings"
interface NavigationItem {
  id: NavKey
  icon: any
  labelKey: string
  showInToolbar?: boolean
}

const navigationItems = computed<NavigationItem[]>(() => [
  { id: "chat", icon: ChatLineRound, labelKey: "navChat", showInToolbar: true },
  { id: "agents", icon: Grid, labelKey: "navAgents", showInToolbar: true },
  { id: "pipeline", icon: Share, labelKey: "navPipeline", showInToolbar: true },
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

interface AttachmentFile {
  name: string
  type: string       // MIME type
  size: number
  dataUrl: string    // base64 data URL，图片用于预览和发送
  text?: string      // 文本文件内容
}
const pendingAttachments = ref<AttachmentFile[]>([])
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuTargetText = ref('')
const selectedChatSkillId = ref("")  // 保留兼容旧逻辑
const selectedChatSkillIds = ref<string[]>([])
const skillDialogVisible = ref(false)
const skillSelectorVisible = ref(false)
const skillDetailVisible = ref(false)
const skillDetailData = ref<any>(null)
const selectedNav = ref<NavKey>("chat")
const sidebarCollapsed = ref(false)
const isInitializing = ref(true)
const initProgress = ref(0)
const activeSettingTab = ref("basic")
const monitorPanelVisible = ref(true)
const office3dVisible = ref(false)
const officeAgents = ref<any[]>([])

// 新输入表单相关
const isInputFocused = ref(false)
const userAvatarText = computed(() => {
  const username = config.value.settings.username || 'User'
  return username.charAt(0).toUpperCase()
})

const selectedSkillName = computed(() => {
  if (selectedChatSkillIds.value.length === 0) return '技能'
  if (selectedChatSkillIds.value.length === 1) {
    const skill = config.value.skills.find(s => s.id === selectedChatSkillIds.value[0])
    return skill?.name || '技能'
  }
  return `技能 (${selectedChatSkillIds.value.length})`
})

// 选项按钮点击处理
const modelSelectorVisible = ref(false)

function selectChatModel(modelId: string) {
  selectedChatModel.value = modelId
  modelSelectorVisible.value = false
}

function openModelFromSelector() {
  modelSelectorVisible.value = false
  openModelDialog('add')
}

function openSkillsDialog() {
  skillSelectorVisible.value = true
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

function selectSkill(skillId: string) {
  selectedChatSkillId.value = skillId
  skillSelectorVisible.value = false
}

function openInspirationDialog() {
  ElMessage.info('灵感功能开发中')
}

function openUserMenu() {
  selectedNav.value = 'settings'
  activeSettingTab.value = 'basic'
}

watch(activeSettingTab, (newTab) => {
  if (newTab === 'token') {
    loadTokenStats()
  }
})

// 代理列表
const agents = ref([
  { id: 'builtin-bot', name: 'CraBot', avatar: '🤖', isBuiltIn: true },
  { id: 'custom-ai-1', name: '自定义AI 1', avatar: 'A' },
  { id: 'custom-ai-2', name: '自定义AI 2', avatar: 'C' }
])

// 对话右键菜单状态
const conversationMenuVisible = ref(false)
const conversationMenuPosition = ref({ x: 0, y: 0 })
const selectedConvForMenu = ref<Conversation | null>(null)

function showConversationMenu(event: MouseEvent, conv: Conversation) {
  conversationMenuPosition.value = { x: event.clientX, y: event.clientY }
  selectedConvForMenu.value = conv
  conversationMenuVisible.value = true
  document.addEventListener('click', closeConversationMenu)
}

function closeConversationMenu() {
  conversationMenuVisible.value = false
  document.removeEventListener('click', closeConversationMenu)
}

async function renameConv() {
  closeConversationMenu()
  if (!selectedConvForMenu.value) return
  
  const { value: newName } = await ElMessageBox.prompt('请输入新的对话名称', '重命名', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: selectedConvForMenu.value.title
  })
  
  if (newName) {
    const conv = conversations.value.find(c => c.id === selectedConvForMenu.value?.id)
    if (conv) {
      conv.title = newName
    }
  }
}

async function clearConv() {
  closeConversationMenu()
  if (!selectedConvForMenu.value) return
  
  await ElMessageBox.confirm('确定清空此对话的所有消息吗？', '确认清空', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
  
  const conv = conversations.value.find(c => c.id === selectedConvForMenu.value?.id)
  if (conv) {
    conv.messages = []
  }
}

async function deleteConv() {
  closeConversationMenu()
  if (!selectedConvForMenu.value) return
  
  await ElMessageBox.confirm('确定删除此对话吗？此操作不可恢复。', '确认删除', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
  
  const index = conversations.value.findIndex(c => c.id === selectedConvForMenu.value?.id)
  if (index !== -1) {
    conversations.value.splice(index, 1)
    if (currentConversationId.value === selectedConvForMenu.value.id) {
      currentConversationId.value = conversations.value[0]?.id || ''
    }
  }
}

const selectedAgentId = ref('builtin-bot')
const expandedAgents = ref<string[]>(['builtin-bot'])

function toggleAgent(agentId: string) {
  selectedAgentId.value = agentId
  const index = expandedAgents.value.indexOf(agentId)
  if (index === -1) {
    expandedAgents.value = [agentId]
  }
}

function getAgentConversations(agentId: string) {
  return conversations.value.filter(c => c.agentId === agentId || (agentId === 'builtin-bot' && !c.agentId))
}

// 聊天历史记录支持
const conversations = ref<Conversation[]>([{
  id: "default",
  title: "新对话",
  agentId: 'builtin-bot',
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

/** 远程代理专属对话，不允许前端手动输入 */
const isRemoteAgentConversation = computed(() =>
  currentConversationId.value.startsWith('agent-remote-agent-')
)
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

function traceStepLabel(index: number): string {
  return ''
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

function friendlyToolName(server: string, tool: string): string {
  const s = server.toLowerCase()
  const t = tool.toLowerCase()

  // 文件系统
  if (s.includes('filesystem') || s.includes('file') || s.includes('fs')) {
    if (t === 'create_directory') return '创建文件夹'
    if (t.includes('write') || t.includes('save')) return '创建文件'
    if (t === 'edit_file') return '修改文件'
    if (t.includes('read') || t.includes('get')) return '读取文件'
    if (t.includes('delete') || t.includes('remove')) return '删除文件'
    if (t.includes('list') || t.includes('dir') || t.includes('ls')) return '查看目录'
    if (t.includes('move') || t.includes('rename')) return '移动文件'
    if (t.includes('search') || t.includes('find')) return '搜索文件'
    return '操作文件'
  }

  // Shell / 终端
  if (s.includes('shell') || s.includes('terminal') || s.includes('bash') || s.includes('exec') || s.includes('command')) {
    return '执行命令'
  }

  // 浏览器 / DevTools
  if (s.includes('chrome') || s.includes('devtools') || s.includes('browser') || s.includes('puppeteer') || s.includes('playwright')) {
    if (t.includes('navigate') || t.includes('goto') || t.includes('new_page')) return '打开浏览器'
    if (t.includes('screenshot') || t.includes('capture')) return '截取截图'
    if (t.includes('click')) return '点击页面'
    if (t.includes('type') || t.includes('input') || t.includes('fill')) return '输入内容'
    if (t.includes('scroll')) return '滚动页面'
    if (t.includes('evaluate') || t.includes('script')) return '执行脚本'
    if (t.includes('wait')) return '等待页面'
    if (t.includes('content') || t.includes('html') || t.includes('text') || t.includes('get_page')) return '读取网页'
    if (t.includes('element') || t.includes('find') || t.includes('query') || t.includes('select')) return '查找元素'
    if (t.includes('tab') || t.includes('window') || t.includes('list_pages')) return '管理标签页'
    if (t.includes('network') || t.includes('request')) return '查看请求'
    if (t.includes('close')) return '关闭页面'
    if (t.includes('select_page')) return '切换页面'
    return '操作浏览器'
  }

  // 网络请求 / Fetch
  if (s.includes('fetch') || s.includes('http') || s.includes('request') || s.includes('curl')) {
    return '访问网络'
  }

  // 内存 / 知识库
  if (s.includes('memory') || s.includes('knowledge') || s.includes('vector')) {
    if (t.includes('search') || t.includes('query') || t.includes('find') || t.includes('open')) return '查询记忆'
    if (t.includes('store') || t.includes('save') || t.includes('add') || t.includes('create')) return '保存记忆'
    if (t.includes('delete')) return '删除记忆'
    return '操作记忆'
  }

  // GitHub
  if (s.includes('github') || s.includes('git')) {
    if (t.includes('search')) return '搜索仓库'
    if (t.includes('commit') || t.includes('push')) return '提交代码'
    if (t.includes('pull') || t.includes('pr')) return '处理 Pull Request'
    if (t.includes('issue')) return '处理 Issue'
    if (t.includes('file') || t.includes('content')) return '读取仓库文件'
    return '操作 GitHub'
  }

  // 数据库
  if (s.includes('sqlite') || s.includes('database') || s.includes('db') || s.includes('sql')) {
    if (t.includes('select') || t.includes('query') || t.includes('read')) return '查询数据'
    if (t.includes('insert') || t.includes('create') || t.includes('write')) return '写入数据'
    if (t.includes('update')) return '更新数据'
    if (t.includes('delete') || t.includes('drop')) return '删除数据'
    return '操作数据库'
  }

  // 搜索
  if (s.includes('search') || s.includes('google') || s.includes('bing') || s.includes('brave')) {
    return '搜索信息'
  }

  // 默认
  const readable = tool.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return `执行 ${readable}`
}

function applyMcpEventToMessage(message: any, eventData: any) {
  const trace = ensureMessageTrace(message)
  const server = String(eventData?.server || '')
  const tool = String(eventData?.tool || '')
  if (!server || !tool) return
  const key = `${server}/${tool}`
  const label = friendlyToolName(server, tool)
  const status = eventData?.status === 'error' ? 'error' : eventData?.status === 'success' ? 'success' : 'start'
  trace.mcpRuntime[key] = {
    status,
    label,
    time: String(eventData?.time || new Date().toISOString()),
    error: eventData?.error ? String(eventData.error) : undefined
  }

  let filePath = ''
  const input = eventData?.input
  if (input && typeof input === 'object') {
    filePath = String(input.path || input.destination || input.source || input.filePath || input.dir || '')
  }

  const pathSuffix = filePath ? ` [${filePath}]` : ''

  if (status === 'error') {
    const errText = String(eventData?.error || '未知错误')
    pushExecutionDetailToMessage(message, 'mcp', `${label}：${errText}${pathSuffix}`, eventData?.time)
  } else if (status === 'success') {
    pushExecutionDetailToMessage(message, 'mcp', `${label}${pathSuffix}`, eventData?.time)
  } else {
    pushExecutionDetailToMessage(message, 'mcp', `${label}${pathSuffix}`, eventData?.time)
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
  const hasRealExecution = trace.details.some(item => {
    const stage = String(item?.stage || '').toLowerCase()
    return ['tool', 'mcp', 'confirm', 'task', 'error'].includes(stage)
  })
  if (!hasRealExecution) return false
  return index >= 0
}

function hasExecutionTrace(message: any): boolean {
  if (!message || message.role !== 'assistant') return false
  if (message.pendingConfirm) return true
  const trace = getMessageTrace(message)
  if (!trace) return false
  if (Object.keys(trace.mcpRuntime).length > 0) return true
  return trace.details.some(item => {
    const stage = String(item?.stage || '').toLowerCase()
    return ['tool', 'mcp', 'confirm', 'task', 'error'].includes(stage)
  })
}

function tracePanelSubtitle(message: any): string {
  if (!message?.typing) {
    return t('runResultTitle')
  }

  const runningCalls = traceRunningCalls(message)
  if (runningCalls.length > 0) {
    return runningCalls[0]
  }

  const details = traceDetails(message)
  const nonPlanDetails = details.filter(d => d.stage !== 'plan')
  if (nonPlanDetails.length > 0) {
    const last = nonPlanDetails[nonPlanDetails.length - 1]
    const stage = String(last.stage || '')
    if (stage === 'mcp') return '正在使用工具处理，请稍等~'
    if (stage === 'step') return '一步一步来，马上就好~'
    if (stage === 'task') return '思考中，很快完成~'
    if (stage === 'confirm') return '需要您确认一下哦~'
  }

  const hasText = message.text && message.text.trim()
  if (hasText) return '正在组织语言...'

  const hasTrace = details.length > 0
  if (hasTrace) return '正在规划最佳方案...'

  return '让我想想...'
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

function isGroupSuccess(group: any): boolean {
  if (!group.items || group.items.length === 0) return false
  const lastItem = group.items[group.items.length - 1]
  const text = String(lastItem.text || '').toLowerCase()
  return text.includes('成功') || text.includes('完成') || text.includes('done') || text.includes('success')
}

function isGroupRunning(group: any): boolean {
  if (!group.items || group.items.length === 0) return false
  const lastItem = group.items[group.items.length - 1]
  const text = String(lastItem.text || '').toLowerCase()
  return text.includes('中...') || text.includes('running') || text.includes('执行')
}

function isStepSuccess(item: any): boolean {
  const text = String(item.text || '').toLowerCase()
  return text.includes('成功') || text.includes('完成') || text.includes('done') || text.includes('success')
}

function isStepError(item: any): boolean {
  const text = String(item.text || '').toLowerCase()
  return text.includes('失败') || text.includes('error') || text.includes('fail') || text.includes('错误')
}

function getNodeStatusClass(item: any): string {
  if (isStepSuccess(item)) return 'ai-trace-node--done'
  if (isStepError(item)) return 'ai-trace-node--error'
  const text = String(item.text || '').toLowerCase()
  if (text.includes('调用中') || text.includes('running') || text.includes('进行')) return 'ai-trace-node--start'
  return ''
}

function getToolIconComponent(item: { stage: string; text: string }): any {
  const text = String(item.text || '').toLowerCase()
  if (text.includes('浏览') || text.includes('网页') || text.includes('页面') || text.includes('浏览器') || text.includes('截图') || text.includes('点击') || text.includes('导航')) return Monitor
  if (text.includes('文件') || text.includes('写入') || text.includes('读取') || text.includes('目录') || text.includes('保存') || text.includes('文件夹')) return Folder
  if (text.includes('控制台') || text.includes('shell') || text.includes('终端') || text.includes('命令') || text.includes('执行') || text.includes('运行')) return Cpu
  if (text.includes('网络') || text.includes('访问') || text.includes('fetch') || text.includes('请求')) return Connection
  if (text.includes('记忆') || text.includes('知识') || text.includes('memory')) return DataBoard
  if (text.includes('搜索') || text.includes('查询')) return Search
  if (text.includes('数据库') || text.includes('sql')) return DataBoard
  if (text.includes('git') || text.includes('github') || text.includes('仓库')) return Share
  if (text.includes('邮件') || text.includes('email')) return ChatDotSquare
  if (text.includes('日历') || text.includes('schedule')) return Calendar
  return Tools
}

function getToolIconClass(item: { stage: string; text: string }): string {
  const text = String(item.text || '').toLowerCase()
  if (text.includes('浏览') || text.includes('网页') || text.includes('页面') || text.includes('浏览器') || text.includes('截图') || text.includes('点击') || text.includes('导航')) return 'ai-trace-tool-icon--browser'
  if (text.includes('文件') || text.includes('写入') || text.includes('读取') || text.includes('目录') || text.includes('保存')) return 'ai-trace-tool-icon--file'
  if (text.includes('控制台') || text.includes('shell') || text.includes('终端') || text.includes('命令') || text.includes('执行') || text.includes('运行')) return 'ai-trace-tool-icon--shell'
  if (text.includes('网络') || text.includes('访问') || text.includes('fetch') || text.includes('请求')) return 'ai-trace-tool-icon--fetch'
  if (text.includes('记忆') || text.includes('知识') || text.includes('memory')) return 'ai-trace-tool-icon--memory'
  if (text.includes('git') || text.includes('github')) return 'ai-trace-tool-icon--github'
  if (text.includes('搜索') || text.includes('查询')) return 'ai-trace-tool-icon--search'
  return 'ai-trace-tool-icon--default'
}

function traceRunningCalls(message: any): string[] {
  const runtime = getMessageTrace(message)?.mcpRuntime || {}
  return Object.values(runtime)
    .filter(item => item.status === 'start')
    .map(item => item.label)
}

let currentSpeechUtterance: SpeechSynthesisUtterance | null = null

function toggleReadAloud(message: any) {
  if (message.isReading) {
    speechSynthesis.cancel()
    message.isReading = false
    currentSpeechUtterance = null
    return
  }
  
  const text = message.text?.replace(/<[^>]*>/g, '') || ''
  if (!text) return
  
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.0
  utterance.pitch = 1.0
  
  utterance.onend = () => {
    message.isReading = false
    currentSpeechUtterance = null
  }
  
  utterance.onerror = () => {
    message.isReading = false
    currentSpeechUtterance = null
  }
  
  currentSpeechUtterance = utterance
  message.isReading = true
  speechSynthesis.speak(utterance)
}

function toggleTraceInline(message: any) {
  const trace = ensureMessageTrace(message)
  if (!message.meta) {
    message.meta = { trace, traceCollapsed: false }
  }
  message.meta.traceCollapsed = !message.meta.traceCollapsed
}

function groupedTraceDetails(message: any) {
  const details = traceDetails(message)
  if (details.length === 0) return []
  
  const groups: Array<{ key: string; items: Array<{ index: number; stage: string; text: string; time: string }> }> = []
  let currentGroup: { key: string; items: Array<{ index: number; stage: string; text: string; time: string }> } | null = null
  
  const isRedundant = (text: string): boolean => {
    const t = String(text || '').trim()
    if (!t) return true
    if (/^step_\d+$/i.test(t)) return true
    if (/^(MCP\s+)?\S+\s*·\s*(running|done)$/i.test(t)) return true
    if (/正在调用\s+\S+\s*\.\.\./.test(t)) return true
    if (/\S+\s*调用中$/.test(t)) return true
    if (/\S+\s*·\s*running$/.test(t)) return true
    const skipPatterns = [
      '解析用户请求', '等待 AI 响应', '执行操作', '返回结果',
      '已加载模型与 MCP 工具清单', '正在解析用户请求并生成执行方案',
      '模型已返回响应，正在解析内容'
    ]
    const textWithoutEmoji = t
    if (skipPatterns.some(p => textWithoutEmoji === p || textWithoutEmoji.startsWith(p + ' ·'))) return true
    return false
  }
  
  details.forEach((item, index) => {
    if (item.stage === 'plan') {
      const text = String(item.text || '').trim()
      if (!text || /^step_\d+$/i.test(text)) return
      if (isRedundant(text)) return
      currentGroup = { key: text, items: [] }
      groups.push(currentGroup)
    } else if (currentGroup) {
      if (!isRedundant(item.text)) {
        currentGroup.items.push({ ...item, index })
      }
    } else {
      if (!isRedundant(item.text)) {
        currentGroup = { key: '调用工具', items: [{ ...item, index }] }
        groups.push(currentGroup)
      }
    }
  })
  
  return groups
}

function formatTraceTime(time: string): string {
  if (!time) return ''
  if (time.startsWith('plan-')) return ''
  const timestamp = Date.parse(time)
  if (Number.isNaN(timestamp)) return ''
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function renderTraceNodeLabel(text: string): string {
  if (!text) return ''
  let html = escapeHtml(text)
  html = html.replace(/\/(Users|home|private\/tmp)\/[^\s<）)\]>]+/g, '<span class="file-path-link" data-file-path="$&">$&</span>')
  return html
}

function formatTraceStage(stage: string): string {
  return String(stage || '步骤')
}

function getItemIcon(item: { stage: string; text: string }): string {
  const stage = String(item.stage || '').toLowerCase()
  const text = String(item.text || '').toLowerCase()
  if (stage === 'mcp') {
    if (text.includes('shell') || text.includes('exec') || text.includes('command')) {
      return 'Monitor'
    }
    return 'Tools'
  }
  if (stage === 'task') return 'Timer'
  if (stage === 'confirm') return 'Bell'
  if (stage === 'step') return 'Promotion'
  if (stage === 'plan') return 'Document'
  return 'Promotion'
}

function getGroupIcon(group: { key: string }): string {
  const key = String(group.key || '').toLowerCase()
  if (key.includes('调用') || key.includes('工具') || key.includes('mcp')) return 'Tools'
  if (key.includes('解析') || key.includes('规划') || key.includes('plan')) return 'Document'
  if (key.includes('执行') || key.includes('运行') || key.includes('step')) return 'Promotion'
  if (key.includes('确认') || key.includes('confirm')) return 'Bell'
  if (key.includes('任务') || key.includes('task')) return 'Timer'
  return 'Promotion'
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

function extractTextFromAgentJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return text

  const parts: string[] = []
  let searchPos = 0
  while (searchPos < trimmed.length) {
    const firstBrace = trimmed.indexOf('{', searchPos)
    if (firstBrace < 0) break
    let depth = 0
    let inString = false
    let endPos = -1
    for (let i = firstBrace; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (ch === '"' && (i === 0 || trimmed[i - 1] !== '\\')) inString = !inString
      if (!inString) {
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { endPos = i; break }
        }
      }
    }
    if (endPos < 0) { searchPos = firstBrace + 1; continue }

    const jsonStr = trimmed.slice(firstBrace, endPos + 1)
    searchPos = endPos + 1

    try {
      const parsed = JSON.parse(jsonStr)
      if (!parsed || typeof parsed !== 'object') {
        parts.push(jsonStr)
        continue
      }
      const type = String(parsed.type || '').trim()
      const data = parsed.data || parsed

      if (type === 'message' && data?.content) {
        parts.push(String(data.content))
      } else if (type === 'action' && data?.tool) {
        parts.push(`[调用工具: ${data.tool}]`)
      } else if (type === 'actions' && Array.isArray(data?.actions)) {
        for (const a of data.actions) {
          if (a?.tool) parts.push(`[调用工具: ${a.tool}]`)
        }
      } else if (data?.result) {
        parts.push(String(data.result))
      } else if (data?.message) {
        parts.push(String(data.message))
      } else if (data?.content) {
        parts.push(String(data.content))
      } else if (data?.text) {
        parts.push(String(data.text))
      } else if (type && ['plan', 'done', 'error'].includes(type)) {
        continue
      } else {
        parts.push(jsonStr)
      }
    } catch {
      parts.push(jsonStr)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : text
}

function renderMessageText(text: string): string {
  if (!text) return ""

  text = extractTextFromAgentJson(text)

  const codeBlocks: string[] = []
  let html = escapeHtml(text)

  html = html.replace(/```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_all, lang, code) => {
    const langClass = lang && hljs.getLanguage(lang) ? lang : "plaintext"
    let highlightedCode: string
    try {
      highlightedCode = hljs.highlight(String(code).trimEnd(), { language: langClass }).value
    } catch {
      highlightedCode = escapeHtml(String(code).trimEnd())
    }
    const codeHtml = `<pre class="md-code"><div class="md-code-lang">${lang || "text"}</div><code class="hljs language-${langClass}">${highlightedCode}</code></pre>`
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`
    codeBlocks.push(codeHtml)
    return token
  })

  html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>")

  html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_all, header, body) => {
    const headers = header.split('|').map((h: string) => h.trim()).filter(Boolean)
    const rows = body.trim().split('\n').map((row: string) =>
      row.split('|').map((cell: string) => cell.trim()).filter(Boolean)
    )
    let tableHtml = '<div class="md-table-wrapper"><table class="md-table"><thead><tr>'
    tableHtml += headers.map((h: string) => `<th>${h}</th>`).join('')
    tableHtml += '</tr></thead><tbody>'
    rows.forEach((row: string[]) => {
      tableHtml += '<tr>' + row.map((cell: string) => `<td>${cell}</td>`).join('') + '</tr>'
    })
    tableHtml += '</tbody></table></div>'
    return tableHtml
  })

  html = html.replace(/\/(Users|home|private\/tmp)\/[^\s<）)\]>]+/g, '<span class="file-path-link" data-file-path="$&">$&</span>')

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
  } catch (err: any) {
    if (err !== 'cancel' && err?.message !== 'cancel') {
      ElMessage.error(String(err?.message || '卸载失败'))
    }
  }
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
      loadConfig()
    } else {
      ElMessage.error(data.error)
    }
  } catch (e) {
    ElMessage.error(t('installFailed'))
  }
}

function showSkillDetail(skill: any) {
  skillDetailData.value = skill
  skillDetailVisible.value = true
}

async function installSkillFromDetail() {
  if (!skillDetailData.value) return
  await installSkill(skillDetailData.value)
  skillDetailVisible.value = false
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
      loadConfig()
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
    fetch(buildApiUrl('/api/remote-control/config'))
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error(`Unexpected content-type: ${ct}`)
        return res.json()
      })
      .then(data => {
        if (data.enabled !== undefined) {
          remoteControlConfig.enabled = Boolean(data.enabled)
        }
        if (data.commandPrefix) {
          remoteControlConfig.commandPrefix = String(data.commandPrefix)
        }
        if (data.verifyCode) {
          remoteControlConfig.verifyCode = String(data.verifyCode)
        }

        if (data.telegram) {
          remoteControlConfig.telegram.enabled = Boolean(data.telegram.enabled)
          remoteControlConfig.telegram.botToken = String(data.telegram.botToken || '')
          remoteControlConfig.telegram.chatId = String(data.telegram.chatId || '')
        }

        if (data.qq) {
          remoteControlConfig.qq.enabled = Boolean(data.qq.enabled)
          remoteControlConfig.qq.botId = String(data.qq.botId || '')
          remoteControlConfig.qq.webhook = String(data.qq.webhook || '')
        }

        if (data.wechat) {
          remoteControlConfig.wechat.enabled = Boolean(data.wechat.enabled)
          remoteControlConfig.wechat.webhook = String(data.wechat.webhook || '')
        }

        if (data.feishu) {
          remoteControlConfig.feishu.enabled = Boolean(data.feishu.enabled)
          remoteControlConfig.feishu.appId = String(data.feishu.appId || '')
          remoteControlConfig.feishu.appSecret = String(data.feishu.appSecret || '')
          remoteControlConfig.feishu.webhook = String(data.feishu.webhook || '')
        }
      })
      .catch(err => {
        console.error('从后端加载远控配置失败:', err)
      })
  } catch (error) {
    console.error('加载远程控制配置失败:', error)
  }

  fetchWechatStatus()
}

const telegramTestMessage = ref('')
const sendingToTelegram = ref(false)

// 个人微信状态
const wechatTestMessage = ref('')
const wechatSending = ref(false)
const wechatLoginLoading = ref(false)
const wechatQrCodeUrl = ref('')
const wechatLoginSession = ref('')
const wechatLoginStatus = ref<'idle' | 'waiting' | 'success'>('idle')
const wechatAccounts = ref<Array<{ wxid: string; nickname: string; loggedInAt: number }>>([])
const wechatMessages = ref<Array<{ sender: string; senderName: string; text: string; timestamp: number; msgType?: string }>>([])
const wechatPanelOpen = ref(true)
let wechatPollingTimer: ReturnType<typeof setInterval> | null = null

function formatWechatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function clearWechatMessages() {
  wechatMessages.value = []
}

function pushWechatMessage(msg: { sender: string; text: string; timestamp: number; msgType?: string }) {
  wechatMessages.value.push({
    ...msg,
    senderName: msg.sender.includes('@im.wechat') ? msg.sender.split('@')[0] : msg.sender.slice(0, 8),
    text: msg.text,
  })
  if (wechatMessages.value.length > 50) {
    wechatMessages.value = wechatMessages.value.slice(-50)
  }
  wechatPanelOpen.value = true
}

async function fetchWechatStatus() {
  try {
    const res = await fetch(buildApiUrl('/api/plugins/wechat-bot/status'))
    const data = await res.json()
    if (data.ok && data.accounts) {
      wechatAccounts.value = data.accounts
    }
  } catch {}
}

async function startWechatLogin() {
  wechatLoginLoading.value = true
  wechatQrCodeUrl.value = ''
  wechatLoginStatus.value = 'idle'
  try {
    const res = await fetch(buildApiUrl('/api/plugins/wechat-bot/login'), { method: 'POST' })
    const data = await res.json()
    if (data.ok && data.qrcodeUrl) {
      wechatQrCodeUrl.value = data.qrcodeUrl
      wechatLoginSession.value = data.session
      wechatLoginStatus.value = 'waiting'
      startWechatLoginPolling(data.session)
    } else {
      ElMessage.error(data.error || '获取二维码失败')
    }
  } catch (err: any) {
    ElMessage.error('登录请求失败')
  } finally {
    wechatLoginLoading.value = false
  }
}

function startWechatLoginPolling(session: string) {
  stopWechatLoginPolling()
  wechatPollingTimer = setInterval(async () => {
    try {
      const res = await fetch(buildApiUrl(`/api/plugins/wechat-bot/check-login?session=${session}`))
      const data = await res.json()
      if (data.ok && data.status === 'success') {
        wechatLoginStatus.value = 'success'
        stopWechatLoginPolling()
        await fetchWechatStatus()
        setTimeout(() => {
          wechatQrCodeUrl.value = ''
          wechatLoginSession.value = ''
        }, 1500)
      }
    } catch {}
  }, 2000)
}

function stopWechatLoginPolling() {
  if (wechatPollingTimer) {
    clearInterval(wechatPollingTimer)
    wechatPollingTimer = null
  }
}

function cancelWechatLogin() {
  stopWechatLoginPolling()
  wechatQrCodeUrl.value = ''
  wechatLoginSession.value = ''
  wechatLoginStatus.value = 'idle'
}

async function sendTestToWechat() {
  if (!wechatTestMessage.value.trim()) return
  wechatSending.value = true
  try {
    const res = await fetch(buildApiUrl('/api/plugins/wechat-bot/send'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: wechatTestMessage.value })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success('发送成功')
      wechatTestMessage.value = ''
    } else {
      ElMessage.error(data.error || '发送失败')
    }
  } catch {
    ElMessage.error('发送失败')
  } finally {
    wechatSending.value = false
  }
}

async function logoutWechatAccount(wxid: string) {
  try {
    const res = await fetch(buildApiUrl('/api/plugins/wechat-bot/logout'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wxid })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success('已登出')
      await fetchWechatStatus()
    } else {
      ElMessage.error(data.error || '登出失败')
    }
  } catch {
    ElMessage.error('登出失败')
  }
}

async function sendTestToTelegram() {
  if (!telegramTestMessage.value.trim()) return
  sendingToTelegram.value = true
  try {
    const res = await fetch(buildApiUrl('/api/remote-control/send'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        content: telegramTestMessage.value
      })
    })
    const data = await res.json()
    if (data.ok) {
      ElMessage.success('发送成功')
      telegramTestMessage.value = ''
    } else {
      ElMessage.error(data.error || '发送失败')
    }
  } catch (err) {
    ElMessage.error('发送失败')
  } finally {
    sendingToTelegram.value = false
  }
}

function saveRemoteControlConfig() {
  try {
    const payload = {
      enabled: remoteControlConfig.enabled,
      commandPrefix: remoteControlConfig.commandPrefix,
      verifyCode: remoteControlConfig.verifyCode,
      telegram: {
        enabled: remoteControlConfig.telegram.enabled,
        botToken: remoteControlConfig.telegram.botToken,
        chatId: remoteControlConfig.telegram.chatId
      },
      qq: {
        enabled: remoteControlConfig.qq.enabled,
        botId: remoteControlConfig.qq.botId,
        webhook: remoteControlConfig.qq.webhook
      },
      wechat: {
        enabled: remoteControlConfig.wechat.enabled,
        webhook: remoteControlConfig.wechat.webhook
      },
      feishu: {
        enabled: remoteControlConfig.feishu.enabled,
        appId: remoteControlConfig.feishu.appId,
        appSecret: remoteControlConfig.feishu.appSecret,
        webhook: remoteControlConfig.feishu.webhook
      },
      discord: {
        enabled: remoteControlConfig.discord.enabled,
        botToken: remoteControlConfig.discord.botToken,
        channelId: remoteControlConfig.discord.channelId
      },
      slack: {
        enabled: remoteControlConfig.slack.enabled,
        botToken: remoteControlConfig.slack.botToken,
        channelId: remoteControlConfig.slack.channelId
      },
      teams: {
        enabled: remoteControlConfig.teams.enabled,
        appId: remoteControlConfig.teams.appId,
        appSecret: remoteControlConfig.teams.appSecret,
        webhook: remoteControlConfig.teams.webhook
      },
      whatsapp: {
        enabled: remoteControlConfig.whatsapp.enabled,
        accountSid: remoteControlConfig.whatsapp.accountSid,
        authToken: remoteControlConfig.whatsapp.authToken,
        fromNumber: remoteControlConfig.whatsapp.fromNumber
      }
    }

    fetch(buildApiUrl('/api/remote-control/config'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {})

    ElMessage.success(t('controlSaved'))
  } catch (error: any) {
    ElMessage.error(String(error?.message || error || t('saveFailed')))
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

async function loadOfficeAgents() {
  try {
    const res = await fetch(buildApiUrl('/api/agents'))
    const data = await res.json()
    officeAgents.value = Array.isArray(data) ? data : []
  } catch (error) {
    console.error('加载3D办公室代理失败:', error)
    officeAgents.value = []
  }
}

function openOffice3d() {
  office3dVisible.value = true
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

watch(office3dVisible, (visible) => {
  if (visible) {
    void loadOfficeAgents()
    if (officePollTimer) clearInterval(officePollTimer)
    officePollTimer = setInterval(() => {
      void loadOfficeAgents()
    }, 3000) as unknown as ReturnType<typeof setInterval>
    return
  }
  if (officePollTimer) {
    clearInterval(officePollTimer)
    officePollTimer = null
  }
})

function newChat() {
  const newId = `chat-${Date.now()}`
  conversations.value.unshift({
    id: newId,
    title: "新对话",
    agentId: selectedAgentId.value,
    messages: [
      {
        role: "assistant",
        text: "欢迎使用AI助手！我可以帮您处理各种任务。"
      }
    ]
  })
  currentConversationId.value = newId
  selectedChatSkillId.value = ""
  selectedChatSkillIds.value = []
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
  const isMeta = event.ctrlKey || event.metaKey

  if (contextMenuVisible.value) {
    if (event.key === 'Escape') {
      hideContextMenu()
      event.preventDefault()
    }
    return
  }

  if (isMeta && document.activeElement?.closest('.chat-input-area')) {
    const textarea = document.querySelector('.chat-input-area textarea') as HTMLTextAreaElement
    switch (event.key) {
      case 'v':
        event.preventDefault()
        void pasteFromClipboard()
        break
      case 'a':
        if (textarea) {
          event.preventDefault()
          textarea.select()
        }
        break
      case 'c':
        const selection = window.getSelection()
        if (selection && selection.toString()) {
          navigator.clipboard.writeText(selection.toString())
          ElMessage.success('已复制')
        }
        break
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
  scheduleSaveChatHistory()
}

function serializeConversationsForSave() {
  return conversations.value
    .filter(conv => !conv.id.startsWith('remote-'))  // remote 对话不持久化，避免覆盖历史
    .map((conv) => ({
      id: conv.id,
      title: conv.title,
      messages: conv.messages.map((msg) => ({
        role: msg.role,
        text: msg.text,
        agentName: msg.agentName,
        meta: msg.meta,
        error: Boolean(msg.error),
        typing: Boolean(msg.typing)
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
      conversations.value = storedConversations.filter((c: any) => !String(c?.id || '').startsWith('remote-')).map((conversation: any) => ({
        ...conversation,
        messages: Array.isArray(conversation?.messages)
          ? conversation.messages.map((message: any) => {
              const wasTyping = Boolean(message?.typing)
              const nextMeta = {
                ...(message?.meta && typeof message.meta === 'object' ? message.meta : {}),
                animateOnLoad: wasTyping || Boolean(message?.meta?.animateOnLoad)
              }
              return {
                ...message,
                meta: nextMeta,
                typing: false
              }
            })
          : []
      }))
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
    await nextTick()
    await replayPersistedAssistantAnimation()
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

  if (fastStreamDisplay.value) {
    if (!messages.value[messageIndex]) return
    messages.value[messageIndex].text += text
    scrollChatToBottom()
    return
  }

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

    const pendingChars = typewriterState.queue.reduce((sum, s) => sum + s.length, 0)
    const chunkSize = pendingChars > 200 ? TYPEWRITER_CHUNK_SIZE * 4 : pendingChars > 60 ? TYPEWRITER_CHUNK_SIZE * 2 : TYPEWRITER_CHUNK_SIZE
    const chunk = queueItem.slice(0, chunkSize)
    if (!messages.value[messageIndex]) {
      stopTypewriter()
      return
    }
    messages.value[messageIndex].text += chunk
    typewriterState.queue[0] = queueItem.slice(chunkSize)
    if (!typewriterState.queue[0]) {
      typewriterState.queue.shift()
    }
    scrollChatToBottom()
  }, TYPEWRITER_INTERVAL_MS)
}

function waitTypewriterDrain(): Promise<void> {
  if (fastStreamDisplay.value) {
    return Promise.resolve()
  }
  if (!typewriterState.queue.length && !typewriterTimer) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    typewriterState.resolver = resolve
  })
}

async function replayPersistedAssistantAnimation() {
  if (fastStreamDisplay.value) return
  const list = messages.value
  if (!Array.isArray(list) || list.length === 0) return

  const targetIndex = [...list]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => (
      message.role === 'assistant' &&
      Boolean(message?.meta?.animateOnLoad) &&
      String(message?.text || '').trim().length > 0
    ))?.index ?? -1

  if (targetIndex < 0 || !list[targetIndex]) return

  const message = list[targetIndex]
  const fullText = String(message.text || '')
  message.text = ''
  message.typing = true

  enqueueTypewriter(targetIndex, fullText)
  await waitTypewriterDrain()

  if (!list[targetIndex]) return
  list[targetIndex].typing = false
  list[targetIndex].meta = {
    ...(list[targetIndex].meta && typeof list[targetIndex].meta === 'object' ? list[targetIndex].meta : {}),
    animateOnLoad: false
  }
  scheduleSaveChatHistory()
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBase.value}${normalizedPath}`
}

function getBackendCandidates(): string[] {
  const port = config.value?.settings?.backendPort || 17870
  const candidates: string[] = []

  // 已知后端端口，绝对地址优先（打包和开发环境都有效）
  const ports = Array.from(new Set([port, 17870, 17871, 17872]))
  for (const p of ports) {
    candidates.push(`http://127.0.0.1:${p}`)
    candidates.push(`http://localhost:${p}`)
  }

  // 开发环境 Vite 代理（仅当 origin 端口是已知 dev server 端口时才加入）
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    const originPort = parseInt(window.location.port)
    if ([4173, 5173].includes(originPort)) {
      candidates.unshift(window.location.origin)
    }
  }

  return candidates
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
    await nextTick()
    await replayPersistedAssistantAnimation()
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
        userDataDir: data?.settings?.userDataDir ?? "",
        skillsDir: data?.settings?.skillsDir ?? ""
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

function checkForUpdate() {
  ElMessage.info('已是最新版本')
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
  const attachments = pendingAttachments.value.slice()
  if (!message && attachments.length === 0) return null

  // 文本文件内容拼入消息末尾
  const textAppend = attachments
    .filter(a => a.text !== undefined)
    .map(a => `\n\n【附件：${a.name}】\n\`\`\`\n${a.text}\n\`\`\``)
    .join('')
  const fullMessage = message + textAppend

  // 图片附件提取 base64
  const imageAttachments = attachments
    .filter(a => a.type.startsWith('image/'))
    .map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }))

  // 用户消息气泡显示原始文字 + 附件名
  const displayText = message + attachments.map(a => `\n📎 ${a.name}`).join('')
  pushMessage("user", displayText, { attachments: attachments.map(a => ({ name: a.name, type: a.type, dataUrl: a.type.startsWith('image/') ? a.dataUrl : undefined })) })
  updateConversationTitleFromMessage(message || attachments[0]?.name || '')
  chatInput.value = ""
  pendingAttachments.value = []
  loading.chat = true
  isChatPaused.value = false
  customAiAutoAskStopRequested.value = false
  
  clearPlan()
  
  chatAbortController = new AbortController()

  let messageIndex = -1
  let traceMessage: any = null

  try {
    messageIndex = messages.value.length
    messages.value.push({
      role: "assistant",
      text: "",
      typing: true,
      agentName: aiNameOverride || getModelLabelById(modelOverride || selectedChatModel.value) || undefined
    })
    traceMessage = messages.value[messageIndex]
    ensureMessageTrace(traceMessage)
    
    const conversationHistory = messages.value
      .filter(m => !m.typing && m.text)
      .slice(-20)
      .map(m => ({ role: m.role, text: m.text }))
    
    if (!chatWs.isConnected.value) {
      chatWs.connect(`ws://${window.location.hostname}:17870/ws`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const chunkHandler = (chunk: any) => {
      if (chunk.type === "plan") {
        updatePlan(chunk.plan)
        syncPlanToMessage(traceMessage, chunk.plan)
      } else if (chunk.type === "detail") {
        const detail = chunk.detail || {}
        pushExecutionDetailToMessage(traceMessage, String(detail.stage || 'detail'), String(detail.text || ''), String(detail.time || ''))
      } else if (chunk.type === "mcp") {
        applyMcpEventToMessage(traceMessage, chunk.mcp || {})
      } else if (chunk.type === "task") {
        const taskData = chunk.task || {}
        const hasStepInfo = Boolean(taskData.stepId || taskData.title || taskData.error || taskData.stepStatus)
        if (hasStepInfo) {
          const title = String(taskData.title || taskData.stepId || taskData.status || 'task')
          const status = String(taskData.stepStatus || taskData.status || 'running')
          pushExecutionDetailToMessage(traceMessage, 'task', `${title} · ${status}`, String(taskData.time || ''))
        }
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
      } else if (chunk.type === "step") {
        const stepData = chunk.step || {}
        const stepText = String(stepData.text || '')
        const stepStatus = String(stepData.status || 'start')
        const prefix = stepStatus === 'done' ? '[完成] ' : stepStatus === 'error' ? '[失败] ' : '[进行] '
        if (stepText) {
          pushExecutionDetailToMessage(traceMessage, 'step', prefix + stepText, '')
        }
      } else if (chunk.type === "reply") {
        const replyText = String(chunk.reply || "")
        if (!chunk.delta) {
          messages.value[messageIndex].text = ""
        }
        enqueueTypewriter(messageIndex, replyText)
      } else if (chunk.type === "error") {
        throw new Error(String(chunk.error || "未知流式错误"))
      } else if (chunk.type === "done") {
        if (chunk.usage && messages.value[messageIndex]) {
          messages.value[messageIndex].meta = {
            ...messages.value[messageIndex].meta,
            total_tokens: chunk.usage.totalTokens,
            prompt_tokens: chunk.usage.promptTokens,
            completion_tokens: chunk.usage.completionTokens
          }
        }
        void loadScheduledTasks()
      }
    }

    const unsubscribe = chatWs.onChatChunk(chunkHandler)

    chatWs.sendChat({
      message: fullMessage,
      images: imageAttachments.length > 0 ? imageAttachments : undefined,
      conversationHistory,
      selectedSkillId: aiConfigOverride?.skillId || (selectedChatSkillIds.value.length === 1 ? selectedChatSkillIds.value[0] : ''),
      selectedSkillIds: aiConfigOverride?.skillId ? [aiConfigOverride.skillId] : selectedChatSkillIds.value,
      model: modelOverride || selectedChatModel.value,
      executionMode: chatExecutionMode.value,
      promptInstruction: aiConfigOverride?.prompt || '',
      allowedMcpServers: Array.isArray(aiConfigOverride?.mcpServers) ? aiConfigOverride?.mcpServers : undefined
    })

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error('请求中断'))
      }, 120000)

      chatWs.on('stream_end', () => {
        clearTimeout(timeout)
        unsubscribe()
        resolve(null)
      })

      chatWs.on('error', (payload: any) => {
        clearTimeout(timeout)
        unsubscribe()
        reject(new Error(payload?.message || 'WebSocket error'))
      })
    })

    await waitTypewriterDrain()
    if (messages.value[messageIndex]) {
      messages.value[messageIndex].typing = false
      messages.value[messageIndex].meta = {
        ...(messages.value[messageIndex].meta && typeof messages.value[messageIndex].meta === 'object'
          ? messages.value[messageIndex].meta
          : {}),
        animateOnLoad: true
      }
      void saveChatHistoryNow()
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
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === "assistant") {
        lastMsg.typing = false
        lastMsg.text = lastMsg.text || "用户取消了本次对话"
      } else {
        pushMessage("assistant", "用户取消了本次对话")
      }
      return null
    }

    if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === "assistant" && messages.value[messages.value.length - 1].typing) {
      messages.value.pop()
    }

    if (errorMessage.includes('ARK_API_KEY') || errorMessage.includes('未配置') || errorMessage.includes('请在 .env 中设置')) {
      ElMessage.error({
        message: '聊天 AI 功能暂不可用，请先配置大模型 API 密钥',
        duration: 0
      })
      pushMessage("assistant", "聊天 AI 功能暂不可用，请先配置大模型 API 密钥。")
    } else {
      pushMessage("assistant", `请求失败: ${errorMessage}`, null, { error: true })
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
  if (chatWs.isConnected.value) {
    chatWs.send({ type: 'chat_cancel', payload: { reason: 'user_pause' } })
  }
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
    return
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

function showMessageContextMenu(event: MouseEvent, text: string) {
  contextMenuTargetText.value = text || ''
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
  
  setTimeout(() => {
    const bubble = document.querySelector('.message-bubble.context-menu-target') as HTMLElement
    if (bubble) bubble.classList.remove('context-menu-target')
    const target = event.target as HTMLElement
    const parentBubble = target.closest('.message-bubble') as HTMLElement
    if (parentBubble) parentBubble.classList.add('context-menu-target')
  }, 0)
}

function copyMessageContent() {
  const selection = window.getSelection()
  const selectedText = selection?.toString()
  if (selectedText) {
    navigator.clipboard.writeText(selectedText)
    ElMessage.success('已复制选中内容')
  } else if (contextMenuTargetText.value) {
    navigator.clipboard.writeText(contextMenuTargetText.value)
    ElMessage.success('已复制')
  }
  hideContextMenu()
}

function pasteToInput() {
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
    } else {
      chatInput.value += text
    }
  }).catch(() => {
    ElMessage.error('无法访问剪贴板')
  })
  hideContextMenu()
}

function selectMessageAll() {
  const selection = window.getSelection()
  const messageText = document.querySelector('.message-bubble.context-menu-target .message-text')
  if (messageText) {
    const range = document.createRange()
    range.selectNodeContents(messageText)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  hideContextMenu()
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
  const isNeutralino = typeof window !== 'undefined' && (window as any).Neutralino
  if (isNeutralino) {
    handleNeutralinoAttach()
  } else {
    handleBrowserAttach()
  }
}

async function handleNeutralinoAttach() {
  const Neutralino = (window as any).Neutralino
  try {
    const result = await Neutralino.os.showOpenDialog('选择文件', {
      multiSelections: true,
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
        { name: '文档', extensions: ['pdf', 'txt', 'md', 'csv'] },
        { name: '代码', extensions: ['json', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'xml', 'yaml', 'yml'] }
      ]
    })
    const files = result.files || result
    if (!files || files.length === 0) return
    for (const filePath of files) {
      const name = filePath.split(/[/\\]/).pop() || 'unknown'
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const isText = /^(txt|md|csv|json|js|ts|py|java|c|cpp|html|css|xml|yaml|yml)$/i.test(ext)
      const isImage = /^(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(ext)
      let mime = ''
      if (isImage) {
        const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }
        mime = mimeMap[ext] || 'application/octet-stream'
      } else if (isText) {
        const textMimeMap: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', js: 'text/javascript', ts: 'text/typescript', py: 'text/x-python', java: 'text/x-java', c: 'text/x-c', cpp: 'text/x-cpp', html: 'text/html', css: 'text/css', xml: 'text/xml', yaml: 'text/yaml', yml: 'text/yaml' }
        mime = textMimeMap[ext] || 'text/plain'
      } else {
        mime = 'application/octet-stream'
      }
      if (isText) {
        const content = await Neutralino.filesystem.readFile(filePath)
        const blob = new Blob([content], { type: mime })
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        pendingAttachments.value.push({ name, type: mime, size: new Blob([content]).size, dataUrl, text: content })
      } else if (isImage) {
        const buffer = await Neutralino.filesystem.readBinaryFile(filePath)
        const blob = new Blob([buffer], { type: mime })
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        pendingAttachments.value.push({ name, type: mime, size: blob.size, dataUrl })
      } else {
        ElMessage.warning(`${name} 不支持的文件类型，已跳过`)
      }
    }
  } catch (error: any) {
    if (error?.message?.includes('rejected') || error?.code === 'NEUT_DIALOG_CANCELLED') return
    console.error('Neutralino file dialog error:', error)
    ElMessage.error('文件选择失败')
  }
}

function handleBrowserAttach() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.py,.java,.c,.cpp,.html,.css,.xml,.yaml,.yml'
  input.onchange = async () => {
    const files = Array.from(input.files || [])
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        ElMessage.warning(`${file.name} 超过 10MB 限制，已跳过`)
        continue
      }
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      let text: string | undefined
      if (file.type.startsWith('text/') || /\.(txt|md|csv|json|js|ts|py|java|c|cpp|html|css|xml|yaml|yml)$/i.test(file.name)) {
        text = await file.text()
      }
      pendingAttachments.value.push({ name: file.name, type: file.type, size: file.size, dataUrl, text })
    }
  }
  input.click()
}

function removeAttachment(index: number) {
  pendingAttachments.value.splice(index, 1)
}

const supportsVision = computed(() => {
  const modelId = (selectedChatModel.value || '').toLowerCase()
  const modelName = (config.value?.models?.find(m => m.id === selectedChatModel.value)?.modelName || '').toLowerCase()
  const combined = modelId + ' ' + modelName
  return /vision|vl[-_]|pro|gpt-4o|gemini|claude-3|haiku|sonnet|opus|qwen-vl|glm-4v|yi-vl|intern|llava|pixtral|mistral.*large/.test(combined)
})

async function handlePaste(event: ClipboardEvent) {
  if (!supportsVision.value) return
  const items = Array.from(event.clipboardData?.items || [])
  const imageItems = items.filter(item => item.type.startsWith('image/'))
  if (imageItems.length === 0) return
  event.preventDefault()
  for (const item of imageItems) {
    const file = item.getAsFile()
    if (!file) continue
    if (file.size > 10 * 1024 * 1024) {
      ElMessage.warning('粘贴的图片超过 10MB 限制')
      continue
    }
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
    const name = `粘贴图片_${Date.now()}.${file.type.split('/')[1] || 'png'}`
    pendingAttachments.value.push({ name, type: file.type, size: file.size, dataUrl })
    ElMessage.success('图片已添加到附件')
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function handleVoiceInput() {
  if (!voiceInput.isSupported()) {
    ElMessage.error('当前浏览器不支持语音识别')
    return
  }
  if (voiceInput.isRecording.value) {
    const fullText = voiceInput.getFullTranscript()
    if (fullText) {
      chatInput.value += (chatInput.value ? ' ' : '') + fullText
    }
    voiceInput.stop()
    showVoiceIndicator.value = false
  } else {
    voiceInput.reset()
    voiceInput.start()
    showVoiceIndicator.value = true
  }
}

watch(() => voiceInput.interimTranscript.value, (val) => {
  if (val && showVoiceIndicator.value) {
    const preview = chatInput.value + (chatInput.value ? ' ' : '') + voiceInput.transcript.value + val
    console.log('Voice preview:', preview)
  }
})

watch(() => voiceInput.isRecording.value, (recording) => {
  if (!recording && showVoiceIndicator.value) {
    const fullText = voiceInput.getFullTranscript()
    if (fullText) {
      chatInput.value += (chatInput.value ? ' ' : '') + fullText
    }
    showVoiceIndicator.value = false
  }
})

function openCustomAiAskDialog() {
  if (!availableModels.value.length) {
    ElMessage.warning(t('customAiNoModel'))
    return
  }
  void loadCustomAskAiList()
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

function mapAgentToCustomAskAiItem(agent: any): CustomAskAiItem {
  const name = String(agent?.name || '').trim() || getModelLabelById(String(agent?.modelId || '')) || 'AI'
  return {
    id: String(agent?.id || ''),
    modelId: String(agent?.modelId || ''),
    modelLabel: getModelLabelById(String(agent?.modelId || '')),
    name,
    avatarText: getAvatarText(name),
    prompt: String(agent?.prompt || '').trim(),
    skillId: String(agent?.skillId || '').trim(),
    mcpServers: Array.isArray(agent?.mcpServers) ? agent.mcpServers.map((v: unknown) => String(v || '').trim()).filter(Boolean) : []
  }
}

async function loadCustomAskAiList() {
  try {
    const res = await fetch(buildApiUrl('/api/agents'))
    const data = await res.json()
    if (!Array.isArray(data)) return
    customAskAiList.value = data
      .filter((agent: any) => String(agent?.modelId || '').trim())
      .map((agent: any) => mapAgentToCustomAskAiItem(agent))
    if (!customAskAiList.value.some(item => item.id === selectedCustomAskAiId.value)) {
      selectedCustomAskAiId.value = customAskAiList.value[0]?.id || ''
    }
  } catch (error) {
    console.error('加载代理列表失败:', error)
  }
}

async function addCustomAskAi() {
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
  try {
    const res = await fetch(buildApiUrl('/api/agents'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: displayName,
        role: 'analyst',
        modelId: customAiAskForm.modelId,
        prompt: String(customAiAskForm.prompt || '').trim(),
        skillId: String(customAiAskForm.skillId || '').trim(),
        mcpServers: Array.isArray(customAiAskForm.mcpServers) ? [...customAiAskForm.mcpServers] : [],
        executionMode: 'auto'
      })
    })
    const data = await res.json()
    if (!res.ok) {
      ElMessage.error(String(data?.error || '创建失败'))
      return
    }
    await loadCustomAskAiList()
    selectedCustomAskAiId.value = String(data?.id || selectedCustomAskAiId.value)
    ElMessage.success(t('customAiAdded'))
  } catch (error) {
    console.error('创建代理失败:', error)
    ElMessage.error('创建失败')
  }
}

async function removeCustomAskAi(id: string) {
  try {
    const res = await fetch(buildApiUrl(`/api/agents/${id}`), {
      method: 'DELETE'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      ElMessage.error(String(data?.error || '删除失败'))
      return
    }
    await loadCustomAskAiList()
    ElMessage.success(t('customAiRemoved'))
  } catch (error) {
    console.error('删除代理失败:', error)
    ElMessage.error('删除失败')
  }
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

async function checkBackendAlive(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:17870/api/health')
    if (!res.ok) return false
    const data = await res.json()
    return data?.ok === true
  } catch {
    return false
  }
}

async function spawnBackendIfNeeded() {
  const Neutralino = (window as any).Neutralino
  if (!Neutralino) return  // 开发环境，后端已由 npm run dev 启动

  try {
    if (await checkBackendAlive()) return

    // 必须先 init 才能使用 Neutralino API
    await new Promise<void>((resolve) => {
      Neutralino.init()
      window.addEventListener('ready', () => resolve(), { once: true })
      // 最多等 2 秒
      setTimeout(resolve, 2000)
    })

    // NL_PATH 由 Neutralino 运行时注入，指向 app 所在目录（与主程序同级）
    const nlPath: string = (window as any).NL_PATH || ''
    const serverBin = nlPath ? `${nlPath}/crabclaw-server` : './crabclaw-server'

    console.log('[Backend] NL_PATH:', nlPath, '-> binary:', serverBin)
    const result = await Neutralino.os.execCommand(
      `chmod +x "${serverBin}" 2>/dev/null; nohup "${serverBin}" > /tmp/crabclaw-server.log 2>&1 &`
    ).catch((e: any) => { console.warn('[Backend] execCommand failed:', e); return null })
    console.log('[Backend] execCommand result:', result)

    // 等待后端启动（最多 10 秒）
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (await checkBackendAlive()) {
        console.log('[Backend] Server ready after', (i + 1) * 500, 'ms')
        break
      }
    }
  } catch (e) {
    console.warn('[Backend] spawnBackendIfNeeded failed:', e)
  }
}

onMounted(async () => {
  isInitializing.value = true
  initProgress.value = 5

  await spawnBackendIfNeeded()
  initProgress.value = 10

  await Promise.all([
    loadScheduledTasks(),
    loadChatHistory(),
    loadChatStorageConfig(),
    loadTokenStats()
  ])
  initProgress.value = 60

  await loadCustomAskAiList()
  initProgress.value = 80

  await bootstrap()
  loadRemoteControlConfig()
  initProgress.value = 90

  chatWs.connect(`ws://${window.location.hostname}:17870/ws`)

  // remote_message: 仅用于微信消息面板展示原始消息，不再触发对话
  chatWs.on('remote_message', (payload: any) => {
    const msg = payload as { platform: string; text: string; sender: string; timestamp: number; msgType?: string }
    if (msg.platform === 'wechat') {
      pushWechatMessage({
        sender: msg.sender,
        text: msg.text,
        timestamp: msg.timestamp || Date.now(),
        msgType: msg.msgType,
      })
    }
  })

  // remote_agent_reply: 远程控制消息，作为内置Bot的子对话
  chatWs.on('remote_agent_reply', (payload: any) => {
    const ev = payload as {
      agentId: string
      agentName: string
      platform: string
      role: 'user' | 'assistant'
      text: string
      sender: string
      timestamp: number
    }
    const agentName = ev.agentName || 'CraBot'
    const platform = ev.platform.toLowerCase()
    const platformLabel = ev.platform.toUpperCase()
    
    // 使用平台作为对话标识，每个平台一个对话
    const convId = `remote-${platform}`

    // 平台名称中文映射
    const platformNames: Record<string, string> = {
      'wechat': '微信',
      'telegram': 'Telegram',
      'qq': 'QQ',
      'feishu': '飞书',
      'discord': 'Discord',
      'slack': 'Slack',
      'teams': 'Teams',
      'whatsapp': 'WhatsApp'
    }
    const platformCNName = platformNames[platform] || platformLabel

    // 找或创建该平台的专属对话（作为内置Bot的子对话）
    let conv = conversations.value.find(c => c.id === convId)
    if (!conv) {
      conv = {
        id: convId,
        title: `${platformCNName}Bot`,
        agentId: 'builtin-bot',
        messages: [{ role: 'assistant', text: `🤖 ${agentName} 已就绪，等待来自 ${platformCNName} 的任务…`, agentName }]
      }
      conversations.value.unshift(conv)
    }

    const targetConv = conv!
    targetConv.messages.push({
      role: ev.role,
      text: ev.text,
      agentName: ev.role === 'assistant' ? agentName : ev.sender,
    })
    if (targetConv.messages.length > 200) targetConv.messages = targetConv.messages.slice(-200)



    scheduleSaveChatHistory()
  })

  backendPollTimer = setInterval(() => {
    void checkBackend()
    void loadState()
  }, 5000) as unknown as ReturnType<typeof setInterval> | null
  window.addEventListener('pointerdown', handleGlobalPointerDown)
  window.addEventListener('scroll', handleGlobalScroll, true)
  window.addEventListener('resize', handleGlobalScroll)
  window.addEventListener('keydown', handleGlobalKeydown)

  initProgress.value = 100

  await new Promise(resolve => setTimeout(resolve, 1000))
  isInitializing.value = false
})

watch(
  () => [config.value.settings.activeModelId, config.value.models.map(m => m.id).join(',')],
  () => {
    syncSelectedChatModelWithConfig()
    const validModelIds = new Set(config.value.models.map(m => m.id))
    customAskAiList.value = customAskAiList.value
      .filter(item => validModelIds.has(item.modelId))
      .map(item => ({
        ...item,
        modelLabel: getModelLabelById(item.modelId)
      }))
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
  if (officePollTimer) {
    clearInterval(officePollTimer)
    officePollTimer = null
  }
  if (taskLogsInterval) {
    clearInterval(taskLogsInterval)
    taskLogsInterval = null
  }
  chatWs.disconnect()
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
/* 三列布局 */
.three-column-layout {
  display: flex;
  height: 100vh;
  background: #f0f4fa;
}

/* 第一列：导航侧边栏 */
.nav-sidebar {
  width: 200px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e8e8e8;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

.nav-sidebar.collapsed {
  width: 60px;
}

.nav-sidebar:not(.collapsed) {
  width: 200px;
}

.nav-sidebar .sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
  min-height: 56px;
}

.nav-sidebar.collapsed .sidebar-header {
  justify-content: center;
  padding: 12px 8px;
}

.nav-sidebar .logo {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.nav-sidebar.collapsed .logo {
  justify-content: center;
}

.nav-sidebar .logo-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  background: linear-gradient(135deg, #4a90d9, #357abd);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}

.nav-sidebar .logo-text h1 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.nav-sidebar .sidebar-nav {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-sidebar .nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #475569;
  transition: all 0.2s;
  overflow: hidden;
}

.nav-sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}

.nav-sidebar.collapsed .nav-item span {
  display: none;
}

.nav-sidebar .nav-item:hover {
  background: #f1f5f9;
}

.nav-sidebar .nav-item.active {
  background: #e8f0fe;
  color: #4a90d9;
}

/* 第二列：代理侧边栏 */
.agent-sidebar {
  width: 240px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.agent-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.agent-sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.agent-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.agent-item {
  margin-bottom: 4px;
  border-radius: 8px;
  overflow: hidden;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.agent-header:hover {
  background: #f8fafc;
}

.agent-item.active .agent-header {
  background: #e8f0fe;
}

.agent-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4a90d9, #357abd);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.agent-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}

.agent-expand-icon {
  font-size: 14px;
  color: #94a3b8;
  transition: transform 0.2s;
}

.agent-item.expanded .agent-expand-icon {
  transform: rotate(90deg);
}

.agent-history {
  background: #fafafa;
  padding: 4px 0;
}

.agent-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 40px;
  cursor: pointer;
  font-size: 12px;
  color: #64748b;
  transition: background 0.2s;
}

.agent-history-item:hover {
  background: #f1f5f9;
}

.agent-history-item.active {
  background: #e8f0fe;
  color: #4a90d9;
}

.agent-history-item.remote-control {
  background: linear-gradient(90deg, rgba(100, 116, 139, 0.05) 0%, transparent 100%);
  border-left: 2px solid #64748b;
}

.agent-history-item .context-menu-trigger {
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s;
}

.agent-history-item:hover .context-menu-trigger {
  opacity: 1;
}

.remote-icon {
  font-size: 14px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conversation-context-menu {
  position: fixed;
  background: #ffffff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 4px;
  z-index: 9999;
  min-width: 140px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: #334155;
  border-radius: 4px;
  transition: background 0.2s;
}

.context-menu-item:hover {
  background: #f1f5f9;
}

.context-menu-item.danger {
  color: #ef4444;
}

.context-menu-item.danger:hover {
  background: #fef2f2;
}

.agent-history-item .history-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-empty {
  padding: 12px 12px 12px 40px;
  font-size: 12px;
  color: #94a3b8;
}

/* 第三列：主内容 */
.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

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

:deep(.md-table-wrapper) {
  overflow-x: auto;
  margin: 12px 0;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

:deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

:deep(.md-table th) {
  background: #f5f7fa;
  padding: 10px 16px;
  text-align: left;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #e4e7ed;
}

:deep(.md-table td) {
  padding: 10px 16px;
  color: #606266;
  border-bottom: 1px solid #ebeef5;
}

:deep(.md-table tr:last-child td) {
  border-bottom: none;
}

:deep(.md-table tr:hover td) {
  background: #f5f7fa;
}

:deep(.md-code) {
  background: #f3f4f6;
  border-radius: 8px;
  margin: 12px 0;
  overflow: hidden;
}

:deep(.md-code-lang) {
  background: #e5e7eb;
  color: #374151;
  font-size: 12px;
  padding: 6px 12px;
  font-family: monospace;
}

:deep(.md-code code) {
  display: block;
  padding: 16px;
  overflow-x: auto;
  font-family: 'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #111827;
}

.hljs-keyword { color: #569cd6; }
.hljs-string { color: #ce9178; }
.hljs-number { color: #b5cea8; }
.hljs-comment { color: #6a9955; }
.hljs-function { color: #dcdcaa; }
.hljs-class { color: #4ec9b0; }
.hljs-variable { color: #9cdcfe; }
.hljs-operator { color: #d4d4d4; }
.hljs-punctuation { color: #d4d4d4; }
.hljs-property { color: #9cdcfe; }
.hljs-attr { color: #9cdcfe; }
.hljs-tag { color: #569cd6; }
.hljs-name { color: #569cd6; }
.hljs-attribute { color: #9cdcfe; }
.hljs-selector-class { color: #d7ba7d; }
.hljs-selector-id { color: #d7ba7d; }
.hljs-built_in { color: #4ec9b0; }
.hljs-literal { color: #569cd6; }
.hljs-type { color: #4ec9b0; }
.hljs-params { color: #9cdcfe; }
.hljs-meta { color: #9b9b9b; }
.hljs-regexp { color: #d16969; }

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
  border-color: var(--el-border-color);
  background: var(--el-fill-color-light);
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
  margin-left: 18px;
  margin-right: 18px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: linear-gradient(135deg, #fffbeb, #fff7ed);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.confirm-title {
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 6px;
}

.confirm-title::before {
  content: '⚠️';
  font-size: 14px;
}

.confirm-tool {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  background: rgba(255,255,255,0.7);
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 6px;
}

.confirm-args {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
  background: rgba(255,255,255,0.5);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #fef3c7;
}

.confirm-actions {
  margin-top: 12px;
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

.scheduled-tasks-section {
  margin: 14px 20px;
  padding: 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
}

.scheduled-tasks-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.tasks-loading, .tasks-empty {
  text-align: center;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.scheduled-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scheduled-task-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  background: var(--el-fill-color-light);
}

.scheduled-task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.scheduled-task-name {
  font-weight: 500;
  font-size: 14px;
}

.scheduled-task-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scheduled-task-row {
  display: flex;
  gap: 4px;
}

.scheduled-task-label {
  color: var(--el-text-color-regular);
}

.scheduled-task-tool {
  font-family: monospace;
  font-size: 11px;
}

.scheduled-task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.task-logs-section {
  margin: 14px 20px;
  padding: 10px;
  border: 1px solid #1f2937;
  border-radius: 8px;
  background: #0b1220;
}

.task-logs-inline {
  margin: 10px 0 0;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.logs-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logs-header h4 {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
}

.task-log-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.task-log-item {
  border: 1px solid #1f2937;
  border-radius: 4px;
  padding: 6px 8px;
  background: #0f172a;
  color: #e5e7eb;
  font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  line-height: 1.35;
}

.task-log-item.log-success {
  border-left: 2px solid #22c55e;
}

.task-log-item.log-error {
  border-left: 2px solid #ef4444;
}

.task-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.task-log-time {
  font-size: 10px;
  color: #94a3b8;
}

.task-log-result {
  font-size: 11px;
  color: #d1d5db;
  white-space: pre-wrap;
  word-break: break-all;
}

.task-log-error {
  font-size: 11px;
  color: #f87171;
  white-space: pre-wrap;
  word-break: break-all;
}

.task-automation-actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.tasks-settings-panel {
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
}

.tasks-settings-panel .panel-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-primary);
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

.office-entry-btn {
  border-radius: 10px;
}

.monitor-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  line-height: 1;
}
.monitor-toggle-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.office-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-weight: 600;
}

/* 技能详情弹窗 */
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
</style>
