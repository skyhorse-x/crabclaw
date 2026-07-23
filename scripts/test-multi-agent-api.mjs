/**
 * 测试 AI API 是否正确集成多Agent运行
 * 
 * 通过 WebSocket 连接到本地服务器，验证多Agent是否被正确触发
 * 运行方式: bun run scripts/test-multi-agent-api.mjs
 */

const WS_URL = 'ws://localhost:17883/ws'

// 测试用例
const testCases = [
  {
    label: '前后端联动任务',
    message: '修改前端ChatView.vue的样式，并优化后端chat.handler.ts的性能',
    expectMultiAgent: true
  },
  {
    label: '全栈功能开发',
    message: '添加一个新的用户管理功能，包括前端页面、后端API和数据库表',
    expectMultiAgent: true
  },
  {
    label: '简单问候',
    message: '你好，今天天气怎么样？',
    expectMultiAgent: false
  },
  {
    label: '单文件操作',
    message: '读取README.md文件内容',
    expectMultiAgent: false
  }
]

// 通过WebSocket发送聊天消息并收集响应
async function testViaWebSocket(message, label) {
  return new Promise((resolve) => {
    console.log(`\n  📝 测试: ${label}`)
    console.log(`     消息: "${message}"`)
    
    let ws
    try {
      ws = new WebSocket(WS_URL)
    } catch (err) {
      console.log(`     ❌ WebSocket创建失败: ${err.message}`)
      resolve({ success: false, multiAgent: false })
      return
    }
    
    let multiAgentDetected = false
    const eventTypes = []
    let streamEnded = false
    const timeout = setTimeout(() => {
      if (!streamEnded) {
        console.log(`     ⏱️ 超时 (15s)`)
        ws.close()
        resolve({ success: true, multiAgent: multiAgentDetected, eventTypes })
      }
    }, 15000)
    
    ws.onopen = () => {
      // 发送聊天消息
      ws.send(JSON.stringify({
        type: 'chat_message',
        payload: {
          message,
          taskId: 'test-' + Date.now()
        }
      }))
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'chat_chunk') {
          const chunk = data.payload
          // 检测多Agent事件
          if (chunk.type === 'multi_agent' && chunk.multiAgent) {
            multiAgentDetected = true
            eventTypes.push(chunk.multiAgent.type)
          }
        } else if (data.type === 'stream_end') {
          streamEnded = true
          clearTimeout(timeout)
          ws.close()
          
          if (multiAgentDetected) {
            console.log(`     ✅ 检测到多Agent事件!`)
            console.log(`     事件类型: ${[...new Set(eventTypes)].join(', ')}`)
          } else {
            console.log(`     ℹ️ 单Agent模式（正常回复）`)
          }
          
          resolve({ success: true, multiAgent: multiAgentDetected, eventTypes })
        } else if (data.type === 'error') {
          console.log(`     ❌ 服务器错误: ${data.payload?.message || 'Unknown'}`)
          streamEnded = true
          clearTimeout(timeout)
          ws.close()
          resolve({ success: false, multiAgent: false })
        }
      } catch (err) {
        // 忽略解析错误
      }
    }
    
    ws.onerror = (err) => {
      console.log(`     ❌ WebSocket错误`)
      clearTimeout(timeout)
      resolve({ success: false, multiAgent: false })
    }
  })
}

// 主测试流程
console.log('=== AI API 多Agent集成测试 ===')
console.log(`  连接: ${WS_URL}`)
console.log(`  WebSocket support: ${typeof WebSocket !== 'undefined' ? 'Yes' : 'No'}`)

// 测试WebSocket连接
console.log('\n【1】WebSocket连接测试')
let wsOk = false
await new Promise((resolve) => {
  console.log('  正在创建WebSocket连接...')
  let testWs
  try {
    testWs = new WebSocket(WS_URL)
  } catch (err) {
    console.log(`  ❌ WebSocket创建失败: ${err.message}`)
    resolve()
    return
  }
  
  const timeout = setTimeout(() => {
    console.log('  ⏱️ 连接超时 (5s)')
    testWs.close()
    resolve()
  }, 5000)
  
  testWs.onopen = () => {
    console.log('  ✅ WebSocket连接成功')
    wsOk = true
    clearTimeout(timeout)
    testWs.close()
    resolve()
  }
  
  testWs.onerror = (err) => {
    console.log(`  ❌ WebSocket错误: ${err.message || 'Unknown'}`)
    clearTimeout(timeout)
    resolve()
  }
  
  testWs.onclose = (event) => {
    console.log(`  🔌 WebSocket关闭: code=${event.code}, reason=${event.reason || 'N/A'}`)
  }
})

if (!wsOk) {
  process.exit(1)
}

// 运行测试用例
console.log('\n【2】多Agent触发测试')
let passCount = 0
let failCount = 0

for (const tc of testCases) {
  const result = await testViaWebSocket(tc.message, tc.label)
  
  if (result.success) {
    if (result.multiAgent === tc.expectMultiAgent) {
      console.log(`     ✅ 决策正确`)
      passCount++
    } else {
      console.log(`     ❌ 决策错误! 期望: ${tc.expectMultiAgent ? '多Agent' : '单Agent'}, 实际: ${result.multiAgent ? '多Agent' : '单Agent'}`)
      failCount++
    }
  } else {
    failCount++
  }
  
  // 间隔防止并发
  await new Promise(r => setTimeout(r, 500))
}

// 汇总
console.log('\n' + '='.repeat(50))
console.log(`测试结果: ${passCount} 通过, ${failCount} 失败`)
if (failCount === 0) {
  console.log('🎉 所有测试通过！多Agent系统API集成正常')
} else {
  console.log(`⚠️ 有 ${failCount} 个测试未通过`)
}
console.log('='.repeat(50))
