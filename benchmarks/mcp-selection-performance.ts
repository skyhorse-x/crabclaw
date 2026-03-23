/**
 * AI 自主选择 MCP 工具性能测试
 * 评估系统运行效率和资源消耗
 */

import { intelligentMcpAgent } from '../server/agents/intelligent-mcp-agent'
import { contextAwareSelector } from '../server/services/context-aware-selector'
import { mcpDiscoveryService } from '../server/services/mcp-discovery-service'
import { mcpToolRegistry } from '../server/services/mcp-tool-registry'

/**
 * 性能测试结果
 */
interface PerformanceResult {
  testName: string
  iterations: number
  totalTime: number
  averageTime: number
  memoryUsage: NodeJS.MemoryUsage
  successRate: number
  errors: string[]
}

/**
 * 性能测试类
 */
class McpSelectionPerformanceTest {
  
  /**
   * 运行完整的性能测试套件
   */
  async runFullTestSuite(): Promise<void> {
    console.log('🚀 开始 AI 自主选择 MCP 工具性能测试\n')
    
    try {
      // 初始化服务
      await this.initializeServices()
      
      // 运行各项性能测试
      const results = await this.runAllTests()
      
      // 显示性能分析报告
      await this.displayPerformanceReport(results)
      
      // 清理资源
      await this.cleanup()
      
    } catch (error) {
      console.error('❌ 性能测试失败:', error)
    }
  }
  
  /**
   * 初始化服务
   */
  private async initializeServices(): Promise<void> {
    console.log('📡 初始化 MCP 服务...')
    
    const startTime = Date.now()
    
    await mcpDiscoveryService.start()
    await intelligentMcpAgent.initialize()
    
    const initTime = Date.now() - startTime
    
    const availableTools = mcpToolRegistry.getAvailableTools()
    console.log(`✅ 初始化完成 (${initTime}ms)`)
    console.log(`📊 发现 ${availableTools.length} 个 MCP 工具`)
    console.log('')
  }
  
  /**
   * 运行所有性能测试
   */
  private async runAllTests(): Promise<PerformanceResult[]> {
    const results: PerformanceResult[] = []
    
    // 1. 智能代理工具选择性能测试
    results.push(await this.testIntelligentAgentSelection())
    
    // 2. 上下文感知选择器性能测试
    results.push(await this.testContextAwareSelection())
    
    // 3. 工具推荐性能测试
    results.push(await this.testToolRecommendations())
    
    // 4. 并发性能测试
    results.push(await this.testConcurrentSelections())
    
    // 5. 内存使用测试
    results.push(await this.testMemoryUsage())
    
    return results
  }
  
  /**
   * 测试智能代理工具选择性能
   */
  private async testIntelligentAgentSelection(): Promise<PerformanceResult> {
    console.log('🧠 测试智能代理工具选择性能...')
    
    const testTasks = [
      { task: '读取配置文件 config.json', expectedTool: 'filesystem/read_file' },
      { task: '打开谷歌网站搜索', expectedTool: 'puppeteer/navigate' },
      { task: '保存用户设置到文件', expectedTool: 'filesystem/write_file' },
      { task: '执行 shell 命令', expectedTool: 'shell/execute' },
      { task: '读取内存中的数据', expectedTool: 'memory/read' }
    ]
    
    const iterations = 10
    const startTime = Date.now()
    const errors: string[] = []
    let successCount = 0
    
    for (let i = 0; i < iterations; i++) {
      for (const testTask of testTasks) {
        try {
          const selectionRequest = {
            userTask: testTask.task,
            context: { taskType: this.inferTaskType(testTask.task) }
          }
          
          const result = await intelligentMcpAgent.execute({
            variables: { selectionRequest },
            metadata: {
              startedAt: new Date().toISOString(),
              agentType: 'intelligent_mcp'
            }
          })
          
          if (result.ok) {
            successCount++
          } else {
            errors.push(`迭代 ${i+1} 任务 "${testTask.task}" 失败: ${result.error}`)
          }
          
          // 添加小延迟避免资源竞争
          await this.delay(50)
          
        } catch (error) {
          errors.push(`迭代 ${i+1} 任务 "${testTask.task}" 异常: ${error}`)
        }
      }
    }
    
    const totalTime = Date.now() - startTime
    const totalTasks = iterations * testTasks.length
    
    return {
      testName: '智能代理工具选择',
      iterations: totalTasks,
      totalTime,
      averageTime: totalTime / totalTasks,
      memoryUsage: process.memoryUsage(),
      successRate: successCount / totalTasks,
      errors
    }
  }
  
