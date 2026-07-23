/**
 * 意图分析器测试脚本
 * 测试：普通问题不调用 MCP，工具问题调用 MCP
 */

import WebSocket from 'ws'

const PORT = 17883
const URL = `ws://localhost:${PORT}/ws`

const testCases = [
  { message: '你好', expectTool: false, desc: '问候' },
  { message: 'PHP是什么', expectTool: false, desc: '知识问答' },
  { message: '帮我打开网页', expectTool: true, desc: '工具调用' },
  { message: '读取文件', expectTool: true, desc: '文件系统' },
]

async function testCase(tc, url) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const ws = new WebSocket(url)
    let toolLoaded = false
    let streamEnded = false
    let detailTexts = []
    let replyText = ''

    const timeout = setTimeout(() => {
      if (!streamEnded) {
        console.log(`  ⚠️  超时 (${Date.now() - t0}ms)`)
        ws.close()
        resolve({ ...tc, toolLoaded, success: false, reason: 'timeout', details: detailTexts, replyText })
      }
    }, 30000)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'chat_message',
        payload: { message: tc.message }
      }))
    })

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'chat_chunk') {
        const chunk = msg.payload
        if (chunk.type === 'detail') {
          const text = chunk.detail?.text || ''
          detailTexts.push(text)
          if (text.includes('已加载') && text.includes('MCP 服务器')) {
            toolLoaded = true
          }
        }
        if (chunk.type === 'reply') {
          replyText += chunk.reply || ''
        }
        if (chunk.type === 'done') {
          streamEnded = true
          clearTimeout(timeout)
          ws.close()
          resolve({ ...tc, toolLoaded, success: true, elapsed: Date.now() - t0, details: detailTexts, replyText })
        }
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      console.log(`  ❌ 错误: ${err.message}`)
      resolve({ ...tc, toolLoaded, success: false, reason: err.message, details: detailTexts, replyText })
    })
  })
}

async function main() {
  console.log('=== 意图分析器测试 ===\n')
  console.log(`服务器: ${URL}\n`)

  let passed = 0
  let failed = 0

  for (const tc of testCases) {
    console.log(`测试: "${tc.message}" (${tc.desc})`)
    console.log(`  预期: ${tc.expectTool ? '✅ 加载 MCP' : '❌ 不加载 MCP'}`)

    const result = await testCase(tc, URL)

    const toolMatch = result.toolLoaded === tc.expectTool
    console.log(`  实际: ${result.toolLoaded ? '✅ 加载了 MCP' : '❌ 未加载 MCP'}`)
    
    // 显示详细信息
    for (const d of result.details) {
      if (d.includes('MCP') || d.includes('工具') || d.includes('跳过')) {
        console.log(`  📋 ${d}`)
      }
    }
    
    if (result.replyText) {
      console.log(`  💬 回复: ${result.replyText.slice(0, 60)}...`)
    }
    
    console.log(`  结果: ${toolMatch ? '✅ 通过' : '❌ 失败'} (${result.elapsed || '?'}ms)\n`)

    if (toolMatch) passed++
    else failed++
  }

  console.log('=== 测试结果 ===')
  console.log(`通过: ${passed}/${testCases.length}`)
  console.log(`失败: ${failed}/${testCases.length}`)
  console.log('================\n')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)
