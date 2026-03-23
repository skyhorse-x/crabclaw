/**
 * MCP 服务层
 * 负责 MCP 服务器通信、工具调用和服务器管理
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { logger } from '../services/logger.service'
import type { McpServerConfig, McpTool, McpClient as McpClientType } from '../shared/types'

const MCP_CONFIG_PATH = path.join(process.cwd(), "server", "mcp-config.json")
const mcpClients = new Map<string, McpClientType>()

function hasChromeIsolationArgs(args: string[] = []): boolean {
  return args.some((arg) =>
    arg === '--isolated' ||
    arg.startsWith('--isolated=') ||
    arg.startsWith('--userDataDir=') ||
    arg.startsWith('--user-data-dir=')
  )
}

function isChromeProfileConflictError(message: string): boolean {
  const text = String(message || '').toLowerCase()
  return (
    text.includes('browser is already running') &&
    (text.includes('chrome-profile') || text.includes('userdata'))
  )
}

function withChromeIsolation(config: McpServerConfig): McpServerConfig {
  const args = Array.isArray(config.args) ? [...config.args] : []
  if (!hasChromeIsolationArgs(args)) {
    args.push('--isolated')
  }
  return {
    ...config,
    args
  }
}

/**
 * 加载 MCP 配置文件
 */
async function loadMcpConfigFile(): Promise<{ mcpServers: Record<string, McpServerConfig> }> {
  try {
    const content = await readFile(MCP_CONFIG_PATH, "utf8")
    return JSON.parse(content)
  } catch (error) {
    logger.debug('MCP config not found, using empty config', { error })
    return { mcpServers: {} }
  }
}

/**
 * 连接 MCP 服务器
 */
async function connectMcpServer(serverId: string, config: McpServerConfig): Promise<McpClientType | null> {
  if (mcpClients.has(serverId)) {
    logger.debug(`[MCP] Using existing connection to ${serverId}`)
    return mcpClients.get(serverId)!
  }

  try {
    const mergedEnv = { ...process.env, ...config.env }
    
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: mergedEnv as Record<string, string>
    })

    const client = new Client({
      name: `desktop-agent-${serverId}`,
      version: "1.0.0"
    }, {
      capabilities: {}
    })

    await client.connect(transport)

    const toolsResult = await client.listTools()
    const tools = toolsResult.tools || []

    const mcpClient: McpClientType = {
      client,
      transport,
      tools,
      connected: true
    }

    mcpClients.set(serverId, mcpClient)
    logger.info(`[MCP] Connected to ${serverId}`, { 
      tools: tools.map(t => t.name).join(", ") 
    })
    
    return mcpClient
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (
      serverId === 'chrome-devtools' &&
      !hasChromeIsolationArgs(Array.isArray(config.args) ? config.args : []) &&
      isChromeProfileConflictError(errorMessage)
    ) {
      logger.warn('[MCP] chrome-devtools profile is busy, retrying with --isolated')
      return connectMcpServer(serverId, withChromeIsolation(config))
    }

    logger.error(`[MCP] Failed to connect ${serverId}`, error)
    return null
  }
}

/**
 * 确保 MCP 连接存在
 */
async function ensureMcpConnection(serverId: string): Promise<McpClientType | null> {
  const existing = mcpClients.get(serverId)
  if (existing?.connected) {
    // 测试连接是否仍然有效
    try {
      await existing.client.listTools()
      return existing
    } catch {
      logger.warn(`[MCP] Connection to ${serverId} lost, reconnecting...`)
      mcpClients.delete(serverId)
    }
  }

  const config = await loadMcpConfigFile()
  const serverConfig = config.mcpServers[serverId]
  if (!serverConfig) {
    logger.warn(`[MCP] Server ${serverId} not found in config`)
    return null
  }

  const finalConfig =
    serverId === 'chrome-devtools' && !hasChromeIsolationArgs(Array.isArray(serverConfig.args) ? serverConfig.args : [])
      ? withChromeIsolation(serverConfig)
      : serverConfig

  return connectMcpServer(serverId, finalConfig)
}

/**
 * MCP 服务类
 */
