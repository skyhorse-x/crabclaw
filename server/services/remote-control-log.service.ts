/**
 * 远程控制日志服务
 * 记录所有远控操作（消息接收、处理、回复、轮询状态等）
 */

import { logger } from './logger.service'
import { wsService } from './websocket.service'

export type RemoteLogLevel = 'info' | 'warn' | 'error' | 'success'

export type RemoteLogEvent =
  | 'polling_start'
  | 'polling_stop'
  | 'polling_error'
  | 'message_received'
  | 'message_ignored'
  | 'message_processing'
  | 'message_reply'
  | 'message_reply_error'
  | 'message_broadcast'
  | 'config_updated'
  | 'webhook_received'
  | 'webhook_error'
  | 'callback_verify'
  | 'callback_verify_failed'
  | 'callback_verify_ok'
  | 'callback_verify_error'
  | 'command_received'
  | 'event_ignored'
  | 'typing_start'
  | 'typing_stop'
  | 'agent_busy'
  | 'agent_error'
  | 'agent_abort'
  | 'system'

export interface RemoteLogEntry {
  id: string
  timestamp: number
  level: RemoteLogLevel
  event: RemoteLogEvent
  platform: string
  message: string
  detail?: string
  sender?: string
}

const MAX_LOG_ENTRIES = 500

class RemoteControlLogService {
  private logs: RemoteLogEntry[] = []
  private idCounter = 0

  private add(level: RemoteLogLevel, event: RemoteLogEvent, platform: string, message: string, detail?: string, sender?: string): void {
    const entry: RemoteLogEntry = {
      id: `rclog_${++this.idCounter}`,
      timestamp: Date.now(),
      level,
      event,
      platform,
      message,
      detail,
      sender
    }

    this.logs.push(entry)

    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(-MAX_LOG_ENTRIES)
    }

    wsService.broadcastAll({
      type: 'remote_control_log',
      payload: entry
    })
  }

  info(event: RemoteLogEvent, platform: string, message: string, detail?: string, sender?: string): void {
    this.add('info', event, platform, message, detail, sender)
    logger.info(`[RemoteControl][${platform}] ${message}`, detail ? { detail } : undefined)
  }

  warn(event: RemoteLogEvent, platform: string, message: string, detail?: string, sender?: string): void {
    this.add('warn', event, platform, message, detail, sender)
    logger.warn(`[RemoteControl][${platform}] ${message}`, detail ? { detail } : undefined)
  }

  error(event: RemoteLogEvent, platform: string, message: string, detail?: string, sender?: string): void {
    this.add('error', event, platform, message, detail, sender)
    logger.error(`[RemoteControl][${platform}] ${message}`, detail ? { detail } : undefined)
  }

  success(event: RemoteLogEvent, platform: string, message: string, detail?: string, sender?: string): void {
    this.add('success', event, platform, message, detail, sender)
    logger.info(`[RemoteControl][${platform}] ${message}`, detail ? { detail } : undefined)
  }

  getLogs(limit: number = 100, platform?: string): RemoteLogEntry[] {
    let filtered = this.logs
    if (platform) {
      filtered = filtered.filter(l => l.platform === platform)
    }
    return filtered.slice(-limit).reverse()
  }

  clearLogs(): void {
    this.logs = []
    this.idCounter = 0
  }

  getStats(): { total: number; byPlatform: Record<string, number>; byLevel: Record<string, number> } {
    const byPlatform: Record<string, number> = {}
    const byLevel: Record<string, number> = {}

    for (const log of this.logs) {
      byPlatform[log.platform] = (byPlatform[log.platform] || 0) + 1
      byLevel[log.level] = (byLevel[log.level] || 0) + 1
    }

    return {
      total: this.logs.length,
      byPlatform,
      byLevel
    }
  }
}

export const remoteControlLogService = new RemoteControlLogService()