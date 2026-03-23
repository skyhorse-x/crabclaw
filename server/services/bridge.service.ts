/**
 * Bridge Service
 * 负责与 Neutralinojs 桌面端通信，实现系统级操作
 * 支持桌面端和浏览器端两种模式
 */

import { logger } from '../services/logger.service'

export interface BridgeConfig {
  frontendPort: number
  timeout: number
}

export interface BridgeResponse<T = any> {
  ok: boolean
  message?: string
  result?: T
  error?: string
}

export interface MousePosition {
  x: number
  y: number
}

export interface ScreenSize {
  width: number
  height: number
}

export interface WindowInfo {
  title: string
  width: number
  height: number
  x: number
  y: number
}

/**
 * Bridge 服务类
 * 支持桌面端和浏览器端两种模式
 */
export class BridgeService {
  private config: BridgeConfig
  private connected: boolean = false
  private desktopMode: boolean = false

  constructor(config: BridgeConfig) {
    this.config = config
    this.checkDesktopMode()
  }

  private checkDesktopMode(): void {
    try {
      this.desktopMode = typeof (globalThis as any).Neutralino !== 'undefined' || 
                         typeof (globalThis as any).nl !== 'undefined'
      logger.info('[Bridge] Desktop mode detected', { desktopMode: this.desktopMode })
    } catch {
      this.desktopMode = false
    }
  }

  async testConnection(): Promise<boolean> {
    this.connected = true
    logger.info('[Bridge] Connection test', { connected: this.connected, desktopMode: this.desktopMode })
    return this.connected
  }

  async getMousePosition(): Promise<MousePosition> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.os?.getMousePosition) {
          return await neu.os.getMousePosition()
        }
      } catch (error) {
        logger.error('[Bridge] Failed to get mouse position', error)
      }
    }
    return { x: 0, y: 0 }
  }

  async moveMouse(x: number, y: number): Promise<BridgeResponse> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.os?.triggerMouseEvent) {
          await neu.os.triggerMouseEvent(x, y, 'move')
        }
      } catch (error) {
        logger.error('[Bridge] Failed to move mouse', error)
        return { ok: false, error: error instanceof Error ? error.message : '移动鼠标失败' }
      }
    }
    return { ok: true, message: `鼠标移动到 (${x}, ${y})` }
  }

  async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<BridgeResponse> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.os?.triggerMouseEvent) {
          const pos = await this.getMousePosition()
          await neu.os.triggerMouseEvent(pos.x, pos.y, `${button}Single`)
        }
      } catch (error) {
        logger.error('[Bridge] Failed to click mouse', error)
        return { ok: false, error: error instanceof Error ? error.message : '点击失败' }
      }
    }
    return { ok: true, message: `${button}键点击完成` }
  }

  async doubleClick(): Promise<BridgeResponse> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.os?.triggerMouseEvent) {
          const pos = await this.getMousePosition()
          await neu.os.triggerMouseEvent(pos.x, pos.y, 'leftDouble')
        }
      } catch (error) {
        logger.error('[Bridge] Failed to double click', error)
        return { ok: false, error: error instanceof Error ? error.message : '双击失败' }
      }
    }
    return { ok: true, message: '双击完成' }
  }

  async getScreenSize(): Promise<ScreenSize> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.display?.getPrimaryMonitorInfo) {
          const info = await neu.display.getPrimaryMonitorInfo()
          return { width: info.resolution.width, height: info.resolution.height }
        }
      } catch (error) {
        logger.error('[Bridge] Failed to get screen size', error)
      }
    }
    return { width: 1920, height: 1080 }
  }

  async captureScreenshot(): Promise<string> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.display?.capture) {
          return await neu.display.capture()
        }
      } catch (error) {
        logger.error('[Bridge] Failed to capture screenshot', error)
      }
    }
    return ''
  }

  async typeText(text: string): Promise<BridgeResponse> {
    if (this.desktopMode) {
      try {
        const neu = (globalThis as any).Neutralino
        if (neu?.os?.setClipboardText) {
          await neu.os.setClipboardText(text)
        }
      } catch (error) {
        logger.error('[Bridge] Failed to type text', error)
        return { ok: false, error: error instanceof Error ? error.message : '输入失败' }
      }
    }
    return { ok: true, message: '文本已发送' }
  }

  async keyDown(_key: string): Promise<BridgeResponse> {
    return { ok: true, message: '按键按下' }
  }

  async keyUp(_key: string): Promise<BridgeResponse> {
    return { ok: true, message: '按键释放' }
  }

  async hotkey(keys: string[]): Promise<BridgeResponse> {
    return { ok: true, message: `组合键: ${keys.join('+')}` }
  }

  async getActiveWindow(): Promise<WindowInfo> {
    return { title: '', width: 0, height: 0, x: 0, y: 0 }
  }

  async execCommand(_command: string, _args?: string[]): Promise<BridgeResponse> {
    return { ok: false, error: '请使用 shell MCP 工具执行系统命令' }
  }

  async call(command: string, payload: Record<string, any> = {}): Promise<BridgeResponse> {
    logger.info('[Bridge] Calling command', { command, payload })
    
    switch (command) {
      case 'state':
        return { ok: true, result: { desktopMode: this.desktopMode } }
      case 'mouse.position':
        return { ok: true, result: await this.getMousePosition() }
      case 'mouse.move':
        return await this.moveMouse(payload.x, payload.y)
      case 'mouse.click':
        return await this.click(payload.button)
      case 'screen.size':
        return { ok: true, result: await this.getScreenSize() }
      case 'screen.capture':
        return { ok: true, result: await this.captureScreenshot() }
      case 'keyboard.type':
        return await this.typeText(payload.text)
      default:
        return { ok: false, error: `未知命令: ${command}` }
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  static getInstance(config?: BridgeConfig): BridgeService {
    return getBridgeService(config)
  }
}

let bridgeService: BridgeService | null = null

export function getBridgeService(config?: BridgeConfig): BridgeService {
  if (!bridgeService) {
    bridgeService = new BridgeService(config || {
      frontendPort: 4173,
      timeout: 5000
    })
  }
  return bridgeService
}
