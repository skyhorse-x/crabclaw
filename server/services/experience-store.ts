/**
 * 经验库服务
 * 负责跨会话经验积累、模式识别和知识复用
 */

import { logger } from './logger.service'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { PATHS } from '../shared/constants'

export interface Experience {
  id: string
  category: string
  goal: string
  approach: string
  success: boolean
  errorPatterns: string[]
  lessons: string[]
  timestamp: number
  usageCount: number
  lastUsed: number
  tags: string[]
}

export interface ExperienceStats {
  total: number
  successRate: number
  topCategories: { category: string; count: number }[]
  recentLearnings: string[]
}

export class ExperienceStore {
  private static instance: ExperienceStore
  private experiences: Map<string, Experience> = new Map()
  private storagePath: string
  private initialized: boolean = false

  private constructor() {
    this.storagePath = join(PATHS.DATA_DIR, 'experience-store.json')
  }

  static getInstance(): ExperienceStore {
    if (!ExperienceStore.instance) {
      ExperienceStore.instance = new ExperienceStore()
    }
    return ExperienceStore.instance
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
        const parsed = JSON.parse(data) as Experience[]
        for (const exp of parsed) {
          this.experiences.set(exp.id, exp)
        }
        logger.info('[ExperienceStore] Loaded experiences', { count: parsed.length })
      }

      this.initialized = true
    } catch (error) {
      logger.error('[ExperienceStore] Initialize failed', error)
      this.initialized = true
    }
  }

  /**
   * 添加经验
   */
  async add(
    category: string,
    goal: string,
    approach: string,
    success: boolean,
    errorPatterns: string[] = [],
    lessons: string[] = [],
    tags: string[] = []
  ): Promise<Experience> {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const experience: Experience = {
      id,
      category,
      goal: goal.substring(0, 200),
      approach: approach.substring(0, 500),
      success,
      errorPatterns,
      lessons,
      timestamp: Date.now(),
      usageCount: 0,
      lastUsed: Date.now(),
      tags: [...new Set([category, ...tags])]
    }

    this.experiences.set(id, experience)
    await this.save()

    logger.info('[ExperienceStore] Experience added', { id, category, success })

    return experience
  }

  /**
   * 搜索相关经验
   */
  async search(query: string, limit: number = 3): Promise<Experience[]> {
    const queryLower = query.toLowerCase()
    const results: Experience[] = []

    for (const exp of this.experiences.values()) {
      const score = this.calculateRelevance(queryLower, exp)
      if (score > 0.3) {
        results.push({ ...exp, usageCount: exp.usageCount + score })
      }
    }

    results.sort((a, b) => b.usageCount - a.usageCount)

    const limited = results.slice(0, limit)

    for (const exp of limited) {
      exp.usageCount++
      exp.lastUsed = Date.now()
    }

    await this.save()

    return limited
  }

  /**
   * 计算相关性
   */
  private calculateRelevance(query: string, exp: Experience): number {
    let score = 0

    if (exp.goal.toLowerCase().includes(query)) {
      score += 0.5
    }
    if (exp.approach.toLowerCase().includes(query)) {
      score += 0.3
    }
    if (exp.category.toLowerCase().includes(query)) {
      score += 0.2
    }
    for (const tag of exp.tags) {
      if (tag.toLowerCase().includes(query)) {
        score += 0.1
      }
    }
    for (const lesson of exp.lessons) {
      if (lesson.toLowerCase().includes(query)) {
        score += 0.2
      }
    }

    if (exp.success) {
      score *= 1.2
    }

    return Math.min(score, 1.0)
  }

  /**
   * 获取经验统计
   */
  async getStats(): Promise<ExperienceStats> {
    const all = Array.from(this.experiences.values())

    const categoryCount = new Map<string, number>()
    for (const exp of all) {
      categoryCount.set(exp.category, (categoryCount.get(exp.category) || 0) + 1)
    }

    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const successCount = all.filter(e => e.success).length
    const successRate = all.length > 0 ? Math.round((successCount / all.length) * 100) : 0

    const recentLearnings = all
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map(e => e.lessons[0])
      .filter(Boolean)

    return {
      total: all.length,
      successRate,
      topCategories,
      recentLearnings
    }
  }

  /**
   * 获取类别的成功经验
   */
  async getSuccessfulByCategory(category: string, limit: number = 3): Promise<Experience[]> {
    return Array.from(this.experiences.values())
      .filter(e => e.category === category && e.success)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit)
  }

  /**
   * 获取基于错误的经验
   */
  async getByErrorPattern(pattern: string, limit: number = 3): Promise<Experience[]> {
    return Array.from(this.experiences.values())
      .filter(e => e.errorPatterns.includes(pattern))
      .sort((a, b) => {
        if (a.success !== b.success) {
          return a.success ? -1 : 1
        }
        return b.usageCount - a.usageCount
      })
      .slice(0, limit)
  }

  /**
   * 保存到文件
   */
  private async save(): Promise<void> {
    try {
      const data = Array.from(this.experiences.values())
      const json = JSON.stringify(data, null, 2)
      await writeFile(this.storagePath, json, 'utf-8')
    } catch (error) {
      logger.error('[ExperienceStore] Save failed', error)
    }
  }
}

export const experienceStore = ExperienceStore.getInstance()
