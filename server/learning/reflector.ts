/**
 * 深度反思引擎
 * 核心能力：因果链分析、条件规则提炼、替代方案生成
 */

import { logger } from '../services/logger.service'
import { createId } from '../shared/utils'
import type {
  ExecutionRecord,
  ExecutedStep,
  DeepReflection,
  CausalNode,
  FailurePoint,
  SuccessFactor,
  ConditionalRule
} from './types'

export class DeepReflector {
  private static instance: DeepReflector

  static getInstance(): DeepReflector {
    if (!DeepReflector.instance) {
      DeepReflector.instance = new DeepReflector()
    }
    return DeepReflector.instance
  }

  /**
   * 执行深度反思分析
   */
  async analyze(record: ExecutionRecord): Promise<DeepReflection> {
    logger.info('[DeepReflector] Starting deep reflection analysis', { taskId: record.taskId })

    const causalChain = this.buildCausalChain(record)
    const failurePoints = this.identifyFailurePoints(record)
    const successFactors = this.identifySuccessFactors(record)
    const conditionalRules = this.extractConditionalRules(record, causalChain)
    const alternativeApproaches = this.generateAlternatives(record, failurePoints)

    const confidence = this.calculateConfidence(record, causalChain, failurePoints)

    const reflection: DeepReflection = {
      record,
      causalChain,
      successFactors,
      failurePoints,
      conditionalRules,
      alternativeApproaches,
      confidence,
      timestamp: Date.now()
    }

    logger.info('[DeepReflector] Deep reflection completed', {
      taskId: record.taskId,
      causalChainNodes: causalChain.length,
      failurePoints: failurePoints.length,
      conditionalRules: conditionalRules.length,
      confidence: Math.round(confidence * 100) + '%'
    })

    return reflection
  }

  /**
   * 构建因果链
   * 从结果向前追溯原因，从原因向后推演结果
   */
  private buildCausalChain(record: ExecutionRecord): CausalNode[] {
    const nodes: CausalNode[] = []

    for (let i = 0; i < record.steps.length; i++) {
      const step = record.steps[i]
      const prevStep = i > 0 ? record.steps[i - 1] : undefined
      const nextStep = i < record.steps.length - 1 ? record.steps[i + 1] : undefined

      const cause = this.determineCause(step, prevStep, record)
      const effect = this.determineEffect(step, nextStep, record)

      const node: CausalNode = {
        id: `node_${i}`,
        action: `${step.server}/${step.tool}`,
        result: step.success ? 'success' : 'failure',
        cause,
        effect,
        children: [],
        confidence: step.success ? 0.9 : this.calculateErrorConfidence(step.error)
      }

      if (!step.success && step.error) {
        const childNode = this.analyzeErrorChain(step.error, i)
        if (childNode) {
          node.children.push(childNode)
        }
      }

      nodes.push(node)
    }

    return nodes
  }

  /**
   * 分析错误链 - 递归找出根本原因
   */
  private analyzeErrorChain(error: string, depth: number): CausalNode | null {
    if (depth > 3) return null

    const rootCause = this.findRootCause(error)
    if (!rootCause) return null

    return {
      id: `error_node_${depth}`,
      action: rootCause.cause,
      result: 'failure',
      cause: error,
      effect: rootCause.effect,
      children: [],
      confidence: 0.7
    }
  }

  /**
   * 找出根本原因
   */
  private findRootCause(error: string): { cause: string; effect: string } | null {
    const errorPatterns: Array<{ pattern: RegExp; cause: string; effect: string }> = [
      {
        pattern: /timeout|timed?out/i,
        cause: '操作超时',
        effect: '任务执行时间超出预期，可能需要增加延迟或检查网络'
      },
      {
        pattern: /permission|denied|unauthorized/i,
        cause: '权限不足',
        effect: '无法访问资源，需要检查文件权限或使用更高权限'
      },
      {
        pattern: /not found|enoent|no such file/i,
        cause: '资源不存在',
        effect: '目标路径或资源缺失，需要先创建或确认路径正确'
      },
      {
        pattern: /network|connection|refused|ECONNREFUSED/i,
        cause: '网络问题',
        effect: '无法建立网络连接，检查网络状态或服务可用性'
      },
      {
        pattern: /already running|is running/i,
        cause: '资源冲突',
        effect: '目标资源已被占用，需要先释放或使用不同实例'
      },
      {
        pattern: /invalid|schema|type error/i,
        cause: '输入错误',
        effect: '参数格式或类型不符合要求，需要检查输入规范'
      },
      {
        pattern: /chrome|browser|headless/i,
        cause: '浏览器环境问题',
        effect: '浏览器配置或状态异常，可能需要重置浏览器实例'
      },
      {
        pattern: /access denied|outside allowed|sandbox/i,
        cause: '路径访问限制',
        effect: '尝试访问沙箱外的路径，系统限制了操作范围'
      }
    ]

    for (const { pattern, cause, effect } of errorPatterns) {
      if (pattern.test(error)) {
        return { cause, effect }
      }
    }

    return null
  }

