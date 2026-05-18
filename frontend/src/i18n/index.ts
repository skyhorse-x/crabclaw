import { createI18n } from 'vue-i18n'

// 基础语言配置
const messages = {
  'zh-CN': {
    appTitle: '桌面AI助手',
    initializing: '小螃蟹启动中',
    
    // 通用
    chatEmpty: '开始一段新对话吧',
    agentDashboard: '智能体面板',
    mcpMarketTitle: 'MCP 市场',
    skillMarketTitle: '技能市场',
    taskPanelTitle: '定时任务面板',
    basicSettings: '基础设置',
    
    // 导航栏
    navChat: '对话',
    navAgents: '智能体',
    navMcp: 'MCP服务',
    navSkills: '技能',
    navTasks: '定时任务',
    navControl: '远程控制',
    navSettings: '设置',
    sidebarFold: '折叠侧边栏',
    
    // 控制面板
    controlPanelTitle: '远程控制面板',
    controlPanelDesc: '远程控制您的桌面 Agent',
    controlGlobal: '全局设置',
    controlGlobalEnable: '启用远程控制',
    controlCommandPrefix: '命令前缀',
    controlVerifyCode: '验证码',
    controlEnable: '启用',
    controlBotToken: '机器人令牌',
    controlChatId: '聊天ID',
    controlChannelId: '频道ID',
    controlSave: '保存设置',
    controlSaved: '设置已保存',
    controlWebhookUrl: 'Webhook 地址',
    controlChannelTelegram: 'Telegram',
    controlTestMessage: '测试消息',
    controlTestMessagePlaceholder: '输入测试消息内容',
    controlSendTest: '发送测试',
    controlChannelQq: 'QQ',
    controlBotId: '机器人 ID',
    controlWebhook: 'Webhook',
    controlChannelWechat: '企业微信',
    controlChannelFeishu: '飞书',
    controlAppId: '应用 ID',
    controlAppSecret: '应用密钥',
    controlChannelDiscord: 'Discord',
    controlChannelSlack: 'Slack',
    controlChannelTeams: 'Microsoft Teams',
    controlChannelWhatsApp: 'WhatsApp',
    controlTwilioSid: 'Twilio Account SID',
    controlTwilioToken: 'Twilio Auth Token',
    controlFromNumber: '发送号码',
    
    // 通用
    add: '添加',
    save: '保存',
    saveSuccess: '保存成功',
    enabled: '已启用',
    disabled: '已禁用',
    copyMessage: '复制',
    copied: '已复制',
    
    // 定时任务
    scheduledTasksTitle: '定时任务',
    scheduledTasksEmpty: '暂无定时任务',
    
    // 设置
    settingsUsername: '用户名',
    settingsLanguage: '语言',
    settingsTheme: '主题',
    settingsApiBase: 'API基础地址',
    settingsApiKey: 'API密钥',
    settingsProxy: '网络代理',
    settingsProxyEnable: '启用代理',
    settingsProxyProtocol: '代理协议',
    settingsProxyHost: '主机地址',
    settingsProxyPort: '端口',
    settingsProxyUsername: '用户名（可选）',
    settingsProxyPassword: '密码（可选）'
  },
  'en-US': {
    appTitle: 'Desktop AI Assistant',
    initializing: 'Initializing...',
    
    // Navigation
    navChat: 'Chat',
    navAgents: 'Agents',
    navMcp: 'MCP Services',
    navSkills: 'Skills',
    navTasks: 'Scheduled Tasks',
    navControl: 'Remote Control',
    navSettings: 'Settings',
    sidebarFold: 'Fold Sidebar',
    
    // Control Panel
    controlPanelTitle: 'Remote Control Panel',
    controlPanelDesc: 'Control your desktop agent remotely',
    controlGlobal: 'Global Settings',
    controlGlobalEnable: 'Enable Remote Control',
    controlCommandPrefix: 'Command Prefix',
    controlVerifyCode: 'Verification Code',
    controlEnable: 'Enable',
    controlBotToken: 'Bot Token',
    controlChatId: 'Chat ID',
    controlChannelId: 'Channel ID',
    controlSave: 'Save Settings',
    controlSaved: 'Settings saved',
    controlWebhookUrl: 'Webhook URL',
    controlChannelTelegram: 'Telegram',
    controlTestMessage: 'Test Message',
    controlTestMessagePlaceholder: 'Enter test message',
    controlSendTest: 'Send Test',
    controlChannelQq: 'QQ',
    controlBotId: 'Bot ID',
    controlWebhook: 'Webhook',
    controlChannelWechat: 'WeChat Work',
    controlChannelFeishu: 'Feishu',
    controlAppId: 'App ID',
    controlAppSecret: 'App Secret',
    controlChannelDiscord: 'Discord',
    controlChannelSlack: 'Slack',
    controlChannelTeams: 'Microsoft Teams',
    controlChannelWhatsApp: 'WhatsApp',
    controlTwilioSid: 'Twilio Account SID',
    controlTwilioToken: 'Twilio Auth Token',
    controlFromNumber: 'From Number',
    
    // Common
    chatEmpty: 'Start a new conversation',
    agentDashboard: 'Agent Dashboard',
    mcpMarketTitle: 'MCP Market',
    skillMarketTitle: 'Skill Market',
    taskPanelTitle: 'Task Panel',
    basicSettings: 'Basic Settings',
    add: 'Add',
    save: 'Save',
    saveSuccess: 'Settings saved',
    enabled: 'Enabled',
    disabled: 'Disabled',
    copyMessage: 'Copy',
    copied: 'Copied',
    
    // Tasks
    scheduledTasksTitle: 'Scheduled Tasks',
    scheduledTasksEmpty: 'No scheduled tasks',
    
    // Settings
    settingsUsername: 'Username',
    settingsLanguage: 'Language',
    settingsTheme: 'Theme',
    settingsApiBase: 'API Base URL',
    settingsApiKey: 'API Key',
    settingsProxy: 'Network Proxy',
    settingsProxyEnable: 'Enable Proxy',
    settingsProxyProtocol: 'Proxy Protocol',
    settingsProxyHost: 'Host',
    settingsProxyPort: 'Port',
    settingsProxyUsername: 'Username (Optional)',
    settingsProxyPassword: 'Password (Optional)'
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages
})

export default i18n