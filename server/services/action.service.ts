/**
 * Action 服务层
 * 负责系统操作、文件操作、shell 调用和 bridge 调用
 */

import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { logger } from './logger.service'
import { retry, sleep } from '../shared/utils'
import { PATHS } from '../shared/constants'

// 定义类型
type BufferEncoding = 'utf8' | 'utf16le' | 'latin1' | 'ascii' | 'base64' | 'hex'

declare global {
  interface Buffer {
    toString(encoding?: BufferEncoding, start?: number, end?: number): string
  }
}

/**
 * Bridge 调用结果
 */
interface BridgeResult {
  ok: boolean
  data?: any
  error?: string
}

/**
 * Action 服务类
 */
export class ActionService {
  private bridgePath: string

  constructor(bridgePath?: string) {
    this.bridgePath = bridgePath || PATHS.BRIDGE_PATH
  }

  /**
   * 调用 bridge
   */
  async callBridge(
    action: string,
    payload: Record<string, any> = {}
  ): Promise<BridgeResult> {
    return new Promise((resolve) => {
      const child = spawn('node', [this.bridgePath, action, JSON.stringify(payload)], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let output = ''
      let errorOutput = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output.trim())
            logger.debug('[Bridge] Action completed', { action, code })
            resolve({ ok: true, data: result })
          } catch {
            resolve({ ok: true, data: output.trim() })
          }
        } else {
          logger.error('[Bridge] Action failed', { action, code, error: errorOutput })
          resolve({ ok: false, error: errorOutput || `Exit code: ${code}` })
        }
      })

      child.on('error', (error) => {
        logger.error('[Bridge] Spawn error', error)
        resolve({ ok: false, error: error.message })
      })
    })
  }

  /**
   * 执行 shell 命令
   */
  async execShell(
    command: string,
    options: { 
      timeout?: number
      cwd?: string
      env?: Record<string, string>
    } = {}
  ): Promise<BridgeResult> {
    const { timeout = 30000, cwd = process.cwd(), env = process.env } = options

    return new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env, ...env }
      })

      let output = ''
      let errorOutput = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        if (process.platform === 'win32') {
          child.kill()
        } else {
          child.kill('SIGTERM')
        }
        logger.error('[Shell] Command timeout', { command, timeout })
        resolve({ ok: false, error: `Command timeout after ${timeout}ms` })
      }, timeout)

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        
        if (timedOut) return

        if (code === 0) {
          logger.debug('[Shell] Command completed', { command, code })
          resolve({ ok: true, data: output.trim() })
        } else {
          logger.error('[Shell] Command failed', { command, code, error: errorOutput })
          resolve({ ok: false, error: errorOutput || `Exit code: ${code}` })
        }
      })

      child.on('error', (error) => {
        clearTimeout(timer)
        logger.error('[Shell] Spawn error', error)
        resolve({ ok: false, error: error.message })
      })
    })
  }

  /**
   * 读取文件
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<BridgeResult> {
    try {
      const content = await readFile(filePath, encoding)
      logger.debug('[File] Read file', { path: filePath, size: content.length })
      return { ok: true, data: content }
    } catch (error: any) {
      logger.error('[File] Read failed', error, { path: filePath })
      return { ok: false, error: error.message }
    }
  }

  /**
   * 写入文件
   */
  async writeFile(
    filePath: string,
    content: string | Buffer,
    options: { encoding?: BufferEncoding; createDir?: boolean } = {}
  ): Promise<BridgeResult> {
    try {
      const { encoding = 'utf8', createDir = true } = options

      if (createDir) {
        const dir = path.dirname(filePath)
        await mkdir(dir, { recursive: true })
      }

      await writeFile(filePath, content, encoding)
      logger.debug('[File] Write completed', { path: filePath })
      return { ok: true, data: { written: true } }
    } catch (error: any) {
      logger.error('[File] Write failed', error, { path: filePath })
      return { ok: false, error: error.message }
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取系统状态
   */
  async getSystemState(): Promise<BridgeResult> {
    return this.callBridge('state', {})
  }

  /**
   * 打开应用
   */
  async openApp(appName: string): Promise<BridgeResult> {
    return this.callBridge('openApp', { appName })
  }

  /**
   * 打开 URL
   */
  async openUrl(url: string): Promise<BridgeResult> {
    return this.callBridge('openUrl', { url })
  }

  /**
   * 鼠标点击
   */
  async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<BridgeResult> {
    return this.callBridge('click', { x, y, button })
  }

  /**
   * 鼠标双击
   */
  async doubleClick(x: number, y: number): Promise<BridgeResult> {
    return this.callBridge('doubleClick', { x, y })
  }

  /**
   * 鼠标移动
   */
  async moveMouse(x: number, y: number): Promise<BridgeResult> {
    return this.callBridge('move', { x, y })
  }

  /**
   * 键盘输入
   */
  async typeText(text: string): Promise<BridgeResult> {
    return this.callBridge('type', { text })
  }

  /**
   * 按键
   */
  async pressKey(key: string): Promise<BridgeResult> {
    return this.callBridge('key', { key })
  }

  /**
   * 快捷键
   */
  async pressHotkey(keys: string[]): Promise<BridgeResult> {
    return this.callBridge('hotkey', { keys })
  }

  /**
   * 等待
   */
  async wait(ms: number): Promise<void> {
    logger.debug('[Action] Waiting', { ms })
    await sleep(ms)
  }

  /**
   * 带重试的操作
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number
      delayMs?: number
      backoff?: number
    } = {}
  ): Promise<T> {
    return retry(operation, options)
  }
}

/**
 * 创建 Action 服务单例
 */
export const actionService = new ActionService()