  /**
   * 确定当前步骤的原因
   */
  private determineCause(step: ExecutedStep, prevStep: ExecutedStep | undefined, _record: ExecutionRecord): string {
    if (step.success) {
      if (prevStep?.success === false) {
        return '从前一步失败中恢复'
      }
      return '正常执行'
    }

    if (step.error) {
      const rootCause = this.findRootCause(step.error)
      return rootCause?.cause || '未知错误'
    }

    return '执行异常'
  }

  /**
   * 确定当前步骤的影响
   */
  private determineEffect(step: ExecutedStep, nextStep: ExecutedStep | undefined, record: ExecutionRecord): string {
    if (!step.success) {
      const failedTask = record.steps.filter(s => !s.success).length
      if (failedTask === record.steps.length) {
        return '导致整个任务失败'
      }
      return `导致后续${record.steps.length - record.steps.indexOf(step) - 1}个步骤无法执行`
    }

    if (nextStep && !nextStep.success) {
      return '为下一步创造了前置条件'
    }

    return '成功完成，任务可继续'
  }

  /**
   * 识别失败点
   */
  private identifyFailurePoints(record: ExecutionRecord): FailurePoint[] {
    const failurePoints: FailurePoint[] = []

    for (const step of record.steps) {
      if (!step.success && step.error) {
        const errorType = this.classifyError(step.error)
        const severity = this.assessSeverity(step.error, step.tool)

        failurePoints.push({
          stepId: step.id,
          errorType,
          errorMessage: step.error,
          rootCause: this.findRootCause(step.error)?.cause || '未知原因',
          severity,
          recoverable: this.isRecoverable(step.error)
        })
      }
    }

    return failurePoints
  }

  /**
   * 识别成功因素
   */
  private identifySuccessFactors(record: ExecutionRecord): SuccessFactor[] {
    const factors: SuccessFactor[] = []
    const successfulSteps = record.steps.filter(s => s.success)

    for (const step of successfulSteps) {
      factors.push({
        stepId: step.id,
        description: `成功执行 ${step.server}/${step.tool}`,
        importance: this.assessImportance(step, record)
      })
    }

    if (record.overallSuccess && record.duration < 60000) {
      factors.push({
        stepId: 'performance',
        description: '在合理时间内完成',
        importance: 0.7
      })
    }

    return factors
  }

  /**
   * 提取条件规则
   * 从成功/失败经验中提炼 "在XX条件下应该用YY方法" 的规则
   */
  private extractConditionalRules(record: ExecutionRecord, causalChain: CausalNode[]): ConditionalRule[] {
    const rules: ConditionalRule[] = []

    const goal = record.goal.toLowerCase()
    const taskType = this.inferTaskType(goal)

    for (const node of causalChain) {
      if (!node.result || node.result === 'neutral') continue

      const condition = this.buildCondition(goal, taskType, node)
      if (!condition) continue

      const rule: ConditionalRule = {
        id: createId('rule'),
        condition,
        conditionVector: this.textToVector(condition),
        action: node.action,
        successRate: node.result === 'success' ? 1.0 : 0.0,
        sampleCount: 1,
        source: record.taskId,
        lastValidated: Date.now(),
        active: true
      }

      rules.push(rule)
    }

    return rules
  }

  /**
   * 根据任务目标失败步骤生成替代方案
   */
  private generateAlternatives(record: ExecutionRecord, failurePoints: FailurePoint[]): string[] {
    const alternatives: string[] = []

    for (const fp of failurePoints) {
      const alts = this.suggestAlternatives(fp, record)
      alternatives.push(...alts)
    }

    if (record.overallSuccess) {
      alternatives.push('当前方案已验证成功，可作为后续参考')
    }

    return [...new Set(alternatives)]
  }

