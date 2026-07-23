import WebSocket from 'ws'

const ws = new WebSocket('ws://localhost:17881/ws')

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功')
  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: { message: '你好' }
  }))
  console.log('📤 发送消息: 你好')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  console.log(`📨 收到 [${msg.type}]:`, JSON.stringify(msg).slice(0, 200))
  
  if (msg.type === 'chat_chunk' && msg.payload?.type === 'done') {
    ws.close()
    process.exit(0)
  }
})

ws.on('error', (err) => {
  console.error('❌ 错误:', err.message)
  process.exit(1)
})

ws.on('close', () => {
  console.log('🔌 连接关闭')
})

setTimeout(() => {
  console.error('⏰ 超时')
  process.exit(1)
}, 15000)