  /**
   * 测试上下文感知选择器性能
   */
  private async testContextAwareSelection(): Promise<PerformanceResult> {
    console.log('🎯 测试上下文感知选择器性能...')
    
    const testContexts = [
      {
        task: '读取 JSON 配置文件',
        context: { taskType: 'read', dataFormat: 'json', targetSystem: 'filesystem' }
      },
      {
        task: '浏览器导航操作',
        context: { taskType: 'navigate', targetSystem: 'browser' }
      },
      {
        task: '执行数据库查询',
        context: { taskType: 'read', dataFormat: 'database', targetSystem: 'database' }
      },
      {
        task: '分析日志文件',
        context: { taskType: 'analyze', dataFormat: 'text', constraints: { complexity: 'medium' } }
      }
    ]
    
    const iterations = 20
    const startTime = Date.now()
    const errors: string[] = []
    let successCount = 0
    
    for (let i = 0; i < iterations; i++) {
      for (const testContext of testContexts) {
        try {
          const result = await contextAwareSelector.selectTool({
            task: testContext.task,
            ...testContext.context
          })
          
          if (result.selectedTool) {
            successCount++
          }
          
          // 添加小延迟
          await this.delay(30)
          
        } catch (error) {
          errors.push(`迭代 ${i+1} 上下文 "${testContext.task}" 失败: ${error}`)
        }
      }
    }
    
    const totalTime = Date.now() - startTime
    const totalSelections = iterations * testContexts.length
    
    return {
      testName: '上下文感知选择器',
      iterations: totalSelections,
      totalTime,
      averageTime: totalTime / totalSelections,
      memoryUsage: process.memoryUsage(),
      successRate: successCount / totalSelections,
      errors
    }
  }
  
  /**
   * 测试工具推荐性能
   */
  private async testToolRecommendations(): Promise<PerformanceResult> {
    console.log('💡 测试工具推荐性能...')
    
    const testQueries = [
      '分析日志文件中的错误',
      '执行系统命令并获取结果',
      '浏览器自动化操作',
      '文件读写操作',
      '内存数据管理'
    ]
    
    const iterations = 15
    const startTime = Date.now()
    const errors: string[] = []
    let successCount = 0
    
    for (let i = 0; i < iterations; i++) {
      for (const query of testQueries) {
        try {
          const recommendations = await intelligentMcpAgent.getToolRecommendations(query)
          
          if (recommendations.length > 0) {
            successCount++
          }
          
          await this.delay(20)
          
        } catch (error) {
          errors.push(`迭代 ${i+1} 查询 "${query}" 失败: ${error}`)
        }
      }
    }
    
    const totalTime = Date.now() - startTime
    const totalQueries = iterations * testQueries.length
    
    return {
      testName: '工具推荐系统',
      iterations: totalQueries,
      totalTime,
      averageTime: totalTime / totalQueries,
      memoryUsage: process.memoryUsage(),
      successRate: successCount / totalQueries,
      errors
    }
  }
  
  /**
   * 测试并发选择性能
   */
  private async testConcurrentSelections(): Promise<PerformanceResult> {
    console.log('⚡ 测试并发选择性能...')
    
    const concurrentTasks = 5
    const iterations = 8
    const startTime = Date.now()
    const errors: string[] = []
    let successCount = 0
    
    for (let i = 0; i < iterations; i++) {
      const promises = []
      
      for (let j = 0; j < concurrentTasks; j++) {
        const task = `并发任务 ${i+1}-${j+1}: 读取配置文件${j}.json`
        
        promises.push(
          intelligentMcpAgent.execute({
            variables: {
              selectionRequest: {
                userTask: task,
                context: { taskType: 'read' }
              }
            },
            metadata: {
              startedAt: new Date().toISOString(),
              agentType: 'intelligent_mcp'
            }
          }).then(result => {
            if (result.ok) {
              successCount++
            } else {
              errors.push(`并发任务 ${i+1}-${j+1} 失败: ${result.error}`)
            }
          }).catch(error => {
            errors.push(`并发任务 ${i+1}-${j+1} 异常: ${error}`)
          })
        )
      }
      
      await Promise.all(promises)
      await this.delay(100) // 批次间延迟
    }
    
    const totalTime = Date.now() - startTime
    const totalTasks = iterations * concurrentTasks
    
    return {
      testName: '并发选择性能',
      iterations: totalTasks,
      totalTime,
      averageTime: totalTime / totalTasks,
      memoryUsage: process.memoryUsage(),
      successRate: successCount / totalTasks,
      errors
    }
  }
  
