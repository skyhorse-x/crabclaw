import WebSocket from 'ws'

const WS_URL = 'ws://localhost:17870/ws'

const TESTS = [
  { id: 1,  text: '在桌面创建一个名为 agent_test.txt 的文件，写入"Hello from Agent"' },
  { id: 2,  text: '列出下载文件夹里最近 5 个文件的名称和大小' },
  { id: 3,  text: '查找 Documents 目录下所有超过 10MB 的文件，列出文件名和大小' },
  { id: 4,  text: '告诉我当前电脑的 CPU 占用率、内存使用情况和磁盘剩余空间' },
  { id: 5,  text: '查看当前正在运行的所有进程，找出占用内存最多的前 5 个，显示进程名和占用百分比' },
  { id: 6,  text: '获取当前网络连接状态和本机 IP 地址' },
  { id: 7,  text: '截一张当前屏幕的截图，保存到桌面，文件名为 agent_screenshot.png' },
  { id: 8,  text: '打开计算器应用' },
  { id: 9,  text: '在终端执行 ping baidu.com，返回前 4 次的延迟结果' },
  { id: 10, text: '用 Python 写一个脚本统计桌面文件数量并打印结果，然后运行它' },
  { id: 11, text: '查看当前项目的 git log，显示最近 5 条提交记录' },
  { id: 12, text: '检查本机安装了哪些版本的 Node.js、Python、Git' },
  { id: 13, text: '读取桌面的 agent_test.txt 文件内容，然后把内容翻译成英文，写入桌面的 agent_test_en.txt' },
  { id: 14, text: '检查端口 3000、8080、17870 是否被占用，是哪个程序在用' },
  { id: 15, text: '查看系统最近 10 分钟内的错误日志' },
  { id: 16, text: '列出当前 Wi-Fi 连接信息，包括网络名称和信号强度' },
  { id: 17, text: '查找桌面上所有 .png 文件并列出它们的名称和大小' },
  { id: 18, text: '获取当前系统时间、时区和运行时长（uptime）' },
  { id: 19, text: '列出 /tmp 目录下的所有文件' },
  { id: 20, text: '打开 Safari 浏览器访问 https://baidu.com' },
]

async function runTest(test) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL)
    let reply = ''
    let done = false
    const timeout = setTimeout(() => {
      if (!done) {
        done = true
        ws.close()
        resolve({ id: test.id, status: '⏰ 超时', reply: reply.slice(0, 100) })
      }
    }, 30000)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'chat_message',
        payload: {
          message: test.text,
          executionMode: 'auto',
          taskId: `test-${test.id}-${Date.now()}`
        }
      }))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'chat_chunk') {
          const chunk = msg.payload
          if (chunk?.text) reply += chunk.text
          if (chunk?.type === 'text') reply += chunk.content || ''
        }
        if (msg.type === 'stream_end' || msg.type === 'chat_done') {
          if (!done) {
            done = true
            clearTimeout(timeout)
            ws.close()
            resolve({ id: test.id, status: '✅ 完成', reply: reply.slice(0, 200) })
          }
        }
        if (msg.type === 'error') {
          if (!done) {
            done = true
            clearTimeout(timeout)
            ws.close()
            resolve({ id: test.id, status: '❌ 错误', reply: msg.payload?.message || '' })
          }
        }
      } catch {}
    })

    ws.on('error', (err) => {
      if (!done) {
        done = true
        clearTimeout(timeout)
        resolve({ id: test.id, status: '❌ WS错误', reply: err.message })
      }
    })
  })
}

console.log('开始测试，共 20 条，每条最多等待 30 秒...\n')

for (const test of TESTS) {
  process.stdout.write(`[${test.id}/20] 测试: ${test.text.slice(0, 40)}... `)
  const result = await runTest(test)
  console.log(`${result.status}`)
  if (result.reply) {
    console.log(`       回复: ${result.reply.replace(/\n/g, ' ').slice(0, 150)}`)
  }
  console.log()
  // 每条之间稍微间隔，避免并发
  await new Promise(r => setTimeout(r, 1000))
}

console.log('全部测试完成')
