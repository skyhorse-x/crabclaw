/**
 * Shell 命令执行工具
 */

import { spawn } from 'node:child_process'
import type { ITool, ToolInputSchema, ToolResult } from './tool.types'
import { logger } from '../services/logger.service'

/**
 * Shell 命令执行工具
 */
export class ShellTool implements ITool {
  readonly name = 'shell'
  readonly description = '执行 Shell 命令'
  
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      command: {
        name: 'command',
        type: 'string',
        description: '要执行的命令',
        required: true
      },
      cwd: {
        name: 'cwd',
        type: 'string',
        description: '工作目录',
        default: process.cwd()
      },
      timeout: {
        name: 'timeout',
        type: 'number',
        description: '超时时间（毫秒）',
        default: 30000
      }
    },
    required: ['command']
  }

  async execute(input: Record<string, any>): Promise<ToolResult> {
    const { command, cwd = process.cwd(), timeout = 30000 } = input

    return new Promise((resolve) => {
      logger.debug('[ShellTool] Executing command', { command, cwd, timeout })

      const child = spawn(command, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        env: process.env
      })

      let output = ''
      let errorOutput = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        logger.error('[ShellTool] Command timeout', { command, timeout })
        
        resolve({
          ok: false,
          error: `命令执行超时（${timeout}ms）`
        })
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
          logger.debug('[ShellTool] Command completed', { command, code })
          
          resolve({
            ok: true,
            data: {
              stdout: output.trim(),
              stderr: errorOutput.trim(),
              exitCode: code,
              command
            }
          })
        } else {
          logger.error('[ShellTool] Command failed', { command, code, error: errorOutput })
          
          resolve({
            ok: false,
            error: errorOutput || `命令执行失败（退出码：${code}）`
          })
        }
      })

      child.on('error', (error) => {
        clearTimeout(timer)
        logger.error('[ShellTool] Spawn error', error)
        
        resolve({
          ok: false,
          error: `命令执行错误：${error.message}`
        })
      })
    })
  }
}
