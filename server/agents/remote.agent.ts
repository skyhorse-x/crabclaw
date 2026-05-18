/**
 * RemoteAgent — CraBot 远程控制内置代理
 *
 * 以 "CraBot" 身份对外响应远程平台（微信/Telegram/QQ/飞书）的消息。
 * 每个平台一个独立 Agent 实例，维护独立对话历史，通过 handleChatStream
 * 处理任务并回复原平台，同时向前端广播展示。
 *
 * 正在输入机制：
 *   - Telegram: 每 4s 调用 sendChatAction(typing)，API 5s 过期，循环刷新直到任务完成
 *   - 微信 iLink: 调用 notifystart（协议无持续 typing，发一次即可）
 *   - 其他平台: noop
 */

import { logger } from '../services/logger.service'
import { wsService } from '../services/websocket.service'
import { handleChatStream, ensureReadableText } from '../handlers/chat.handler'
import { remoteControlLogService } from '../services/remote-control-log.service'

export const CRABOT_NAME = 'CraBot'

const CRABOT_SYSTEM_PROMPT = `你是 CraBot，一个通过远程渠道（微信/Telegram）控制本机的智能代理。

你的职责：
- 忠实执行远程用户发来的任务指令
- 任务完成后用简洁的中文回复结果
- 如果任务涉及文件/代码/命令，直接使用可用工具执行，不要只给建议
- 回复保持简洁，去掉多余的客套话，直接说结果

注意：你正在代表用户本人在本机上操作，拥有完整的工具使用权限。`

export type RemotePlatform = 'wechat' | 'telegram' | 'qq' | 'feishu'

export interface RemoteMessage {
  platform: RemotePlatform
  text: string
  sender: string
  timestamp: number
  msgType?: string
}

/** 平台回复函数 — 由各平台插件注册 */
export type PlatformReplier = (text: string, sender: string) => Promise<void>

/**
 * 正在输入指示函数 — 由各平台插件注册。
 * 调用一次表示"开始输入"，返回一个 stop 函数用于停止。
 * sender: 要对谁显示 typing（用于 Telegram chatId 等）
 */
export type TypingIndicatorFn = (sender: string) => () => void

interface HistoryEntry {
  role: 'user' | 'assistant'
  text: string
}

const MAX_HISTORY = 20

export class RemoteAgent {
  readonly id: string
  readonly platform: RemotePlatform
  readonly displayName = CRABOT_NAME

  private history: HistoryEntry[] = []
  private replier: PlatformReplier | null = null
  private typingIndicator: TypingIndicatorFn | null = null
  private busy = false
  private abortController: AbortController | null = null
  private pendingQueue: RemoteMessage[] = []
  private processing = false

  constructor(platform: RemotePlatform) {
    this.id = `remote-agent-${platform}`
    this.platform = platform
    logger.info(`[CraBot] 创建 ${CRABOT_NAME} 代理: platform=${platform}`)
  }

  registerReplier(fn: PlatformReplier): void {
    this.replier = fn
    logger.info(`[CraBot] 注册回复函数: ${this.id}`)
  }

  /**
   * 注册"正在输入"指示函数。
   * fn(sender) 开始 typing，返回值是 stop()。
   */
  registerTypingIndicator(fn: TypingIndicatorFn): void {
    this.typingIndicator = fn
    logger.info(`[CraBot] 注册 typing 指示器: ${this.id}`)
  }

  async receive(msg: RemoteMessage): Promise<void> {
    if (!msg.text.trim()) return

    this.pendingQueue.push(msg)
    logger.info(`[CraBot] ${this.id} 消息已入队: ${msg.text.slice(0, 40)} (队列长度: ${this.pendingQueue.length})`)

    if (!this.processing) {
      await this.processNext()
    }
  }