  /**
   * 为失败点建议替代方案
   */
  private suggestAlternatives(fp: FailurePoint, _record: ExecutionRecord): string[] {
    const alternatives: string[] = []

    switch (fp.errorType) {
      case 'timeout_error':
        alternatives.push('增加超时时间')
        alternatives.push('检查网络连接后重试')
        alternatives.push('使用更快的工具替代')
        break
      case 'permission_error':
        alternatives.push('使用 shell 命令替代受限工具')
        alternatives.push('检查并修改文件权限')
        alternatives.push('切换到有权限的目录执行')
        break
      case 'resource_not_found':
        alternatives.push('先检查资源是否存在')
        alternatives.push('创建缺失的资源')
        alternatives.push('使用相对路径而非绝对路径')
        break
      case 'network_error':
        alternatives.push('检查网络连接')
        alternatives.push('使用本地资源替代远程资源')
        alternatives.push('添加重试机制')
        break
      case 'browser_error':
        alternatives.push('重启浏览器实例')
        alternatives.push('使用不同的浏览器配置')
        alternatives.push('检查浏览器是否已运行')
        break
      case 'path_access_error':
        alternatives.push('使用 $HOME/Desktop 获取桌面路径')
        alternatives.push('使用相对路径避免沙箱限制')
        alternatives.push('请求用户确认路径')
        break
    }

    return alternatives
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: string): string {
    if (/timeout|timed?out/i.test(error)) return 'timeout_error'
    if (/permission|denied|unauthorized/i.test(error)) return 'permission_error'
    if (/not found|enoent|no such file/i.test(error)) return 'resource_not_found'
    if (/network|connection|refused/i.test(error)) return 'network_error'
    if (/chrome|browser|headless/i.test(error)) return 'browser_error'
    if (/access denied|outside allowed/i.test(error)) return 'path_access_error'
    if (/invalid|schema|type error/i.test(error)) return 'invalid_input'
    return 'unknown_error'
  }

  /**
   * 评估错误严重性
   */
  private assessSeverity(error: string, _tool: string): 'critical' | 'major' | 'minor' {
    if (/permission|denied|access/i.test(error)) return 'critical'
    if (/not found|missing/i.test(error)) return 'major'
    if (/timeout/i.test(error)) return 'major'
    return 'minor'
  }

  /**
   * 判断错误是否可恢复
   */
  private isRecoverable(error: string): boolean {
    const recoverablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /refused/i,
      /busy/i,
      /already running/i
    ]

    return recoverablePatterns.some(p => p.test(error))
  }

  /**
   * 计算错误置信度
   */
  private calculateErrorConfidence(error?: string): number {
    if (!error) return 0.5
    return this.findRootCause(error) ? 0.8 : 0.4
  }

  /**
   * 评估步骤重要性
   */
  private assessImportance(step: ExecutedStep, record: ExecutionRecord): number {
    const index = record.steps.indexOf(step)
    const total = record.steps.length

    const positionScore = index === 0 ? 0.8 : index === total - 1 ? 0.9 : 0.6

    const toolScore = step.tool.includes('execute') ? 0.9 : 0.7

    return (positionScore + toolScore) / 2
  }

  /**
   * 推断任务类型
   */
  private inferTaskType(goal: string): string {
    if (/打开|访问|浏览|navigate|open|visit/i.test(goal)) return 'navigation'
    if (/搜索|查询|find|search|query/i.test(goal)) return 'search'
    if (/创建|新建|写入|write|create|new/i.test(goal)) return 'file_operation'
    if (/删除|remove|rm/i.test(goal)) return 'deletion'
    if (/读取|查看|cat|read|view/i.test(goal)) return 'reading'
    if (/执行|运行|run|execute|shell/i.test(goal)) return 'execution'
    if (/登录|auth|login/i.test(goal)) return 'authentication'
    return 'general'
  }

  /**
   * 构建条件描述
   */
  private buildCondition(_goal: string, taskType: string, node: CausalNode): string | null {
    if (node.result === 'success') {
      return `当任务类型为"${taskType}"时，执行"${node.action}"可成功`
    }

    if (node.result === 'failure') {
      return `当任务类型为"${taskType}"时，执行"${node.action}"会失败`
    }

    return null
  }

  /**
   * 文本转向量（简易版，用于条件匹配）
   */
  private textToVector(text: string): number[] {
    const dimension = 64
    const vector = new Array(dimension).fill(0)

    for (let i = 0; i < text.length; i++) {
      vector[i % dimension] += text.charCodeAt(i)
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    return vector.map(v => magnitude > 0 ? v / magnitude : 0)
  }

  /**
   * 计算整体置信度
   */
  private calculateConfidence(
    record: ExecutionRecord,
    causalChain: CausalNode[],
    failurePoints: FailurePoint[]
  ): number {
    let confidence = 1.0

    if (record.steps.length === 0) {
      return 0.0
    }

    const successRate = record.steps.filter(s => s.success).length / record.steps.length
    confidence *= 0.5 + (successRate * 0.5)

    const hasRootCauses = failurePoints.every(fp => this.findRootCause(fp.errorMessage))
    if (hasRootCauses) {
      confidence *= 1.1
    }

    if (causalChain.length > 0) {
      const avgNodeConfidence = causalChain.reduce((sum, n) => sum + n.confidence, 0) / causalChain.length
      confidence *= (0.5 + avgNodeConfidence * 0.5)
    }

    return Math.min(confidence, 1.0)
  }
}

export const deepReflector = DeepReflector.getInstance()
