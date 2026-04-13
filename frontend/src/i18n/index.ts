import { createI18n } from 'vue-i18n'

// 基础语言配置
const messages = {
  'zh-CN': {
    appTitle: '桌面AI助手',
    initializing: '启动中...',
    
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
    
    // 通用
    add: '添加',
    save: '保存',
    enabled: '已启用',
    disabled: '已禁用',
    
    // 定时任务
    scheduledTasksTitle: '定时任务',
    scheduledTasksEmpty: '暂无定时任务',
    
    // 设置
    settingsUsername: '用户名',
    settingsLanguage: '语言',
    settingsTheme: '主题',
    settingsApiBase: 'API基础地址',
    settingsApiKey: 'API密钥'
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
    
    // Common
    add: 'Add',
    save: 'Save',
    enabled: 'Enabled',
    disabled: 'Disabled',
    
    // Tasks
    scheduledTasksTitle: 'Scheduled Tasks',
    scheduledTasksEmpty: 'No scheduled tasks',
    
    // Settings
    settingsUsername: 'Username',
    settingsLanguage: 'Language',
    settingsTheme: 'Theme',
    settingsApiBase: 'API Base URL',
    settingsApiKey: 'API Key'
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages
})

export default i18n