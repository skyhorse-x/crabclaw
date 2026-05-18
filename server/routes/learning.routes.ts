/**
 * 学习系统 API 路由
 * 提供学习状态、经验和模式的查询接口
 */

import type { Request, Response } from 'express'
import { enhancedLearningService } from '../services/enhanced-learning.service'
import { experienceGraph } from '../learning/experience-graph'
import { patternLibrary } from '../learning/pattern-library'
import { strategyOptimizer } from '../learning/strategy-optimizer'

export async function handleLearningStatus(_req: Request, res: Response) {
  try {
    const status = await enhancedLearningService.getStatus()
    res.json({ success: true, data: status })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleGetExperiences(_req: Request, res: Response) {
  try {
    const experiences = await experienceGraph.getAll()
    res.json({
      success: true,
      data: {
        total: experiences.length,
        experiences: experiences.map(exp => ({
          id: exp.id,
          taskType: exp.taskType,
          taskDescription: exp.taskDescription,
          successRate: exp.successRate,
          totalAttempts: exp.totalAttempts,
          lastAttempt: exp.lastAttempt,
          avgDuration: exp.avgDuration,
          tags: exp.tags
        }))
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleSearchExperiences(req: Request, res: Response) {
  try {
    const q = req.query.q as string
    const limit = parseInt(req.query.limit as string) || 5

    if (!q) {
      res.status(400).json({ success: false, error: 'Query parameter "q" is required' })
      return
    }

    const results = await experienceGraph.search(q, limit)
    res.json({
      success: true,
      data: {
        query: q,
        results: results.map(r => ({
          id: r.experience.id,
          taskType: r.experience.taskType,
          taskDescription: r.experience.taskDescription,
          similarity: r.similarity,
          successRate: r.experience.successRate,
          totalAttempts: r.experience.totalAttempts,
          matchedTags: r.matchedTags
        }))
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleGetPatterns(_req: Request, res: Response) {
  try {
    const patterns = patternLibrary.getAllPatterns()
    res.json({
      success: true,
      data: {
        total: patterns.length,
        patterns: patterns.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          taskTypes: p.trigger.taskTypes,
          successRate: p.effectiveness.successRate,
          sampleSize: p.effectiveness.sampleSize,
          trend: p.effectiveness.trend,
          domains: p.applicability.domains
        }))
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleMatchPatterns(req: Request, res: Response) {
  try {
    const task = req.query.task as string

    if (!task) {
      res.status(400).json({ success: false, error: 'Query parameter "task" is required' })
      return
    }

    const result = await patternLibrary.match(task)
    res.json({
      success: true,
      data: {
        task,
        patterns: result.patterns.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          confidence: p.applicability.confidence,
          successRate: p.effectiveness.successRate
        })),
        failureWarnings: result.failureWarnings.map(f => ({
          errorType: f.errorType,
          symptoms: f.symptoms.slice(0, 3),
          prevention: f.prevention.slice(0, 3)
        }))
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleGetStrategies(_req: Request, res: Response) {
  try {
    const strategies = strategyOptimizer.getAllStrategies()
    const stats = strategyOptimizer.getStats()
    res.json({
      success: true,
      data: {
        stats,
        strategies: strategies.map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          totalAttempts: s.performance.totalAttempts,
          successRate: s.performance.totalAttempts > 0
            ? s.performance.successCount / s.performance.totalAttempts
            : 0,
          trend: s.performance.trend,
          rulesCount: s.rules.length
        }))
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleGetInsights(req: Request, res: Response) {
  try {
    const task = req.query.task as string

    if (!task) {
      res.status(400).json({ success: false, error: 'Query parameter "task" is required' })
      return
    }

    const insights = await enhancedLearningService.getInsightsForTask(task)
    res.json({ success: true, data: insights })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleRunOptimization(_req: Request, res: Response) {
  try {
    const report = await enhancedLearningService.runOptimization()
    res.json({
      success: report.success,
      data: report.report,
      error: report.error
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handleGetLearningStats(_req: Request, res: Response) {
  try {
    const expStats = await experienceGraph.getStats()
    const patternStats = patternLibrary.getStats()
    const strategyStats = strategyOptimizer.getStats()
    res.json({
      success: true,
      data: {
        experiences: {
          total: expStats.total,
          successRate: expStats.successRate,
          byType: expStats.byType,
          recentCount: expStats.recentExperiences.length
        },
        patterns: {
          total: patternStats.totalPatterns,
          byType: patternStats.byType,
          bySuccessRate: patternStats.bySuccessRate,
          totalFailures: patternStats.totalFailures
        },
        strategies: {
          total: strategyStats.total,
          byType: strategyStats.byType,
          avgSuccessRate: strategyStats.avgSuccessRate,
          improving: strategyStats.improving,
          declining: strategyStats.declining
        }
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handlePruneExperiences(req: Request, res: Response) {
  try {
    const maxAge = parseInt(req.query.maxAge as string) || 30 * 24 * 60 * 60 * 1000
    const pruned = await experienceGraph.pruneOldExperiences(maxAge)
    res.json({ success: true, data: { pruned } })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function handlePrunePatterns(req: Request, res: Response) {
  try {
    const minRate = parseFloat(req.query.minRate as string) || 0.3
    const pruned = await patternLibrary.pruneLowQualityPatterns(minRate)
    res.json({ success: true, data: { pruned } })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function handleLearningRoute(req: Request, res: Response) {
  const path = req.path.replace('/api/learning', '')

  switch (path) {
    case '/status':
      return handleLearningStatus(req, res)
    case '/experiences':
      if (req.method === 'GET') return handleGetExperiences(req, res)
      break
    case '/experiences/search':
      return handleSearchExperiences(req, res)
    case '/patterns':
      if (req.method === 'GET') return handleGetPatterns(req, res)
      break
    case '/patterns/match':
      return handleMatchPatterns(req, res)
    case '/strategies':
      return handleGetStrategies(req, res)
    case '/insights':
      return handleGetInsights(req, res)
    case '/optimize':
      if (req.method === 'POST') return handleRunOptimization(req, res)
      break
    case '/stats':
      return handleGetLearningStats(req, res)
    case '/experiences/prune':
      if (req.method === 'DELETE') return handlePruneExperiences(req, res)
      break
    case '/patterns/prune':
      if (req.method === 'DELETE') return handlePrunePatterns(req, res)
      break
  }

  return res.status(404).json({ success: false, error: 'Route not found' })
}
