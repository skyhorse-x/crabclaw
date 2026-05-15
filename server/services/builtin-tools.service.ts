/**
 * 内置工具服务
 * 提供非 MCP 的内置功能（如发送消息）
 */

import { logger } from './logger.service'
import { unifiedMessageService, type MessagePayload } from './unified-message.service'
import { getConfigDatabase } from './config-database.service'
import os from 'os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface BuiltinTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (input: Record<string, unknown>) => Promise<{ success: boolean; result?: string; error?: string }>
}

class BuiltinToolsService {
  private tools: Map<string, BuiltinTool> = new Map()

  constructor() {
    this.registerBuiltinTools()
  }

  private syncUnifiedMessageConfig() {
    try {
      const configDb = getConfigDatabase()
      const remoteConfig = configDb.getRemoteControlConfig()
      unifiedMessageService.updateConfig({
        telegram: remoteConfig.telegram,
        qq: { webhook: remoteConfig.qq.webhook, botId: remoteConfig.qq.botId },
        wechat: remoteConfig.wechat,
        feishu: { webhook: remoteConfig.feishu.webhook }
      })
    } catch (error) {
      logger.error('[BuiltinTools] Failed to sync config', { error })
    }
  }

  private registerBuiltinTools() {
    this.register({
      name: 'send_message',
      description: '发送消息到指定平台。支持平台：telegram、qq、wechat、feishu。参数：platform（平台）、content（消息内容）、chatId（可选，默认发送给配置中指定的接收者）、parseMode（可选，仅 telegram 生效：Markdown/MarkdownV2/HTML/plain，默认 plain）。示例：{"platform":"telegram","content":"Hello","parseMode":"plain"}',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['telegram', 'qq', 'wechat', 'feishu'],
            description: '消息平台：telegram、qq、wechat、feishu'
          },
          content: {
            type: 'string',
            description: '消息内容'
          },
          chatId: {
            type: 'string',
            description: '可选，指定接收者ID'
          },
          parseMode: {
            type: 'string',
            enum: ['Markdown', 'MarkdownV2', 'HTML', 'plain'],
            description: '可选，仅 telegram 生效，默认 plain（不做格式化）'
          }
        },
        required: ['platform', 'content']
      },
      execute: async (input: Record<string, unknown>) => {
        this.syncUnifiedMessageConfig()

        const platform = input.platform as string
        const content = input.content as string
        const chatId = input.chatId as string | undefined
        const parseMode = input.parseMode as MessagePayload['parseMode'] | undefined

        if (!platform || !content) {
          return { success: false, error: '缺少必需参数 platform 和 content' }
        }

        const validPlatforms = ['telegram', 'qq', 'wechat', 'feishu']
        if (!validPlatforms.includes(platform)) {
          return { success: false, error: `无效平台: ${platform}，支持的平台: ${validPlatforms.join(', ')}` }
        }

        const payload: MessagePayload = {
          platform: platform as MessagePayload['platform'],
          content,
          chatId,
          parseMode
        }

        const result = await unifiedMessageService.send(payload)
        if (result.ok) {
          return { success: true, result: `消息已发送到 ${platform}: ${content.slice(0, 30)}...` }
        } else {
          return { success: false, error: `${platform} 发送失败: ${result.error}` }
        }
      }
    })

    this.register({
      name: 'system_info',
      description: '获取当前系统信息（跨平台兼容）。返回：平台类型、操作系统、CPU信息、内存使用情况、磁盘使用情况、运行时长、网络信息等。不需要任何参数。示例：{"command": "system_info"}',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '固定值 "system_info"'
          }
        },
        required: []
      },
      execute: async () => {
        const platform = os.platform()
        const platformNames: Record<string, string> = {
          'darwin': 'macOS',
          'linux': 'Linux',
          'win32': 'Windows'
        }
        const cpus = os.cpus()
        const cpuModel = cpus[0]?.model || 'Unknown'
        const cpuCores = cpus.length
        const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10
        const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10
        const usedMem = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024 * 10) / 10
        const uptime = os.uptime()
        const uptimeStr = uptime > 86400
          ? `${Math.floor(uptime / 86400)}天${Math.floor((uptime % 86400) / 3600)}小时`
          : uptime > 3600
            ? `${Math.floor(uptime / 3600)}小时${Math.floor((uptime % 3600) / 60)}分钟`
            : `${Math.floor(uptime / 60)}分钟`

        const [memoryInfo, diskInfo, cpuLoad] = await Promise.all([
          this.getMemoryInfo(),
          this.getDiskInfo(),
          this.getCpuLoad()
        ])

        const hostname = os.hostname()
        const homedir = os.homedir()
        const tmpdir = os.tmpdir()

        return {
          success: true,
          result: JSON.stringify({
            platform: platformNames[platform] || platform,
            platform_raw: platform,
            hostname,
            homedir,
            tmpdir,
            cpu: { model: cpuModel, cores: cpuCores, load: cpuLoad },
            memory: { total: `${totalMem}GB`, used: `${usedMem}GB`, free: `${freeMem}GB`, details: memoryInfo },
            disk: diskInfo,
            uptime: uptimeStr,
            uptime_seconds: uptime,
            note: 'memory details and disk info use platform-specific commands'
          }, null, 2)
        }
      }
    })

    logger.info('[BuiltinTools] Registered builtin tools', { count: this.tools.size })
  }

  private async getMemoryInfo(): Promise<string> {
    const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024)
    const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024)
    const usedMem = totalMem - freeMem
    const base = `Total: ${totalMem}GB, Used: ${usedMem}GB, Free: ${freeMem}GB`

    const platform = os.platform()
    try {
      if (platform === 'darwin') {
        const { stdout } = await execAsync('vm_stat')
        return `${base}\n${stdout}`
      } else if (platform === 'linux') {
        const { stdout } = await execAsync('free -m')
        return stdout
      } else {
        // Windows: os 模块已能提供足够信息，无需依赖 wmic/systeminfo
        return base
      }
    } catch {
      return `${base} (fallback)`
    }
  }

  private async getDiskInfo(): Promise<string> {
    const platform = os.platform()
    try {
      if (platform === 'win32') {
        // wmic 在 Windows 11 21H2+ 已弃用，改用 PowerShell
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | Format-Table -AutoSize"'
        )
        return stdout
      } else {
        const { stdout } = await execAsync('df -h .')
        return stdout
      }
    } catch {
      return 'Unable to get disk info'
    }
  }

  private async getCpuLoad(): Promise<string> {
    const cpus = os.cpus()
    const load = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
      const idle = cpu.times.idle
      return acc + ((total - idle) / total * 100) / cpus.length
    }, 0)
    return `CPU Load: ${load.toFixed(1)}%`
  }

  register(tool: BuiltinTool) {
    this.tools.set(tool.name, tool)
  }

  getTools(): Record<string, Omit<BuiltinTool, 'execute'>> {
    const result: Record<string, Omit<BuiltinTool, 'execute'>> = {}
    for (const [name, tool] of this.tools) {
      result[name] = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    }
    return result
  }

  getToolDescriptions(): string {
    const lines: string[] = []
    for (const [name, tool] of this.tools) {
      lines.push(`builtin/${name}: ${tool.description}`)
    }
    return lines.join('\n')
  }

  async callTool(toolName: string, input: Record<string, unknown>): Promise<{ success: boolean; result?: string; error?: string }> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return { success: false, error: `内置工具 ${toolName} 不存在` }
    }

    try {
      return await tool.execute(input)
    } catch (error) {
      logger.error('[BuiltinTools] Tool execution failed', { tool: toolName, error })
      return { success: false, error: String(error) }
    }
  }
}

export const builtinTools = new BuiltinToolsService()
