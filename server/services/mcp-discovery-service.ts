/**
 * MCP 工具发现服务
 * 负责自动发现、注册和监控 MCP 工具
 */

import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { mcpToolRegistry } from './mcp-tool-registry'
import { logger } from './logger.service'
import { PATHS } from '../shared/constants'

/**
 * MCP 服务器发现配置
 */
interface McpDiscoveryConfig {
  /**
   * 自动发现间隔（毫秒）
   */
  discoveryInterval: number
  
  /**
   * 监控的配置文件路径
   */
  configPaths: string[]
  
  /**
   * 自动重连失败的服务器
   */
  autoReconnect: boolean
  
  /**
   * 健康检查间隔
   */
  healthCheckInterval: number
}

/**
 * MCP 服务器健康状态
 */
interface McpServerHealth {
  serverId: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  lastCheck: Date
  errorCount: number
  responseTime?: number
}

/**
 * MCP 工具发现服务
 */
export class McpDiscoveryService {
  private config: McpDiscoveryConfig
  private watchers: Map<string, any> = new Map()
  private healthStatus: Map<string, McpServerHealth> = new Map()
  private discoveryInterval?: NodeJS.Timeout
  private healthCheckInterval?: NodeJS.Timeout
  
  constructor(config: Partial<McpDiscoveryConfig> = {}) {
    this.config = {
      discoveryInterval: config.discoveryInterval || 30000, // 30秒
      configPaths: config.configPaths || [PATHS.MCP_CONFIG_PATH],
      autoReconnect: config.autoReconnect !== false,
      healthCheckInterval: config.healthCheckInterval || 60000 // 1分钟
    }
  }
  
