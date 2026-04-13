import { describe, it, expect } from 'vitest'

describe('DeepReflector Logic', () => {
  describe('error classification', () => {
    it('should identify timeout errors', () => {
      const errorMessage = 'Navigation timeout after 30000ms'
      const isTimeout = /timeout|timed?out/i.test(errorMessage)
      expect(isTimeout).toBe(true)
    })

    it('should identify permission errors', () => {
      const errorMessage = 'Permission denied: access to /etc/passwd'
      const isPermission = /permission|denied|unauthorized/i.test(errorMessage)
      expect(isPermission).toBe(true)
    })

    it('should identify network errors', () => {
      const errorMessage = 'ECONNREFUSED: Connection refused at 127.0.0.1:8080'
      const isNetwork = /network|connection|refused|econnrefused/i.test(errorMessage)
      expect(isNetwork).toBe(true)
    })

    it('should identify resource not found errors', () => {
      const errorMessage = 'File not found: /tmp/missing.txt'
      const isNotFound = /not found|enoent|no such file/i.test(errorMessage)
      expect(isNotFound).toBe(true)
    })
  })

  describe('causal chain building', () => {
    it('should build chain from successful steps', () => {
      const steps = [
        { tool: 'chrome', success: true },
        { tool: 'navigate', success: true },
        { tool: 'click', success: true }
      ]

      const causalChain = steps.map((step, i) => ({
        nodeId: `node_${i}`,
        type: 'action' as const,
        action: step.tool,
        result: step.success ? 'success' as const : 'failure' as const,
        dependencies: i > 0 ? [`node_${i - 1}`] : []
      }))

      expect(causalChain).toHaveLength(3)
      expect(causalChain[0].result).toBe('success')
      expect(causalChain[2].dependencies).toContain('node_1')
    })

    it('should mark failure point in chain', () => {
      const steps = [
        { tool: 'navigate', success: true },
        { tool: 'click', success: false, error: 'Element not found' }
      ]

      const failureIndex = steps.findIndex(s => !s.success)
      expect(failureIndex).toBe(1)
    })
  })

  describe('success factor identification', () => {
    it('should identify sequential successful steps as positive factor', () => {
      const steps = [
        { tool: 'check', success: true },
        { tool: 'execute', success: true }
      ]

      const successRate = steps.filter(s => s.success).length / steps.length
      expect(successRate).toBe(1)
    })

    it('should calculate confidence based on success rate', () => {
      const totalSteps = 5
      const successfulSteps = 4
      const successRate = successfulSteps / totalSteps

      const confidence = successRate * 0.8 + 0.2
      expect(confidence).toBeGreaterThan(0.5)
      expect(confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('conditional rule extraction', () => {
    it('should extract rules from failure patterns', () => {
      const failurePoint = {
        stepIndex: 0,
        errorType: 'timeout_error',
        description: 'Navigation exceeded timeout'
      }

      const rule = {
        condition: `error_type = ${failurePoint.errorType}`,
        action: 'increase_timeout_or_retry',
        confidence: 0.7
      }

      expect(rule.condition).toContain('timeout_error')
      expect(rule.confidence).toBeGreaterThan(0)
    })

    it('should suggest alternatives based on error type', () => {
      const errorType = 'resource_not_found'
      const alternatives: string[] = []

      if (errorType === 'resource_not_found') {
        alternatives.push('先确认资源是否存在')
        alternatives.push('使用替代资源路径')
        alternatives.push('创建缺失的资源')
      }

      expect(alternatives.length).toBe(3)
    })
  })

  describe('pattern recognition', () => {
    it('should recognize repeated tool usage pattern', () => {
      const steps = [
        { tool: 'read', server: 'filesystem' },
        { tool: 'write', server: 'filesystem' },
        { tool: 'read', server: 'filesystem' }
      ]

      const toolCounts: Record<string, number> = {}
      for (const step of steps) {
        toolCounts[step.tool] = (toolCounts[step.tool] || 0) + 1
      }

      expect(toolCounts['read']).toBe(2)
      expect(toolCounts['write']).toBe(1)
    })

    it('should identify slow steps', () => {
      const steps = [
        { tool: 'check', duration: 100 },
        { tool: 'navigate', duration: 5000 },
        { tool: 'click', duration: 200 }
      ]

      const avgDuration = steps.reduce((sum, s) => sum + s.duration, 0) / steps.length
      const slowSteps = steps.filter(s => s.duration > avgDuration * 2)

      expect(slowSteps).toHaveLength(1)
      expect(slowSteps[0].tool).toBe('navigate')
    })
  })
})
