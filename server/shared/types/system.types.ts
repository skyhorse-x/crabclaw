/**
 * 系统和聊天相关类型定义
 */

/**
 * 系统状态
 */
export interface SystemState {
  mouse: {
    x: number
    y: number
  }
  screen: {
    width: number
    height: number
  }
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  meta?: string
  typing?: boolean
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  message: string
  selectedSkillId?: string
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  ok: boolean
  reply: string
  action?: {
    type: 'skill' | 'mcp'
    payload?: any
  }
}