  /**
   * 测试内存使用情况
   */
  private async testMemoryUsage(): Promise<PerformanceResult> {
    console.log('💾 测试内存使用情况...')
    
    // 记录初始内存使用
    const initialMemory = process.memoryUsage()
    
    // 执行一系列操作来测试内存增长
    const operations = 50
    const startTime = Date.now()
    const errors: string[] = []
    
    for (let i = 0; i < operations; i++) {
      try {
        // 执行工具选择操作
        await contextAwareSelector.selectTool({
          task: `内存测试任务 ${i}`,
          taskType: 'read',
          dataFormat: 'text'
        })
        
        await this.delay(10)
        
      } catch (error) {
        errors.push(`内存测试操作 ${i} 失败: ${error}`)
      }
    }
    
    const totalTime = Date.now() - startTime
    const finalMemory = process.memoryUsage()
    
    // 计算内存增长
    const memoryGrowth = {
      rss: finalMemory.rss - initialMemory.rss,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      external: finalMemory.external - initialMemory.external
    }
    
    return {
      testName: '内存使用测试',
      iterations: operations,
      totalTime,
      averageTime: totalTime / operations,
      memoryUsage: memoryGrowth,
      successRate: 1 - (errors.length / operations),
      errors
    }
  }
  
  /**
   * 推断任务类型
   */
  private inferTaskType(task: string): string {
    const lowerTask = task.toLowerCase()
    
    if (lowerTask.includes('读取') || lowerTask.includes('read')) return 'read'
    if (lowerTask.includes('写入') || lowerTask.includes('write') || lowerTask.includes('保存')) return 'write'
    if (lowerTask.includes('执行') || lowerTask.includes('execute') || lowerTask.includes('运行')) return 'execute'
    if (lowerTask.includes('导航') || lowerTask.includes('navigate') || lowerTask.includes('打开')) return 'navigate'
    if (lowerTask.includes('分析') || lowerTask.includes('analyze')) return 'analyze'
    
    return 'general'
  }
  
  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  /**
   * 显示性能分析报告
   */
  private async displayPerformanceReport(results: PerformanceResult[]): Promise<void> {
    console.log('\n📊 性能测试结果汇总')
    console.log('='.repeat(80))
    
    let totalIterations = 0
    let totalTime = 0
    let totalSuccessRate = 0
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.testName}`)
      console.log(`   迭代次数: ${result.iterations}`)
      console.log(`   总耗时: ${result.totalTime}ms`)
      console.log(`   平均耗时: ${result.averageTime.toFixed(2)}ms/次`)
      console.log(`   成功率: ${(result.successRate * 100).toFixed(1)}%`)
      
      if ('rss' in result.memoryUsage) {
        console.log(`   内存使用: RSS=${this.formatBytes(result.memoryUsage.rss)}, Heap=${this.formatBytes(result.memoryUsage.heapUsed)}`)
      } else {
        console.log(`   内存增长: RSS=${this.formatBytes(result.memoryUsage.rss)}, Heap=${this.formatBytes(result.memoryUsage.heapUsed)}`)
      }
      
      if (result.errors.length > 0) {
        console.log(`   错误数量: ${result.errors.length}`)
        if (result.errors.length <= 3) {
          result.errors.forEach(err => console.log(`     - ${err}`))
        }
      }
      
      totalIterations += result.iterations
      totalTime += result.totalTime
      totalSuccessRate += result.successRate
    })
    
    // 总体统计
    console.log('\n📈 总体性能统计')
    console.log('-'.repeat(40))
    console.log(`总迭代次数: ${totalIterations}`)
    console.log(`总耗时: ${totalTime}ms`)
    console.log(`整体平均耗时: ${(totalTime / totalIterations).toFixed(2)}ms/次`)
    console.log(`平均成功率: ${((totalSuccessRate / results.length) * 100).toFixed(1)}%`)
    
    // 性能评级
    this.performanceRating(results)
  }
  
  /**
   * 性能评级
   */
  private performanceRating(results: PerformanceResult[]): void {
    console.log('\n🏆 性能评级')
    console.log('-'.repeat(40))
    
    const avgTime = results.reduce((sum, r) => sum + r.averageTime, 0) / results.length
    const avgSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length
    
    let rating = 'A'
    let comment = '优秀'
    
    if (avgTime > 500) {
      rating = 'C'
      comment = '需要优化'
    } else if (avgTime > 200) {
      rating = 'B' 
      comment = '良好'
    }
    
    if (avgSuccessRate < 0.8) {
      rating += '-'
      comment += ' (成功率有待提高)'
    }
    
    console.log(`性能等级: ${rating}`)
    console.log(`评语: ${comment}`)
    console.log(`平均响应时间: ${avgTime.toFixed(2)}ms`)
    console.log(`平均成功率: ${(avgSuccessRate * 100).toFixed(1)}%`)
  }
  
  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
  
  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 清理资源...')
    await mcpDiscoveryService.stop()
    console.log('✅ 性能测试完成')
  }
}

/**
 * 运行性能测试
 */
async function main() {
  const performanceTest = new McpSelectionPerformanceTest()
  await performanceTest.runFullTestSuite()
}

// 如果直接运行此文件，执行性能测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { McpSelectionPerformanceTest }