/**
 * Agent Pool - 管理 Agent 实例的生命周期
 * 按需创建，支持配置驱动
 */

import type { AgentConfig, AgentType } from './types'
import { WorkerAgent } from './worker-agent'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface AgentPoolConfig {
  configPath: string
  maxIdleTimeMs?: number
}

export class AgentPool {
  private configs = new Map<AgentType, AgentConfig>()
  private activeAgents = new Map<AgentType, WorkerAgent>()
  private configPath: string
  private maxIdleTimeMs: number
  private lastUsed = new Map<AgentType, number>()

  constructor(config: AgentPoolConfig) {
    this.configPath = resolve(__dirname, config.configPath)
    this.maxIdleTimeMs = config.maxIdleTimeMs || 300_000  // 默认 5 分钟
    this.loadConfigs()
  }

  /** 从配置文件加载 Agent 定义 */
  private loadConfigs(): void {
    const raw = readFileSync(this.configPath, 'utf-8')
    const config = JSON.parse(raw)
    
    for (const [type, agentConfig] of Object.entries(config.agents)) {
      this.configs.set(type, {
        ...agentConfig as AgentConfig,
        type
      })
    }
  }

  /** 获取或创建 Agent */
  async getAgent(type: AgentType): Promise<WorkerAgent> {
    // 检查是否有空闲实例
    const existing = this.activeAgents.get(type)
    if (existing) {
      this.lastUsed.set(type, Date.now())
      return existing
    }

    // 按需创建
    const config = this.configs.get(type)
    if (!config) {
      throw new Error(`未知 Agent 类型: ${type}。可用类型: ${Array.from(this.configs.keys()).join(', ')}`)
    }

    const agent = new WorkerAgent(config)
    await agent.initialize()
    this.activeAgents.set(type, agent)
    this.lastUsed.set(type, Date.now())

    return agent
  }

  /** 释放指定类型的 Agent */
  async release(type: AgentType): Promise<void> {
    const agent = this.activeAgents.get(type)
    if (agent) {
      await agent.cleanup()
      this.activeAgents.delete(type)
      this.lastUsed.delete(type)
    }
  }

  /** 释放所有 Agent */
  async releaseAll(): Promise<void> {
    for (const type of this.activeAgents.keys()) {
      await this.release(type)
    }
  }

  /** 清理空闲超时的 Agent */
  async cleanupIdle(): Promise<number> {
    const now = Date.now()
    const toRelease: AgentType[] = []

    for (const [type, lastUsedTime] of this.lastUsed.entries()) {
      if (now - lastUsedTime > this.maxIdleTimeMs) {
        toRelease.push(type)
      }
    }

    for (const type of toRelease) {
      await this.release(type)
    }

    return toRelease.length
  }

  /** 获取已注册的类型列表 */
  getRegisteredTypes(): AgentType[] {
    return Array.from(this.configs.keys())
  }

  /** 获取活跃 Agent 数量 */
  getActiveCount(): number {
    return this.activeAgents.size
  }

  /** 检查类型是否已注册 */
  hasType(type: AgentType): boolean {
    return this.configs.has(type)
  }
}
