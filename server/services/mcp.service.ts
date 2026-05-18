/**
 * MCP 服务层
 * 负责 MCP 服务器通信、工具调用和服务器管理
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { readFile, access, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { PATHS, HTTP } from '../shared/constants'
import { logger } from '../services/logger.service'
import type { McpServerConfig, McpTool, McpClient as McpClientType } from '../shared/types'

const MCP_CONFIG_PATH = PATHS.MCP_CONFIG_PATH
const MCP_CONNECT_TIMEOUT_MS = 30000
const MCP_LIST_TOOLS_TIMEOUT_MS = 15000
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
 * 为 filesystem MCP 动态注入用户可访问的路径
 * 自动检测当前用户 HOME 下的常用目录是否存在并加入 allowed paths
 */
async function buildFilesystemArgs(baseArgs: string[]): Promise<string[]> {
  // 确保 workspace 目录存在
  await mkdir(PATHS.WORKSPACE_DIR, { recursive: true })

  const home = os.homedir()
  const candidates = [
    PATHS.WORKSPACE_DIR,        // 用户创建项目的专属目录
    home,
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    os.tmpdir()                 // 跨平台临时目录（macOS/Linux:/tmp, Windows:%TEMP%）
  ]

  const existing: string[] = []
  for (const dir of candidates) {
    try {
      await access(dir)
      existing.push(dir)
    } catch {
      // 目录不存在则跳过
    }
  }

  // 过滤掉 baseArgs 中已包含的路径，避免重复
  const toAdd = existing.filter(p => !baseArgs.includes(p))
  logger.debug('[MCP] filesystem allowed paths', { paths: [...baseArgs, ...toAdd] })
  return [...baseArgs, ...toAdd]
}

/**
 * 带超时的 Promise.race 辅助函数
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`MCP 操作超时: ${context} (>${timeoutMs}ms)`)), timeoutMs)
      })
    ])
    return result
  } finally {
    if (timer) clearTimeout(timer)
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

  const connectedAt = Date.now()

  try {
    const mergedEnv = { ...process.env, ...config.env }

    const resolvedArgs = serverId === 'filesystem'
      ? await buildFilesystemArgs(Array.isArray(config.args) ? [...config.args] : [])
      : (Array.isArray(config.args) ? config.args : [])

    // Windows 上 npx/node 需要使用 .cmd 后缀，否则 spawn 找不到可执行文件
    const isWin = process.platform === 'win32'
    const resolvedCommand = isWin && (config.command === 'npx' || config.command === 'node' || config.command === 'npm')
      ? `${config.command}.cmd`
      : config.command

    logger.debug(`[MCP] Connecting to ${serverId}`, {
      command: resolvedCommand,
      argsCount: resolvedArgs.length
    })

    const transport = new StdioClientTransport({
      command: resolvedCommand,
      args: resolvedArgs,
      env: mergedEnv as Record<string, string>
    })

    const client = new Client({
      name: `desktop-agent-${serverId}`,
      version: "1.0.0"
    }, {
      capabilities: {}
    })

    await withTimeout(
      client.connect(transport),
      MCP_CONNECT_TIMEOUT_MS,
      `${serverId} connect`
    )

    // 防止子进程退出后写入 stdin 产生 EPIPE 未处理错误导致进程崩溃
    const childProcess = (transport as any)._process
    if (childProcess) {
      childProcess.stdin?.on('error', (err: any) => {
        if (err?.code === 'EPIPE') return
        logger.warn(`[MCP] stdin error for ${serverId}:`, err?.message)
      })
      childProcess.stdout?.on('error', (err: any) => {
        if (err?.code === 'EPIPE') return
        logger.warn(`[MCP] stdout error for ${serverId}:`, err?.message)
      })
      childProcess.stderr?.on('error', (err: any) => {
        if (err?.code === 'EPIPE') return
        logger.warn(`[MCP] stderr error for ${serverId}:`, err?.message)
      })
      childProcess.on('error', (err: any) => {
        if (err?.code === 'EPIPE') return
        logger.warn(`[MCP] process error for ${serverId}:`, err?.message)
      })
      childProcess.on('exit', (code: number | null) => {
        logger.warn(`[MCP] Process ${serverId} exited with code ${code}`)
        mcpClients.delete(serverId)
      })
    }

    const toolsResult = await withTimeout(
      client.listTools(),
      MCP_LIST_TOOLS_TIMEOUT_MS,
      `${serverId} listTools`
    )
    const tools = toolsResult.tools || []

    const mcpClient: McpClientType = {
      client,
      transport,
      tools,
      connected: true
    }

    mcpClients.set(serverId, mcpClient)
    logger.info(`[MCP] Connected to ${serverId}`, { 
      tools: tools.map(t => t.name).join(", "),
      elapsedMs: Date.now() - connectedAt
    })
    
    return mcpClient
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const elapsedMs = Date.now() - connectedAt
    
    if (
      serverId === 'chrome-devtools' &&
      !hasChromeIsolationArgs(Array.isArray(config.args) ? config.args : []) &&
      isChromeProfileConflictError(errorMessage)
    ) {
      logger.warn('[MCP] chrome-devtools profile is busy, retrying with --isolated')
      return connectMcpServer(serverId, withChromeIsolation(config))
    }

    logger.error(`[MCP] Failed to connect ${serverId}`, {
      error: errorMessage,
      elapsedMs,
      command: config.command
    })
    return null
  }
}

/**
 * 确保 MCP 连接存在
 */