  private async processNext(): Promise<void> {
    if (this.pendingQueue.length === 0) {
      this.processing = false
      return
    }

    this.processing = true
    const msg = this.pendingQueue.shift()!

    this.busy = true
    this.abortController = new AbortController()
    this.history.push({ role: 'user', text: msg.text })
    this.broadcastToFrontend('user', msg.text, msg.sender)
    remoteControlLogService.info('message_processing', this.platform, `开始处理任务: ${msg.text.slice(0, 200)}`, undefined, msg.sender)
    logger.info(`[CraBot] ${this.id} 开始处理任务: ${msg.text.slice(0, 200)} (队列剩余: ${this.pendingQueue.length})`)

    // 启动"正在输入"提示
    const stopTyping = this.typingIndicator ? this.typingIndicator(msg.sender) : () => {}
    remoteControlLogService.info('typing_start', this.platform, '开始 typing 提示', undefined, msg.sender)

    let fullReply = ''

    try {
      const conversationHistory = this.history
        .slice(-MAX_HISTORY)
        .slice(0, -1)
        .map(h => ({ role: h.role, text: h.text }))

      const stream = handleChatStream(
        msg.text,
        { signal: this.abortController.signal, promptInstruction: CRABOT_SYSTEM_PROMPT },
        conversationHistory
      )

      for await (const chunk of stream) {
        if (chunk.type === 'reply' && chunk.reply) {
          fullReply += chunk.reply
        }
      }

      fullReply = fullReply.trim() || '✅ 任务已完成'

      this.history.push({ role: 'assistant', text: fullReply })
      if (this.history.length > MAX_HISTORY * 2) {
        this.history = this.history.slice(-MAX_HISTORY * 2)
      }

      // 任务完成后先停止 typing，再发送回复（顺序重要）
      stopTyping()
      remoteControlLogService.info('typing_stop', this.platform, '停止 typing 提示', undefined, msg.sender)
      const cleanedReply = this.sanitizeRemoteText(fullReply, this.platform)
      this.broadcastToFrontend('assistant', cleanedReply, msg.sender)
      await this.sendReply(msg.sender, cleanedReply)

      remoteControlLogService.success('message_reply', this.platform, `回复完成: ${cleanedReply.slice(0, 200)}`, undefined, msg.sender)
      logger.info(`[CraBot] ${this.id} 任务完成，回复: ${cleanedReply.slice(0, 200)}`)
    } catch (err: any) {
      stopTyping()
      remoteControlLogService.info('typing_stop', this.platform, '停止 typing 提示（异常）', undefined, msg.sender)
      const errMsg = `❌ 处理失败: ${ensureReadableText(err.message || String(err))}`
      remoteControlLogService.error('agent_error', this.platform, `处理异常: ${err.message}`, undefined, msg.sender)
      logger.error(`[CraBot] ${this.id} 处理异常: ${err.message}`)
      this.broadcastToFrontend('assistant', errMsg, msg.sender)
      await this.sendReply(msg.sender, errMsg)
      if (this.history.at(-1)?.role === 'user') this.history.pop()
    } finally {
      this.busy = false
      this.abortController = null
      // 处理下一条排队消息
      await this.processNext()
    }
  }

  abort(): void {
    this.abortController?.abort()
    logger.info(`[CraBot] ${this.id} 任务已中止`)
  }

  clearHistory(): void {
    this.history = []
    logger.info(`[CraBot] ${this.id} 对话历史已清空`)
  }

  getHistory(): HistoryEntry[] { return [...this.history] }
  isBusy(): boolean { return this.busy }

  /**
   * 清洗远控回复文本：
   * 1. 提取 JSON 中的可读内容（避免 AI JSON 格式泄漏）
   * 2. 转义 Telegram Markdown 特殊字符（_ * ` [ 等）
   */
  private sanitizeRemoteText(text: string, platform?: RemotePlatform): string {
    const cleaned = ensureReadableText(String(text || '').trim())
    if (!cleaned || platform !== 'telegram') return cleaned || text

    // Telegram Markdown 特殊字符：_ * [ ] ( ) ~ ` > # + - = | { } . !
    return cleaned.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1')
  }

  private async sendReply(sender: string, text: string): Promise<void> {
    if (!this.replier) {
      logger.warn(`[CraBot] ${this.id} 未注册回复函数，无法回复 ${sender}`)
      return
    }
    try {
      await this.replier(text, sender)
    } catch (err: any) {
      logger.error(`[CraBot] ${this.id} 回复失败: ${err.message}`)
    }
  }

  private broadcastToFrontend(role: 'user' | 'assistant', text: string, sender: string): void {
    wsService.broadcastAll({
      type: 'remote_agent_reply',
      payload: { agentId: this.id, agentName: this.displayName, platform: this.platform, role, text, sender, timestamp: Date.now() }
    })
  }
}

/** 全局注册表，按平台单例 */
class RemoteAgentRegistry {
  private agents = new Map<RemotePlatform, RemoteAgent>()

  get(platform: RemotePlatform): RemoteAgent {
    if (!this.agents.has(platform)) {
      this.agents.set(platform, new RemoteAgent(platform))
    }
    return this.agents.get(platform)!
  }

  getAll(): RemoteAgent[] { return [...this.agents.values()] }
}

export const remoteAgentRegistry = new RemoteAgentRegistry()
