/**
 * 经验图谱
 * 基于图结构存储和检索经验，支持语义相似度搜索
 */

import { logger } from '../services/logger.service'
import { createId } from '../shared/utils'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type {
  ExperienceNode,
  ExperienceSearchResult,
  GraphNode,
  GraphEdge,
  DeepReflection,
  CausalNode
} from './types'

export class ExperienceGraph {
  private static instance: ExperienceGraph
  private experiences: Map<string, ExperienceNode> = new Map()
  private storagePath: string
  private initialized: boolean = false
  private embeddingDimension: number = 128

  private constructor() {
    this.storagePath = join(process.cwd(), 'data', 'experience-graph.json')
  }

  static getInstance(): ExperienceGraph {
    if (!ExperienceGraph.instance) {
      ExperienceGraph.instance = new ExperienceGraph()
    }
    return ExperienceGraph.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      const dir = this.storagePath.substring(0, this.storagePath.lastIndexOf('/'))
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      if (existsSync(this.storagePath)) {
        const data = await readFile(this.storagePath, 'utf-8')
        const parsed = JSON.parse(data) as ExperienceNode[]
        for (const exp of parsed) {
          this.experiences.set(exp.id, exp)
        }
        logger.info('[ExperienceGraph] Loaded experiences', { count: parsed.length })
      }

      this.initialized = true
      logger.info('[ExperienceGraph] Initialized successfully')
    } catch (error) {
      logger.error('[ExperienceGraph] Initialize failed', error)
      this.initialized = true
    }
  }

  /**
   * 从深度反思结果添加经验
   */
  async addFromReflection(reflection: DeepReflection): Promise<string> {
    const { record, causalChain, successFactors } = reflection

    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []

    let prevNodeId: string | null = null

    for (const step of record.steps) {
      const nodeId = createId('node')
      nodes.push({
        id: nodeId,
        type: step.success ? 'action' : 'result',
        name: `${step.server}/${step.tool}`,
        properties: {
          success: step.success,
          duration: step.duration,
          args: step.args
        }
      })

      if (prevNodeId) {
        edges.push({
          from: prevNodeId,
          to: nodeId,
          condition: step.success ? 'proceed' : 'stop'
        })
      }

      if (!step.success && step.error) {
        const errorNodeId = createId('node')
        nodes.push({
          id: errorNodeId,
          type: 'result',
          name: `error: ${step.error.substring(0, 50)}`,
          properties: { error: step.error }
        })
        edges.push({
          from: nodeId,
          to: errorNodeId,
          condition: 'on_error'
        })
      }

      prevNodeId = nodeId
    }

    const taskType = this.inferTaskType(record.goal)

    const embedding = this.generateEmbedding(record.goal, taskType, causalChain)

    const avgDuration = record.steps.reduce((sum, s) => sum + (s.duration || 0), 0) / record.steps.length

    const experience: ExperienceNode = {
      id: createId('exp'),
      taskType,
      taskDescription: record.goal,
      graph: { nodes, edges },
      embedding,
      successRate: record.overallSuccess ? 1.0 : 0.0,
      totalAttempts: 1,
      lastAttempt: Date.now(),
      avgDuration,
      tags: this.extractTags(record.goal, taskType),
      metadata: {
        taskId: record.taskId,
        stepCount: record.steps.length,
        successFactors: successFactors.map(f => f.description)
      }
    }

    this.experiences.set(experience.id, experience)
    await this.save()

    logger.info('[ExperienceGraph] Experience added from reflection', {
      id: experience.id,
      taskType,
      success: record.overallSuccess
    })

    return experience.id
  }

  /**
   * 搜索相似经验
   */
  async search(query: string, limit: number = 5): Promise<ExperienceSearchResult[]> {
    const queryLower = query.toLowerCase()
    const queryType = this.inferTaskType(queryLower)
    const queryEmbedding = this.generateEmbedding(query, queryType, [])

    const results: ExperienceSearchResult[] = []

    for (const exp of this.experiences.values()) {
      const similarity = this.calculateSimilarity(queryEmbedding, exp.embedding)

      const textSimilarity = this.calculateTextSimilarity(queryLower, exp)

      const matchedTags = exp.tags.filter(tag =>
        queryLower.includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(queryLower)
      )

      const combinedScore = (similarity * 0.6) + (textSimilarity * 0.3) + (matchedTags.length * 0.1)

      if (combinedScore > 0.2) {
        results.push({
          experience: exp,
          similarity: combinedScore,
          matchedTags
        })
      }
    }

    results.sort((a, b) => b.similarity - a.similarity)

    const topResults = results.slice(0, limit)

    for (const result of topResults) {
      result.experience.totalAttempts++
      result.experience.lastAttempt = Date.now()
    }

    await this.save()

    return topResults
  }

  /**
   * 通过任务类型搜索
   */
  async searchByType(taskType: string, limit: number = 5): Promise<ExperienceSearchResult[]> {
    const results: ExperienceSearchResult[] = []

    for (const exp of this.experiences.values()) {
      if (exp.taskType === taskType) {
        results.push({
          experience: exp,
          similarity: exp.successRate,
          matchedTags: exp.tags
        })
      }
    }

    results.sort((a, b) => b.experience.successRate - a.experience.successRate)

    return results.slice(0, limit)
  }

  /**
   * 获取经验
   */
  async get(id: string): Promise<ExperienceNode | null> {
    return this.experiences.get(id) || null
  }

  /**
   * 获取所有经验
   */
  async getAll(): Promise<ExperienceNode[]> {
    return Array.from(this.experiences.values())
  }

  /**
   * 更新经验成功率
   */
  async updateSuccessRate(id: string, success: boolean): Promise<void> {
    const exp = this.experiences.get(id)
    if (!exp) return

    const totalSuccess = exp.successRate * exp.totalAttempts + (success ? 1 : 0)
    exp.totalAttempts++
    exp.successRate = totalSuccess / exp.totalAttempts
    exp.lastAttempt = Date.now()

    await this.save()
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number
    successRate: number
    byType: Record<string, { count: number; successRate: number }>
    recentExperiences: ExperienceNode[]
  }> {
    const experiences = Array.from(this.experiences.values())

    if (experiences.length === 0) {
      return {
        total: 0,
        successRate: 0,
        byType: {},
        recentExperiences: []
      }
    }

    const totalSuccessRate = experiences.reduce((sum, e) => sum + e.successRate, 0) / experiences.length

    const byType: Record<string, { count: number; successRate: number }> = {}
    for (const exp of experiences) {
      if (!byType[exp.taskType]) {
        byType[exp.taskType] = { count: 0, successRate: 0 }
      }
      byType[exp.taskType].count++
      byType[exp.taskType].successRate += exp.successRate
    }

    for (const type of Object.keys(byType)) {
      byType[type].successRate /= byType[type].count
    }

    const recentExperiences = experiences
      .sort((a, b) => b.lastAttempt - a.lastAttempt)
      .slice(0, 10)

    return {
      total: experiences.length,
      successRate: totalSuccessRate,
      byType,
      recentExperiences
    }
  }

  /**
   * 删除过期经验
   */
  async pruneOldExperiences(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now()
    let pruned = 0

    for (const [id, exp] of this.experiences.entries()) {
      if (now - exp.lastAttempt > maxAge && exp.totalAttempts <= 1) {
        this.experiences.delete(id)
        pruned++
      }
    }

    if (pruned > 0) {
      await this.save()
      logger.info('[ExperienceGraph] Pruned old experiences', { pruned })
    }

    return pruned
  }

  /**
   * 生成嵌入向量
   */
  private generateEmbedding(
    goal: string,
    taskType: string,
    causalChain: CausalNode[]
  ): number[] {
    const vector = new Array(this.embeddingDimension).fill(0)

    const taskTypeIndex = this.hashString(taskType) % this.embeddingDimension
    vector[taskTypeIndex] += 5

    const words = goal.toLowerCase().split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const index = this.hashString(words[i]) % this.embeddingDimension
      vector[index] += 1
    }

    for (const node of causalChain) {
      const actionWords = node.action.split('/')
      for (const word of actionWords) {
        const index = this.hashString(word) % this.embeddingDimension
        vector[index] += node.result === 'success' ? 0.5 : -0.3
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude
      }
    }

    return vector
  }

  /**
   * 字符串哈希
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }

  /**
   * 计算余弦相似度
   */
  private calculateSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0

    let dotProduct = 0
    let magnitude1 = 0
    let magnitude2 = 0

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i]
      magnitude1 += vec1[i] * vec1[i]
      magnitude2 += vec2[i] * vec2[i]
    }

    const mag1 = Math.sqrt(magnitude1)
    const mag2 = Math.sqrt(magnitude2)

    if (mag1 === 0 || mag2 === 0) return 0

    return dotProduct / (mag1 * mag2)
  }

  /**
   * 计算文本相似度
   */
  private calculateTextSimilarity(query: string, exp: ExperienceNode): number {
    const queryWords = new Set(query.toLowerCase().split(/\s+/))
    const descWords = new Set(exp.taskDescription.toLowerCase().split(/\s+/))

    let matchCount = 0
    for (const word of queryWords) {
      if (descWords.has(word) || exp.taskDescription.toLowerCase().includes(word)) {
        matchCount++
      }
    }

    return matchCount / Math.max(queryWords.size, 1)
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(goal: string): string {
    const goalLower = goal.toLowerCase()

    if (/打开|访问|浏览|navigate|open|visit|go to/i.test(goalLower)) return 'navigation'
    if (/搜索|查询|find|search|query|look up/i.test(goalLower)) return 'search'
    if (/创建|新建|写入|write|create|make/i.test(goalLower)) return 'file_operation'
    if (/删除|remove|delete/i.test(goalLower)) return 'deletion'
    if (/读取|查看|cat|read|view|get content/i.test(goalLower)) return 'reading'
    if (/执行|运行|run|execute|launch/i.test(goalLower)) return 'execution'
    if (/登录|auth|login|sign in/i.test(goalLower)) return 'authentication'
    if (/下载|download|save/i.test(goalLower)) return 'download'
    if (/上传|upload|post/i.test(goalLower)) return 'upload'
    if (/截图|screenshot|capture/i.test(goalLower)) return 'screenshot'
    if (/自动化|automation|auto/i.test(goalLower)) return 'automation'

    return 'general'
  }

  /**
   * 提取标签
   */
  private extractTags(goal: string, taskType: string): string[] {
    const tags = new Set<string>([taskType])

    const keywords: Record<string, string[]> = {
      browser: ['browser', 'chrome', 'firefox', 'edge', '浏览器'],
      web: ['web', 'http', 'url', '网站', '网页'],
      file: ['file', 'folder', 'directory', '文件', '文件夹'],
      command: ['command', 'shell', 'terminal', 'cmd', '命令', '终端'],
      api: ['api', 'http', 'request', 'fetch', '接口', '请求'],
      database: ['database', 'db', 'sql', '数据库'],
      auth: ['auth', 'login', 'password', 'token', '登录', '认证', '权限']
    }

    const goalLower = goal.toLowerCase()
    for (const [tag, words] of Object.entries(keywords)) {
      if (words.some(w => goalLower.includes(w))) {
        tags.add(tag)
      }
    }

    return Array.from(tags)
  }

  /**
   * 保存到磁盘
   */
  private async save(): Promise<void> {
    try {
      const data = Array.from(this.experiences.values())
      await writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      logger.error('[ExperienceGraph] Save failed', error)
    }
  }
}

export const experienceGraph = ExperienceGraph.getInstance()
