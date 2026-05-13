import { WebSocket } from 'ws'

const ws = new WebSocket('ws://localhost:17870/ws')

const START = Date.now()
const elapsed = () => `+${((Date.now() - START) / 1000).toFixed(1)}s`

ws.on('open', () => {
  console.log(`[${elapsed()}] WS connected, sending chat...`)
  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: {
      message: '浏览器打开百度搜索，小红书，在小红书中搜索抖音',
      executionMode: 'auto',
      conversationHistory: []
    }
  }))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  const { type, payload } = msg

  if (type === 'chat_chunk') {
    const ct = payload?.type
    if (ct === 'reply') {
      process.stdout.write(payload.reply || '')
    } else if (ct === 'mcp') {
      const { server, tool, status } = payload.mcp || {}
      console.log(`\n[${elapsed()}] MCP ${status?.toUpperCase()} ${server}/${tool}`)
    } else if (ct === 'detail') {
      console.log(`[${elapsed()}] detail: ${payload.detail?.text || ''}`)
    } else if (ct === 'step') {
      const s = payload.step || {}
      console.log(`[${elapsed()}] step [${s.status}]: ${s.text}`)
    } else if (ct === 'plan') {
      const steps = (payload.plan || []).map(s => s.title).join(' → ')
      console.log(`[${elapsed()}] plan: ${steps}`)
    } else if (ct === 'done') {
      console.log(`\n[${elapsed()}] DONE (tokens: ${payload.usage?.totalTokens ?? '?'})`)
    } else if (ct === 'error') {
      console.error(`[${elapsed()}] ERROR: ${payload.error}`)
    }
  } else if (type === 'stream_start') {
    console.log(`[${elapsed()}] stream_start`)
  } else if (type === 'stream_end') {
    console.log(`\n[${elapsed()}] stream_end — closing`)
    ws.close()
  } else if (type === 'error') {
    console.error(`[${elapsed()}] WS error: ${payload?.message}`)
    ws.close()
  }
})

ws.on('error', (err) => console.error('WS error:', err.message))
ws.on('close', () => console.log(`[${elapsed()}] connection closed`))

// 超时保护
setTimeout(() => { console.log('\n[TIMEOUT] 2min exceeded'); ws.close() }, 120000)
