/**
 * Intent Analyzer - 意图分析器
 * 
 * 判断用户问题是否需要调用 MCP 工具。
 * 采用关键词匹配 + 启发式规则，无需额外 LLM 调用。
 * 
 * 设计原则：
 * - 普通聊天/知识问答 → 不调用工具（快速响应）
 * - 需要外部能力（文件、浏览器、数据库等）→ 调用工具
 */

// 工具相关关键词映射
const TOOL_KEYWORDS: Record<string, string[]> = {
  filesystem: [
    '文件', '目录', '文件夹', '读取', '写入', '删除', '复制', '移动', '重命名',
    'file', 'directory', 'folder', 'read', 'write', 'delete', 'copy', 'move', 'rename',
    'path', '路径', '保存', '打开文件', '创建文件', '修改文件', 'list', 'ls', 'dir'
  ],
  browser: [
    '打开网页', '浏览', '访问', '网页', '浏览器', 'chrome', 'firefox', 'safari',
    'browser', 'open url', 'visit', 'webpage', 'website', 'navigate', 'click', '截图',
    'screenshot', '页面', '网站', '链接', 'link', 'url'
  ],
  shell: [
    '执行', '命令', '终端', 'shell', 'cmd', 'powershell', 'bash', 'run', 'execute',
    'command', 'terminal', '脚本', 'script', '安装', 'install', '运行', 'compile'
  ],
  database: [
    '数据库', 'mysql', 'postgres', 'sqlite', 'mongodb', 'redis', 'sql', 'query',
    'database', 'db', '表', 'table', '记录', 'record', '查询数据', 'select'
  ],
  memory: [
    '记忆', '记住', '回忆', '之前', '上次', '历史', 'memory', 'remember', 'recall',
    'previous', 'earlier', 'before', '上次聊', '之前说'
  ],
  fetch: [
    'http', 'api', 'request', 'fetch', 'download', '下载', '请求', '接口', 'post', 'get',
    'curl', 'wget', '网络请求', '调用接口', '爬取'
  ],
  search: [
    '搜索', 'search', '查找', 'find', 'google', 'bing', '百度', 'search web',
    '网上', '互联网', 'search for', 'look up'
  ]
}

// 简单对话模式（不需要工具）
const CHAT_PATTERNS = [
  /^(你好|hi|hello|在吗|在不在|谢谢|thanks|thank you|嗨|哈喽|早上好|下午好|晚上好|晚安|再见|拜拜|bye)\s*[!！.。~]?\s*$/i,
  /^(怎么样|如何|什么|为什么|怎么|哪个|谁|多少|几|吗|呢|吧|啊|呀|嗯|哦|哈|嘿)$/,
  /^(好的|收到|明白|了解|知道|懂了|ok|okay|sure|got it|understood)$/i,
  /^(翻译|translate|解释|explain|说明|describe)\s*/i,
  /^(写|创作|创作|编|写个|写首|写篇|写封)\s*(诗|故事|文章|邮件|信|代码|程序|函数|类)/i,
  /^(计算|算一下|calculate|compute)\s*/i,
  /^(你好|hello|hi)\s*[!！.。~]?\s*/i
]

// 知识问答模式（不需要工具）
const KNOWLEDGE_PATTERNS = [
  /^(什么是|是什么|是什么意思|概念|定义|介绍|简介|概述)/i,
  /^(如何|怎么|怎样)\s*(学习|使用|安装|配置|搭建|部署|实现|设计)/i,
  /^(区别|差异|不同|比较|对比|vs|versus)/i,
  /^(优点|缺点|优势|劣势|利弊|pros?|cons?)/i,
  /^(为什么|原因|理由|why)/i,
  /^(举例|例如|比如|example|such as|for example)/i,
  /^(步骤|流程|方法|教程|guide|tutorial|howto|how-to)/i,
  /^(推荐|建议|suggest|recommend)/i
]

/**
 * 分析用户意图，判断是否需要调用工具
 * @param message 用户消息
 * @returns true 需要调用工具，false 不需要
 */
export function needTool(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false

  // 1. 检查是否为简单对话（不需要工具）
  for (const pattern of CHAT_PATTERNS) {
    if (pattern.test(text)) {
      return false
    }
  }

  // 2. 检查是否为知识问答（不需要工具）
  for (const pattern of KNOWLEDGE_PATTERNS) {
    if (pattern.test(text)) {
      return false
    }
  }

  // 3. 检查是否包含工具相关关键词
  const lowerText = text.toLowerCase()
  for (const [toolType, keywords] of Object.entries(TOOL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return true
      }
    }
  }

  // 4. 启发式规则：短问题通常不需要工具
  if (text.length < 10 && !text.includes(' ')) {
    return false
  }

  // 5. 默认不调用工具（保守策略）
  return false
}

/**
 * 获取可能需要使用的工具类型
 * @param message 用户消息
 * @returns 工具类型数组
 */
export function getRelevantToolTypes(message: string): string[] {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return []

  const relevantTypes: string[] = []
  
  for (const [toolType, keywords] of Object.entries(TOOL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        relevantTypes.push(toolType)
        break
      }
    }
  }

  return relevantTypes
}

/**
 * 判断消息是否为简单问候
 * @param message 用户消息
 * @returns true 是简单问候
 */
export function isSimpleGreeting(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false

  const greetingPattern = /^(你好|hi|hello|在吗|在不在|谢谢|thanks|thank you|嗨|哈喽|早上好|下午好|晚上好|晚安|再见|拜拜|bye)\s*[!！.。~]?\s*$/i
  return greetingPattern.test(text)
}
