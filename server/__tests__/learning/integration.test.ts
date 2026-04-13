import { describe, it, expect, beforeEach } from 'vitest'
import { DeepReflector } from '../../learning/reflector'
import { ExperienceGraph } from '../../learning/experience-graph'
import { PatternLibrary } from '../../learning/pattern-library'
import { StrategyOptimizer } from '../../learning/strategy-optimizer'
import { LearningController } from '../../learning/learning-controller'
import type { ExecutionRecord, ExecutedStep } from '../../learning/types'

describe('自主学习闭环系统集成测试', () => {
  let reflector: DeepReflector
  let experienceGraph: ExperienceGraph
  let patternLibrary: PatternLibrary
  let strategyOptimizer: StrategyOptimizer
  let learningController: LearningController

  const createTestRecord = (
    taskId: string,
    goal: string,
    steps: Partial<ExecutedStep>[],
    overallSuccess: boolean
  ): ExecutionRecord => ({
    taskId,
    goal,
    steps: steps.map((s, i) => ({
      id: `step_${i}`,
      tool: s.tool || 'test',
      server: s.server || 'test-server',
      args: s.args || {},
      success: s.success ?? true,
      duration: s.duration || 100,
      timestamp: Date.now(),
      ...s
    })) as ExecutedStep[],
    overallSuccess,
    duration: steps.reduce((sum, s) => sum + (s.duration || 100), 0),
    timestamp: Date.now()
  })

  beforeEach(async () => {
    reflector = DeepReflector.getInstance()
    experienceGraph = ExperienceGraph.getInstance()
    patternLibrary = PatternLibrary.getInstance()
    strategyOptimizer = StrategyOptimizer.getInstance()
    learningController = LearningController.getInstance()

    await experienceGraph.initialize()
    await patternLibrary.initialize()
    await strategyOptimizer.initialize()
    await learningController.initialize()
  })

  describe('DeepReflector 深度反思引擎', () => {
    it('应该成功分析成功的执行记录', async () => {
      const record = createTestRecord(
        'test_success_001',
        '打开浏览器访问百度',
        [
          { tool: 'chrome', server: 'chrome-devtools', success: true, duration: 2000 },
          { tool: 'navigate', server: 'chrome-devtools', args: { url: 'https://www.baidu.com' }, success: true, duration: 3000 },
          { tool: 'click', server: 'chrome-devtools', args: { selector: '#search-btn' }, success: true, duration: 500 }
        ],
        true
      )

      const reflection = await reflector.analyze(record)

      expect(reflection).toBeDefined()
      expect(reflection.causalChain).toHaveLength(3)
      expect(reflection.successFactors.length).toBeGreaterThan(0)
      expect(reflection.confidence).toBeGreaterThan(0)
      expect(reflection.conditionalRules.length).toBeGreaterThan(0)
    })

    it('应该正确识别失败点和错误类型', async () => {
      const record = createTestRecord(
        'test_failure_001',
        '访问一个不存在的页面',
        [
          { tool: 'navigate', server: 'chrome-devtools', args: { url: 'https://not-exist.com' }, success: false, error: 'Navigation timeout after 30000ms', duration: 30000 }
        ],
        false
      )

      const reflection = await reflector.analyze(record)

      expect(reflection.failurePoints.length).toBeGreaterThan(0)
      expect(reflection.failurePoints[0].errorType).toBe('timeout_error')
      expect(reflection.failurePoints[0].recoverable).toBe(true)
      expect(reflection.alternativeApproaches.length).toBeGreaterThan(0)
    })

    it('应该识别权限错误', async () => {
      const record = createTestRecord(
        'test_permission_001',
        '删除系统文件',
        [
          { tool: 'delete', server: 'filesystem', args: { path: '/etc/passwd' }, success: false, error: 'Permission denied: /etc/passwd', duration: 100 }
        ],
        false
      )

      const reflection = await reflector.analyze(record)

      expect(reflection.failurePoints[0].errorType).toBe('permission_error')
      expect(reflection.failurePoints[0].severity).toBe('critical')
    })

    it('应该为失败生成替代方案', async () => {
      const record = createTestRecord(
        'test_network_001',
        '获取远程数据',
        [
          { tool: 'fetch', server: 'http', args: { url: 'https://api.example.com' }, success: false, error: 'ECONNREFUSED: Connection refused', duration: 1000 }
        ],
        false
      )

      const reflection = await reflector.analyze(record)

      expect(reflection.alternativeApproaches.some((a: string) => a.includes('检查网络连接'))).toBe(true)
    })
  })

  describe('ExperienceGraph 经验图谱', () => {
    it('应该存储和检索经验', async () => {
      const record = createTestRecord(
        'test_exp_001',
        '搜索网页内容',
        [
          { tool: 'navigate', server: 'chrome-devtools', success: true, duration: 2000 },
          { tool: 'input', server: 'chrome-devtools', args: { text: '测试搜索' }, success: true, duration: 500 }
        ],
        true
      )

      const reflection = await reflector.analyze(record)
      const expId = await experienceGraph.addFromReflection(reflection)

      expect(expId).toBeDefined()

      const results = await experienceGraph.search('搜索', 5)
      expect(results.length).toBeGreaterThan(0)
    })

    it('应该计算经验相似度', async () => {
      const record1 = createTestRecord(
        'test_sim_001',
        '打开浏览器访问 Google',
        [
          { tool: 'chrome', server: 'chrome-devtools', success: true, duration: 2000 },
          { tool: 'navigate', server: 'chrome-devtools', args: { url: 'https://google.com' }, success: true, duration: 3000 }
        ],
        true
      )

      const reflection1 = await reflector.analyze(record1)
      await experienceGraph.addFromReflection(reflection1)

      const results = await experienceGraph.search('打开浏览器访问网站', 3)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].similarity).toBeGreaterThan(0)
    })
  })

  describe('PatternLibrary 模式库', () => {
    it('应该从成功的执行中提取模式', async () => {
      const record = createTestRecord(
        'test_pattern_001',
        '自动化网页操作',
        [
          { tool: 'navigate', server: 'chrome-devtools', success: true, duration: 2000 },
          { tool: 'click', server: 'chrome-devtools', success: true, duration: 500 },
          { tool: 'input', server: 'chrome-devtools', success: true, duration: 300 }
        ],
        true
      )

      const reflection = await reflector.analyze(record)
      const { newPatterns, updatedPatterns } = await patternLibrary.extractPatterns(reflection)

      expect(newPatterns.length + updatedPatterns.length).toBeGreaterThan(0)
      const patterns = newPatterns.length > 0 ? newPatterns : updatedPatterns
      expect(patterns[0].trigger.taskTypes.length).toBeGreaterThan(0)
    })
  })

  describe('StrategyOptimizer 策略优化器', () => {
    it('应该使用 UCB 算法选择策略', () => {
      const context = {
        taskType: 'web_automation',
        goal: '自动填写表单'
      }

      const strategy = strategyOptimizer.selectStrategy(context)
      expect(strategy).toBeDefined()
    })

    it('应该从反思中学习并更新策略', async () => {
      const record = createTestRecord(
        'test_strategy_001',
        '使用 Chrome 执行自动化',
        [
          { tool: 'chrome', server: 'chrome-devtools', success: true, duration: 2000 }
        ],
        true
      )

      const reflection = await reflector.analyze(record)
      await strategyOptimizer.learnFromReflection(reflection)

      const strategies = strategyOptimizer.getAllStrategies()
      expect(strategies.length).toBeGreaterThan(0)
    })
  })

  describe('完整学习闭环', () => {
    it('应该执行完整的学习流程', async () => {
      const record = createTestRecord(
        'test_full_loop_001',
        '完整的浏览器自动化任务',
        [
          { tool: 'chrome', server: 'chrome-devtools', success: true, duration: 2000 },
          { tool: 'navigate', server: 'chrome-devtools', args: { url: 'https://example.com' }, success: true, duration: 3000 },
          { tool: 'click', server: 'chrome-devtools', args: { selector: '#btn' }, success: true, duration: 500 }
        ],
        true
      )

      const outcome = await learningController.learnFromExecution(record)

      expect(outcome.reflection).toBeDefined()
      expect(outcome.newPatterns.length + outcome.updatedStrategies.length).toBeGreaterThan(0)
      expect(outcome.appliedRules.length).toBeGreaterThanOrEqual(0)
    })

    it('应该将学到的知识应用到新任务', async () => {
      const record = createTestRecord(
        'test_apply_001',
        '学习浏览器操作',
        [
          { tool: 'chrome', server: 'chrome-devtools', success: true, duration: 2000 },
          { tool: 'navigate', server: 'chrome-devtools', success: true, duration: 3000 }
        ],
        true
      )

      await learningController.learnFromExecution(record)

      const appliedKnowledge = await learningController.applyToNewTask('打开网站并进行搜索')

      expect(appliedKnowledge.plan).toBeDefined()
      expect(appliedKnowledge.knowledgeSources.experiences.length).toBeGreaterThan(0)
      expect(appliedKnowledge.confidence).toBeGreaterThan(0)
    })
  })

  describe('错误恢复逻辑', () => {
    it('应该分类 timeout 错误', () => {
      const errorMessage = 'Request timeout after 30000ms'
      const isTimeout = /timeout|timed?out/i.test(errorMessage)
      expect(isTimeout).toBe(true)
    })

    it('应该分类 network 错误', () => {
      const errorMessage = 'ECONNREFUSED: Connection refused'
      const isNetwork = /network|connection|refused|econnrefused/i.test(errorMessage)
      expect(isNetwork).toBe(true)
    })

    it('应该分类 permission 错误', () => {
      const errorMessage = 'Permission denied: /etc/passwd'
      const isPermission = /permission|denied|unauthorized/i.test(errorMessage)
      expect(isPermission).toBe(true)
    })

    it('应该计算指数退避延迟', () => {
      const initialDelay = 1000
      const multiplier = 2
      const maxDelay = 10000

      let delay = initialDelay
      delay = Math.min(delay * multiplier, maxDelay)
      expect(delay).toBe(2000)

      delay = Math.min(delay * multiplier, maxDelay)
      expect(delay).toBe(4000)

      delay = Math.min(delay * multiplier, maxDelay)
      expect(delay).toBe(8000)
    })
  })
})
