/**
 * 测试多 Agent 系统是否正常工作
 * 
 * 运行方式: bun run scripts/test-multi-agent.mjs
 */

import { createAgentRuntime } from '../server/agent-runtime/runtime.ts'
import { needTool, getRelevantToolTypes } from '../server/services/intent-analyzer.service.ts'

// 测试用例
const testCases = [
  // 简单对话 - 不应触发多Agent
  { message: '你好', expectMulti: false, desc: '简单问候' },
  { message: '谢谢', expectMulti: false, desc: '表达感谢' },
  { message: '什么是Vue', expectMulti: false, desc: '知识问答' },
  
  // 需要工具但简单 - 不应触发多Agent
  { message: '读取README文件', expectMulti: false, desc: '单文件操作' },
  { message: '打开百度', expectMulti: false, desc: '单页面浏览' },
  
  // 复杂任务 - 应触发多Agent
  { message: '修改前端页面样式并优化后端API接口', expectMulti: true, desc: '前后端联动' },
  { message: '添加用户管理功能，包括前端组件、后端API和数据库', expectMulti: true, desc: '全栈功能开发' },
  { message: '修复登录页面的XSS漏洞并添加安全测试', expectMulti: true, desc: '安全+测试联动' },
  { message: '重构前端组件并编写单元测试', expectMulti: true, desc: '前端+测试联动' },
  { message: '优化前端性能，修改后端数据库查询，并添加集成测试', expectMulti: true, desc: '多模块优化' },
]

// 初始化运行时
const runtime = createAgentRuntime()

console.log('=== 多 Agent 系统测试 ===\n')

// 测试1: needTool 函数
console.log('【测试1】意图分析 - needTool')
console.log('-'.repeat(50))
const toolTests = [
  { msg: '你好', expect: false },
  { msg: '读取文件', expect: true },
  { msg: '打开网页', expect: true },
  { msg: '执行命令', expect: true },
  { msg: '什么是React', expect: false },
]
for (const t of toolTests) {
  const result = needTool(t.msg)
  const pass = result === t.expect ? '✅' : '❌'
  console.log(`  ${pass} "${t.msg}" → needTool=${result} (期望: ${t.expect})`)
}

// 测试2: shouldUseMultiAgent
console.log('\n【测试2】多Agent决策 - shouldUseMultiAgent')
console.log('-'.repeat(50))
let passCount = 0
let failCount = 0

for (const tc of testCases) {
  const result = runtime.shouldUseMultiAgent(tc.message)
  const pass = result === tc.expectMulti
  if (pass) passCount++
  else failCount++
  
  const icon = pass ? '✅' : '❌'
  console.log(`  ${icon} [${tc.desc}] "${tc.message}"`)
  console.log(`      multiAgent=${result} (期望: ${tc.expectMulti})`)
}

// 测试3: 运行时统计
console.log('\n【测试3】运行时统计')
console.log('-'.repeat(50))
const stats = runtime.getStats()
console.log(`  注册Agent类型: ${stats.registeredTypes.join(', ')}`)
console.log(`  活跃Agent数: ${stats.activeAgents}`)

// 测试4: 复杂度分析详情
console.log('\n【测试4】复杂度分析详情')
console.log('-'.repeat(50))
const complexCases = [
  '修改前端页面样式并优化后端API接口',
  '添加用户管理功能，包括前端组件、后端API和数据库',
  '读取README文件',
]
for (const msg of complexCases) {
  const shouldMulti = runtime.shouldUseMultiAgent(msg)
  console.log(`  "${msg}"`)
  console.log(`    决策: ${shouldMulti ? '多Agent模式' : '单Agent模式'}`)
}

// 汇总
console.log('\n' + '='.repeat(50))
console.log(`测试结果: ${passCount} 通过, ${failCount} 失败`)
if (failCount === 0) {
  console.log('🎉 所有测试通过！多Agent决策系统工作正常')
} else {
  console.log(`⚠️ 有 ${failCount} 个测试未通过，请检查逻辑`)
}
console.log('='.repeat(50))