export class McpService {
  private async disconnectServer(serverId: string): Promise<void> {
    const existing = mcpClients.get(serverId)
    if (!existing) return
    try {
      await existing.client.close()
    } catch (error) {
      logger.warn(`[MCP] Failed to close existing ${serverId} client`, { error })
    } finally {
      mcpClients.delete(serverId)
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(
    serverId: string, 
    toolName: string, 
    args: Record<string, any>,
    retryCount = 0
  ): Promise<{ ok: boolean; result?: any; error?: string }> {
    try {
      const mcpClient = await ensureMcpConnection(serverId)
      
      if (!mcpClient) {
        return { 
          ok: false, 
          error: `MCP 服务器「${serverId}」未安装或连接失败` 
        }
      }

      const tool = mcpClient.tools.find(t => t.name === toolName)
      if (!tool) {
        const availableTools = mcpClient.tools.map(t => t.name).join(", ")
        return { 
          ok: false, 
          error: `工具「${toolName}」不存在。可用工具：${availableTools}` 
        }
      }

      logger.debug(`[MCP] Calling tool ${serverId}/${toolName}`, { args })

      // 为 shell MCP 的 run_process 工具添加默认 mode 参数
      let finalArgs = { ...args }
      if (serverId === 'shell' && toolName === 'run_process' && !finalArgs.mode) {
        finalArgs.mode = 'shell'
      }

      const result = await mcpClient.client.callTool({
        name: toolName,
        arguments: finalArgs
      })

      const content = result.content || []
      let output = ""
      
      for (const item of content) {
        if (item.type === "text") {
          output += (item as any).text || ""
        }
      }

      // 格式化输出文本
      if (output && typeof output === 'string') {
        // 识别 vm_stat 输出并格式化
        if (output.includes('Mach Virtual Memory Statistics')) {
          const lines = output.split('\n').filter(line => line.trim())
          output = lines.map(line => {
            if (line.includes(':')) {
              const [key, value] = line.split(':').map(s => s.trim())
              return `${key}:\n  ${value}`
            }
            return line
          }).join('\n\n')
        } else {
          // 通用格式化：将冒号分隔的内容格式化为多行
          output = output.replace(/:\s*/g, ':\n  ')
          // 将逗号分隔的内容格式化为多行
          output = output.replace(/,\s*/g, ',\n  ')
          // 移除多余的空行
          output = output.replace(/\n\s*\n/g, '\n')
        }
      }

      return { ok: true, result: output || result }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`[MCP] Tool call failed ${serverId}/${toolName}`, error)

      if (serverId === 'chrome-devtools' && retryCount === 0 && isChromeProfileConflictError(errorMessage)) {
        logger.warn('[MCP] chrome-devtools profile conflict detected, reconnecting and retrying once')
        await this.disconnectServer(serverId)
        return this.callTool(serverId, toolName, args, 1)
      }

      return { ok: false, error: `MCP 调用失败：${errorMessage}` }
    }
  }

  /**
   * 获取所有 MCP 工具
   */
  async getTools(): Promise<Record<string, McpTool[]>> {
    const config = await loadMcpConfigFile()
    const result: Record<string, McpTool[]> = {}

    for (const serverId of Object.keys(config.mcpServers)) {
      const mcpClient = await ensureMcpConnection(serverId)
      if (mcpClient) {
        result[serverId] = mcpClient.tools
      }
    }

    logger.debug('[MCP] Retrieved tools', { 
      serversCount: Object.keys(result).length 
    })

    return result
  }

  /**
   * 获取所有 MCP 服务器列表
   */
  async getServers(): Promise<string[]> {
    const config = await loadMcpConfigFile()
    return Object.keys(config.mcpServers)
  }

  /**
   * 断开所有 MCP 连接
   */
  async disconnectAll(): Promise<void> {
    logger.info('[MCP] Disconnecting all servers...')
    
    for (const [serverId, mcpClient] of mcpClients) {
      try {
        await mcpClient.client.close()
        logger.info(`[MCP] Disconnected ${serverId}`)
      } catch (error) {
        logger.error(`[MCP] Error disconnecting ${serverId}`, error)
      }
    }
    
    mcpClients.clear()
    logger.info('[MCP] All connections closed')
  }

  /**
   * 获取 MCP 客户端实例
   */
  getClient(serverId: string): McpClientType | null {
    return mcpClients.get(serverId) || null
  }

  /**
   * 检查服务器是否已连接
   */
  isConnected(serverId: string): boolean {
    const client = mcpClients.get(serverId)
    return client?.connected || false
  }
}

/**
 * 创建 MCP 服务单例
 */
export const mcpService = new McpService()

/**
 * 导出兼容函数（保持向后兼容）
 */
export const callMcpTool = mcpService.callTool.bind(mcpService)
export const getMcpTools = mcpService.getTools.bind(mcpService)
export const getMcpServers = mcpService.getServers.bind(mcpService)
export const disconnectAllMcp = mcpService.disconnectAll.bind(mcpService)
