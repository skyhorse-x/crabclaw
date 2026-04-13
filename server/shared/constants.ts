/**
 * 常量配置
 */

import * as path from 'node:path'

const CWD = process.cwd()
const PROJECT_ROOT = path.basename(CWD) === 'server' ? path.dirname(CWD) : CWD
const SERVER_ROOT = path.join(PROJECT_ROOT, 'server')

/**
 * 路径配置
 */
export const PATHS = {
  DATA_DIR: path.join(SERVER_ROOT, 'data'),
  CONFIG_PATH: path.join(SERVER_ROOT, 'data', 'app-config.json'),
  SKILLS_DIR: path.join(SERVER_ROOT, 'data', 'skills'),
  LOGS_DIR: path.join(SERVER_ROOT, 'logs'),
  SERVER_LOG: path.join(SERVER_ROOT, 'logs', 'server.log'),
  BRIDGE_PATH: path.join(SERVER_ROOT, 'bridge', 'action-runner.mjs'),
  MCP_CONFIG_PATH: path.join(SERVER_ROOT, 'mcp-config.json')
} as const

/**
 * 默认配置
 */
export const DEFAULTS = {
  PORT: 17870,
  THEME: 'light',
  LANGUAGE: 'zh-CN',
  MODEL_PROVIDER: 'openai',
  MODEL_NAME: 'gpt-4o',
  API_BASE_URL: 'https://api.openai.com/v1'
} as const

export const DEFAULT_CONFIG = {
  settings: {
    backendPort: 17870,
    theme: 'light',
    language: 'zh-CN',
    activeModelId: '',
    skillsDir: PATHS.SKILLS_DIR
  },
  models: [],
  skills: [],
  tasks: []
} as const

/**
 * 聊天系统提示词基础模板 - 智能助手模式
 */
export const CHAT_SYSTEM_PROMPT_BASE = [
  '你是 Desktop Agent Studio 的智能助手。',
  '',
  '【核心原则】',
  '1. 你有权限调用 MCP 工具来获取信息或执行操作',
  '2. 当你不知道答案或需要最新信息时，**主动**调用工具',
  '3. 不要说"我没有这个信息"，而是立即去获取',
  '',
  '【何时主动调用工具】',
  '✓ 不知道答案时 → 立即搜索或查询',
  '✓ 需要最新信息时（天气、股价、新闻）→ 立即获取',
  '✓ 用户问题超出知识范围 → 主动查找',
  '✓ 用户要求操作（打开网站、读文件）→ 立即执行',
  '✗ 知道答案且不需要验证 → 直接回答',
  '',
  '【工作流程】',
  '1. 收到问题',
  '2. 判断：我知道答案吗？需要验证吗？',
  '3. 如果需要信息/操作 → 立即调用 MCP',
  '4. 获取结果后 → 组织答案返回',
  '',
  '【工具调用格式】',
  '执行技能：```skill:技能ID```',
  '调用MCP：```mcp:{"server":"服务器","tool":"工具名","args":{}}```',
  '',
  '【示例】',
  '用户：今天黄金价格？',
  '→ 你不知道实时价格，应该调用 fetch 获取 → 返回：今日黄金...（从工具获取）',
  '',
  '用户：你好吗？',
  '→ 你知道答案 → 回复：我很好，谢谢！有什么可以帮你的吗？',
  '',
  '用户：帮我打开Chrome',
  '→ 调用 MCP 执行操作 → 返回：已打开Chrome'
].join('\n')

/**
 * 环境变量配置
 */
export const ENV = {
  ARK_API_KEY: process.env.ARK_API_KEY || '',
  ARK_API_URL: process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/responses',
  ARK_MODEL: process.env.ARK_MODEL || 'doubao-seed-2-0-lite-260215',
  DESKTOP_AGENT_PORT: process.env.DESKTOP_AGENT_PORT,
  MCP_MARKET_API: process.env.MCP_MARKET_API || 'https://glama.ai/api/mcp/v1/servers',
  SKILL_MARKET_API: process.env.SKILL_MARKET_API || 'https://clawhub.ai/api/v1/skills?sort=downloads',
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO'
} as const

/**
 * HTTP 相关常量
 */
export const HTTP = {
  DEFAULT_HEADERS: {
    'content-type': 'application/json; charset=utf-8'
  },
  CORS_HEADERS: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  },
  TIMEOUT_MS: 120000,
  MCP_TIMEOUT_MS: 60000,
  MAX_SYSTEM_PROMPT_CHARS: 12000,
  MAX_USER_MESSAGE_CHARS: 6000,
  MAX_LOG_PAYLOAD_CHARS: 1500,
  MAX_EXTRA_SUMMARY_CHARS: 1400
} as const

/**
 * 日志级别
 */
export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const

/**
 * 缓存配置
 */
export const CACHE = {
  DEFAULT_TTL: 5 * 60 * 1000, // 5 分钟
  MAX_SIZE: 1000,
  CLEANUP_INTERVAL: 60 * 1000 // 1 分钟
} as const