async function ensureMcpConnection(serverId: string): Promise<McpClientType | null> {
  const existing = mcpClients.get(serverId)
  if (existing?.connected) {
    try {
      await withTimeout(
        existing.client.listTools(),
        MCP_LIST_TOOLS_TIMEOUT_MS,
        `${serverId} healthCheck`
      )
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
      let selectedToolName = toolName
      let selectedTool = tool
      const isShellAlias =
        serverId === 'shell' &&
        ['shell_execute', 'execute', 'run_shell', 'shell_execute_command', 'run_process'].includes(toolName)
      if (!selectedTool && isShellAlias) {
        const names = mcpClient.tools.map((t) => t.name)
        const aliasTargets = ['shell_execute', 'run_process', toolName]
        const resolved = aliasTargets.find((name) => names.includes(name))
        if (resolved) {
          selectedToolName = resolved
          selectedTool = mcpClient.tools.find((t) => t.name === resolved)
          logger.warn('[MCP] Shell tool alias mapped', { requested: toolName, resolved: selectedToolName })
        }
      }

      if (!selectedTool) {
        const availableTools = mcpClient.tools.map(t => t.name).join(", ")
        return { 
          ok: false, 
          error: `工具「${toolName}」不存在。可用工具：${availableTools}`
        }
      }

      logger.debug(`[MCP] Calling tool ${serverId}/${selectedToolName}`, { args })

      // 为 shell MCP 的 run_process 工具添加默认 mode 参数
      let finalArgs = { ...args }
      if (serverId === 'shell' && selectedToolName === 'run_process' && !finalArgs.mode) {
        finalArgs.mode = 'shell'
      }
      if (serverId === 'shell' && selectedToolName === 'shell_execute' && finalArgs.mode) {
        delete finalArgs.mode
      }

      const rawResult = await withTimeout(
        mcpClient.client.callTool({
          name: selectedToolName,
          arguments: finalArgs
        }),
        HTTP.MCP_TIMEOUT_MS,
        `${serverId}/${selectedToolName} callTool`
      ) as any

      const content = rawResult.content || []
      let output = ""
      
      for (const item of content) {
        if (item.type === "text") {
          output += (item as any).text || ""
        }
      }

      return { ok: true, result: output || rawResult }
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
    
    const closePromises: Promise<void>[] = []
    for (const [serverId, mcpClient] of mcpClients) {
      closePromises.push(
        (async () => {
          try {
            await withTimeout(
              mcpClient.client.close(),
              5000,
              `${serverId} close`
            )
            logger.info(`[MCP] Disconnected ${serverId}`)
          } catch (error) {
            logger.warn(`[MCP] Error disconnecting ${serverId}`, {
              error: error instanceof Error ? error.message : String(error)
            })
          }
        })()
      )
    }
    
    await Promise.allSettled(closePromises)
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