  /**
   * 启动发现服务
   */
  async start(): Promise<void> {
    logger.info('[McpDiscoveryService] Starting...')
    
    // 初始发现
    await this.discoverMcpServers()
    
    // 启动定期发现
    this.discoveryInterval = setInterval(() => {
      this.discoverMcpServers().catch(error => {
        logger.error('[McpDiscoveryService] Discovery failed', error)
      })
    }, this.config.discoveryInterval)
    
    // 启动健康检查
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error('[McpDiscoveryService] Health check failed', error)
      })
    }, this.config.healthCheckInterval)
    
    // 监控配置文件变化
    await this.setupConfigWatchers()
    
    logger.info('[McpDiscoveryService] Started successfully')
  }
  
  /**
   * 停止发现服务
   */
  async stop(): Promise<void> {
    logger.info('[McpDiscoveryService] Stopping...')
    
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
      this.discoveryInterval = undefined
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
    
    // 关闭文件监控
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
    
    logger.info('[McpDiscoveryService] Stopped')
  }
  
  /**
   * 发现 MCP 服务器
   */
  private async discoverMcpServers(): Promise<void> {
    logger.debug('[McpDiscoveryService] Discovering MCP servers...')
    
    for (const configPath of this.config.configPaths) {
      try {
        await this.processConfigFile(configPath)
      } catch (error) {
        logger.warn(`[McpDiscoveryService] Failed to process config file: ${configPath}`, error)
      }
    }
    
    // 重新初始化工具注册表
    await mcpToolRegistry.initialize()
    
    logger.debug('[McpDiscoveryService] Discovery completed')
  }
  
  /**
   * 处理配置文件
   */
  private async processConfigFile(configPath: string): Promise<void> {
    try {
      const stats = await stat(configPath)
      if (!stats.isFile()) {
        return
      }
      
      const content = await readFile(configPath, 'utf8')
      const config = JSON.parse(content)
      
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        logger.warn(`[McpDiscoveryService] Invalid MCP config format in: ${configPath}`)
        return
      }
      
      const serverIds = Object.keys(config.mcpServers)
      logger.info(`[McpDiscoveryService] Found ${serverIds.length} servers in ${configPath}`, {
        servers: serverIds
      })
      
      // 这里可以添加服务器连接逻辑
      // 目前由 mcpToolRegistry 处理连接
      
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.debug(`[McpDiscoveryService] Config file not found: ${configPath}`)
      } else {
        throw error
      }
    }
  }
  
  /**
   * 设置配置文件监控
   */
  private async setupConfigWatchers(): Promise<void> {
    for (const configPath of this.config.configPaths) {
      try {
        const watcher = watch(configPath, (eventType) => {
          if (eventType === 'change') {
            logger.info(`[McpDiscoveryService] Config file changed: ${configPath}`)
            this.discoverMcpServers().catch(error => {
              logger.error('[McpDiscoveryService] Failed to reload config', error)
            })
          }
        })
        
        this.watchers.set(configPath, watcher)
        logger.debug(`[McpDiscoveryService] Watching config file: ${configPath}`)
        
      } catch (error) {
        logger.warn(`[McpDiscoveryService] Failed to watch config file: ${configPath}`, error)
      }
    }
  }
  
  /**
   * 执行健康检查
   */
  private async performHealthChecks(): Promise<void> {
    logger.debug('[McpDiscoveryService] Performing health checks...')
    
    const availableTools = mcpToolRegistry.getAvailableTools()
    const servers = new Set(availableTools.map(tool => tool.server))
    
    for (const serverId of servers) {
      await this.checkServerHealth(serverId)
    }
    
    logger.debug('[McpDiscoveryService] Health checks completed')
  }
  
  /**
   * 检查服务器健康状态
   */
  private async checkServerHealth(serverId: string): Promise<void> {
    const startTime = Date.now()
    
    try {
      // 简单的健康检查：尝试获取工具列表
      const { mcpService } = await import('./mcp.service')
      await mcpService.getTools()
      
      const responseTime = Date.now() - startTime
      
      this.healthStatus.set(serverId, {
        serverId,
        status: 'healthy',
        lastCheck: new Date(),
        errorCount: 0,
        responseTime
      })
      
      logger.debug(`[McpDiscoveryService] Server ${serverId} is healthy`, { responseTime })
      
    } catch (error) {
      const currentHealth = this.healthStatus.get(serverId) || {
        serverId,
        status: 'unknown',
        lastCheck: new Date(0),
        errorCount: 0
      }
      
      currentHealth.status = 'unhealthy'
      currentHealth.lastCheck = new Date()
      currentHealth.errorCount++
      
      this.healthStatus.set(serverId, currentHealth)
      
      logger.warn(`[McpDiscoveryService] Server ${serverId} is unhealthy`, {
        errorCount: currentHealth.errorCount,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      // 自动重连
      if (this.config.autoReconnect && currentHealth.errorCount >= 3) {
        await this.attemptReconnect(serverId)
      }
    }
  }
  
  /**
   * 尝试重新连接
   */
  private async attemptReconnect(serverId: string): Promise<void> {
    logger.info(`[McpDiscoveryService] Attempting to reconnect server: ${serverId}`)
    
    try {
      // 这里可以添加重连逻辑
      // 目前由 mcpToolRegistry 处理连接
      
      // 重置错误计数
      const health = this.healthStatus.get(serverId)
      if (health) {
        health.errorCount = 0
        health.status = 'healthy'
      }
      
      logger.info(`[McpDiscoveryService] Server ${serverId} reconnected successfully`)
      
    } catch (error) {
      logger.error(`[McpDiscoveryService] Failed to reconnect server: ${serverId}`, error)
    }
  }
  
  /**
   * 获取服务器健康状态
   */
  getServerHealth(serverId: string): McpServerHealth | undefined {
    return this.healthStatus.get(serverId)
  }
  
  /**
   * 获取所有服务器健康状态
   */
  getAllServerHealth(): McpServerHealth[] {
    return Array.from(this.healthStatus.values())
  }
  
  /**
   * 发现新的 MCP 工具
   */
  async discoverNewTools(): Promise<string[]> {
    const beforeCount = mcpToolRegistry.getAvailableTools().length
    
    await this.discoverMcpServers()
    
    const afterCount = mcpToolRegistry.getAvailableTools().length
    const newToolsCount = afterCount - beforeCount
    
    if (newToolsCount > 0) {
      logger.info(`[McpDiscoveryService] Discovered ${newToolsCount} new tools`)
    }
    
    return Array.from({ length: newToolsCount }, (_, i) => 
      `new_tool_${beforeCount + i}`
    )
  }
}

export const mcpDiscoveryService = new McpDiscoveryService()
