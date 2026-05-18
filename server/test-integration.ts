/**
 * 集成测试脚本
 * 发送10条测试任务到 AI 接口，观察后端行为和日志
 */

const BASE = 'http://localhost:17870'

async function request(method: string, path: string, body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, data: text }
  }
}

async function main() {
  console.log('========== 集成测试开始 ==========')
  console.log()

  // 1. 健康检查
  console.log('--- 1. 健康检查 ---')
  const health = await request('GET', '/api/health')
  console.log(`  Status: ${health.status}`, health.data)
  console.log()

  // 2. 获取 Agent 列表
  console.log('--- 2. 获取 Agent 列表 ---')
  const agents = await request('GET', '/api/agents')
  console.log(`  Status: ${agents.status}`, JSON.stringify(agents.data, null, 2).slice(0, 500))
  console.log()

  // 3. 获取模型列表
  console.log('--- 3. 获取模型列表 ---')
  const models = await request('GET', '/api/agent-models')
  console.log(`  Status: ${models.status}`, JSON.stringify(models.data, null, 2).slice(0, 500))
  console.log()

  // 4. 创建一个测试 Agent（如果列表为空）
  let agentId: string
  const agentList = agents.data?.data || agents.data || []
  const firstAgent = Array.isArray(agentList) ? agentList[0] : null

  if (firstAgent && firstAgent.id) {
    agentId = firstAgent.id
    console.log('--- 4. 使用已有 Agent ---')
    console.log(`  Agent: ${firstAgent.name} (${firstAgent.id})`)
  } else {
    console.log('--- 4. 创建测试 Agent ---')
    const created = await request('POST', '/api/agents', {
      name: '测试助手',
      role: 'assistant',
      prompt: '你是一个乐于助人的AI助手，请用中文回答用户的问题。',
      modelId: 'gpt-4o-mini',
      executionMode: 'auto'
    })
    console.log(`  Status: ${created.status}`, JSON.stringify(created.data, null, 2).slice(0, 300))
    agentId = created.data?.data?.id || created.data?.id
    if (!agentId) {
      console.error('  ❌ 无法获取 Agent ID，终止测试')
      process.exit(1)
    }
  }
  console.log()

  // 5. 发送10条测试任务
  console.log('--- 5. 发送10条测试任务 ---')
  const testTasks = [
    '用中文简单介绍一下你自己',
    '请用一句话介绍 Python 语言',
    '请解释什么是 REST API',
    '请列举3种常见的数据结构',
    '什么是 TypeScript 的泛型？请简单解释',
    '请写一个简单的 Hello World 函数',
    '请解释什么是 Git 版本控制',
    '请用简短的例子说明 async/await 的用法',
    '什么是 Docker？请简单解释',
    '请用一句话总结前端开发的三大核心技术'
  ]

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < testTasks.length; i++) {
    const task = testTasks[i]
    console.log(`  [${i + 1}/${testTasks.length}] 发送任务: "${task.slice(0, 30)}..."`)

    try {
      const startTime = Date.now()
      const result = await request('POST', `/api/agents/${agentId}/task`, { task })
      const elapsed = Date.now() - startTime

      if (result.status >= 200 && result.status < 300) {
        console.log(`    ✅ 成功 (${elapsed}ms)`)
        successCount++
      } else {
        console.log(`    ❌ 失败 (${elapsed}ms) - Status: ${result.status}`)
        console.log(`       ${JSON.stringify(result.data).slice(0, 200)}`)
        failCount++
      }
    } catch (err: any) {
      console.log(`    ❌ 异常: ${err.message}`)
      failCount++
    }
  }
  console.log()

  // 6. 总结
  console.log('--- 6. 测试总结 ---')
  console.log(`  总发送: ${testTasks.length}`)
  console.log(`  成功: ${successCount}`)
  console.log(`  失败: ${failCount}`)
  console.log()

  // 7. 获取系统状态
  console.log('--- 7. 系统状态 ---')
  const state = await request('GET', '/api/system/state')
  console.log(`  Status: ${state.status}`, JSON.stringify(state.data, null, 2).slice(0, 500))
  console.log()

  // 8. 检查聊天历史
  console.log('--- 8. 聊天历史 ---')
  const history = await request('GET', '/api/chat-history')
  console.log(`  Status: ${history.status}`, JSON.stringify(history.data, null, 2).slice(0, 500))
  console.log()

  // 9. 检查 Token 统计
  console.log('--- 9. Token 统计 ---')
  const tokens = await request('GET', '/api/token-stats')
  console.log(`  Status: ${tokens.status}`, JSON.stringify(tokens.data, null, 2).slice(0, 500))
  console.log()

  // 10. 配置信息
  console.log('--- 10. 配置信息 ---')
  const config = await request('GET', '/api/config')
  console.log(`  Status: ${config.status}`, JSON.stringify(config.data, null, 2).slice(0, 500))
  console.log()

  console.log('========== 集成测试完成 ==========')
}

main().catch(err => {
  console.error('测试脚本异常:', err)
  process.exit(1)
})