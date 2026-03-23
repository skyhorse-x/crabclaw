/**
 * 常量配置
 */

import * as path from 'node:path'

const CWD = process.cwd()

/**
 * 路径配置
 */
export const PATHS = {
  DATA_DIR: path.join(CWD, 'data'),
  CONFIG_PATH: path.join(CWD, 'data', 'app-config.json'),
  SKILLS_DIR: path.join(CWD, 'data', 'skills'),
  LOGS_DIR: path.join(CWD, 'server', 'logs'),
  SERVER_LOG: path.join(CWD, 'server', 'logs', 'server.log'),
  BRIDGE_PATH: path.join(CWD, 'server', 'bridge', 'action-runner.mjs'),
  MCP_CONFIG_PATH: path.join(CWD, 'mcp-config.json')
} as const

/**
 * 默认配置
 */
export const DEFAULTS = {
  PORT: 17871,
  THEME: 'light',
  LANGUAGE: 'zh-CN',
  MODEL_PROVIDER: 'openai',
  MODEL_NAME: 'gpt-4o',
  API_BASE_URL: 'https://api.openai.com/v1'
} as const

export const DEFAULT_CONFIG = {
  settings: {
    backendPort: 17871,
    theme: 'light',
    language: 'zh-CN',
    activeModelId: ''
  },
  models: [],
  skills: [],
  tasks: []
} as const

/**
 * 聊天系统提示词基础模板
 */
export const CHAT_SYSTEM_PROMPT_BASE = [
  '你是 Desktop Agent Studio 的聊天助手。',
  '你可以帮助用户执行技能和调用 MCP 工具。',
  '当用户请求执行操作时，你可以通过返回特定格式的 JSON 来触发技能或 MCP 工具。',
  '',
  '## 可用功能：',
  '',
  '### 1. 执行技能',
  '返回格式：```skill:技能 ID```',
  '例如：```skill:code-review```',
  '',
  '### 2. 调用 MCP 工具',
  '返回格式：```mcp:{"server":"服务器名","tool":"工具名","args":{}}```',
  '例如：```mcp:{"server":"filesystem","tool":"read_file","args":{"path":"/tmp/test.txt"}}```',
  '',
  '## 规则：',
  '1. 只有在用户明确请求执行操作时才返回上述格式',
  '2. 其他情况下正常对话',
  '3. 回答使用简体中文，直接、清晰、简短。'
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
  }
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
