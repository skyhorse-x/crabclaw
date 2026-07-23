/**
 * WebSocket 性能测试脚本
 *
 * 用途：连接本地 CrabClaw WebSocket 服务，发送 "你好" 消息，
 *      测量从连接到完整接收响应各阶段耗时，用于诊断前端展示延迟。
 *
 * 运行：bun scripts/ws-perf-test.mjs
 */

import WebSocket from 'ws'

const HOST = process.env.WS_HOST || 'localhost'
const PORT = Number(process.env.WS_PORT || 17870)
const URL = `ws://${HOST}:${PORT}/ws`
const TEST_MESSAGE = process.env.TEST_MESSAGE || '你好'
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000)

const t0 = Date.now()
const checkpoints = {}

function ms(label) {
  const elapsed = Date.now() - t0
  checkpoints[label] = elapsed
  return elapsed
}

function fmt(elapsed) {
  return `${String(elapsed).padStart(5)}ms`
}

const replyTextParts = []
let chunkCount = 0
let firstReplyChunkAt = null
let lastEventAt = null
let taskStartAt = null
let taskId = null

const ws = new WebSocket(URL)

const overallTimeout = setTimeout(() => {
  console.error(`[FAIL] Total timeout ${TIMEOUT_MS}ms exceeded`)
  console.error('Checkpoints so far:', checkpoints)
  process.exit(1)
}, TIMEOUT_MS)

ws.on('open', () => {
  ms('ws_open')
  console.log(`[${fmt(checkpoints.ws_open)}] WebSocket connected to ${URL}`)

  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: { message: TEST_MESSAGE }
  }))
  ms('chat_message_sent')
  console.log(`[${fmt(checkpoints.chat_message_sent)}] Sent chat_message: "${TEST_MESSAGE}"`)
})

ws.on('message', (data) => {
  const receivedAt = ms('message_received')
  lastEventAt = receivedAt
  let msg
  try {
    msg = JSON.parse(data.toString())
  } catch (e) {
    console.log(`[${fmt(receivedAt)}] [RAW]`, data.toString().slice(0, 200))
    return
  }

  if (msg.type === 'connected') {
    console.log(`[${fmt(receivedAt)}] [connected] clientId=${msg.payload?.clientId}`)
    return
  }

  if (msg.type === 'stream_start') {
    taskId = msg.payload?.taskId
    console.log(`[${fmt(receivedAt)}] [stream_start] taskId=${taskId}`)
    return
  }

  if (msg.type === 'stream_end') {
    console.log(`[${fmt(receivedAt)}] [stream_end] taskId=${msg.payload?.taskId}`)
    finish()
    return
  }

  if (msg.type === 'error') {
    console.log(`[${fmt(receivedAt)}] [error]`, JSON.stringify(msg.payload))
    return
  }

  if (msg.type === 'chat_chunk') {
    const chunk = msg.payload || {}
    chunkCount += 1

    if (chunk.type === 'task') {
      const t = chunk.task || {}
      if (t.status === 'running' && !taskStartAt) {
        taskStartAt = receivedAt
        console.log(`[${fmt(receivedAt)}] [task running] title=${t.title || ''} stepId=${t.stepId || ''}`)
      } else {
        console.log(`[${fmt(receivedAt)}] [task ${t.status}] title=${t.title || ''} stepId=${t.stepId || ''}`)
      }
      return
    }

    if (chunk.type === 'plan') {
      const steps = Array.isArray(chunk.plan) ? chunk.plan.length : 0
      console.log(`[${fmt(receivedAt)}] [plan] steps=${steps}`)
      return
    }

    if (chunk.type === 'detail') {
      console.log(`[${fmt(receivedAt)}] [detail] stage=${chunk.detail?.stage} text="${(chunk.detail?.text || '').slice(0, 60)}"`)
      return
    }

    if (chunk.type === 'reply') {
      if (firstReplyChunkAt === null) firstReplyChunkAt = receivedAt
      const text = String(chunk.reply || '')
      replyTextParts.push(text)
      if (!chunk.delta || chunkCount % 5 === 0) {
        console.log(`[${fmt(receivedAt)}] [reply] delta=${chunk.delta} len=${text.length} preview="${text.slice(0, 40)}"`)
      }
      return
    }

    if (chunk.type === 'done') {
      console.log(`[${fmt(receivedAt)}] [done] usage=${JSON.stringify(chunk.usage || {})}`)
      return
    }

    if (chunk.type === 'mcp') {
      console.log(`[${fmt(receivedAt)}] [mcp] ${chunk.mcp?.server}/${chunk.mcp?.tool} status=${chunk.mcp?.status}`)
      return
    }

    console.log(`[${fmt(receivedAt)}] [chunk:${chunk.type}]`, JSON.stringify(chunk).slice(0, 200))
    return
  }

  console.log(`[${fmt(receivedAt)}] [${msg.type}]`, JSON.stringify(msg).slice(0, 200))
})

ws.on('error', (err) => {
  console.error(`[ERROR] WebSocket error:`, err.message)
  process.exit(1)
})

ws.on('close', (code, reason) => {
  console.log(`[CLOSE] code=${code} reason=${reason?.toString() || ''}`)
  if (!checkpoints.completed) {
    console.error('Connection closed before stream_end received')
    process.exit(1)
  }
})

function finish() {
  checkpoints.completed = true
  const fullReply = replyTextParts.join('')

  console.log('\n========== 性能报告 ==========')
  console.log(`连接建立：              ${fmt(checkpoints.ws_open)} (T+0)`)
  console.log(`发送 chat_message：      ${fmt(checkpoints.chat_message_sent)} (T+${checkpoints.chat_message_sent})`)
  console.log(`收到 stream_start：     ${fmt(checkpoints.stream_start || lastEventAt)} (T+${(checkpoints.stream_start || lastEventAt) - checkpoints.chat_message_sent})`)
  if (firstReplyChunkAt !== null) {
    console.log(`首个 reply chunk：      ${fmt(firstReplyChunkAt)} (T+${firstReplyChunkAt - checkpoints.chat_message_sent})`)
  } else {
    console.log(`首个 reply chunk：      未收到`)
  }
  if (lastEventAt !== null && firstReplyChunkAt !== null) {
    console.log(`reply 流持续时间：       ${lastEventAt - firstReplyChunkAt}ms`)
  }
  console.log(`收到 stream_end：       ${fmt(lastEventAt)} (T+${lastEventAt - checkpoints.chat_message_sent})`)
  console.log(`总耗时（连接到结束）：   ${lastEventAt - checkpoints.ws_open}ms`)
  console.log(`reply chunk 数：         ${chunkCount}`)
  console.log(`累计回复文本长度：       ${fullReply.length} 字符`)
  console.log(`回复预览：               ${fullReply.slice(0, 100)}`)
  console.log('==============================\n')

  console.log('【慢响应根因分析】')
  const sendToStart = (checkpoints.stream_start || lastEventAt) - checkpoints.chat_message_sent
  const sendToFirstReply = firstReplyChunkAt !== null ? firstReplyChunkAt - checkpoints.chat_message_sent : -1
  const streamDuration = (firstReplyChunkAt !== null && lastEventAt !== null) ? lastEventAt - firstReplyChunkAt : 0
  const endLatency = lastEventAt !== null ? lastEventAt - checkpoints.chat_message_sent : -1

  if (sendToStart > 200) {
    console.log(`  ⚠️  stream_start 延迟 ${sendToStart}ms → 后端在 send 后未及时进入处理 (检查 chat.handler.ts handleChatStream 入口)`)
  }
  if (sendToFirstReply > 0 && sendToFirstReply - sendToStart > 1000) {
    console.log(`  ⚠️  首个 reply 在 stream_start 之后 ${sendToFirstReply - sendToStart}ms 才到达 → LLM 推理耗时 (这是无法压缩的网络/模型耗时)`)
  }
  if (streamDuration > 0 && chunkCount > 0) {
    const avgChunkInterval = streamDuration / Math.max(chunkCount - 1, 1)
    console.log(`  ℹ️  reply 平均分块间隔：${avgChunkInterval.toFixed(1)}ms (chunk=${chunkCount}, 时长=${streamDuration}ms)`)
  }
  if (endLatency > 0) {
    console.log(`  总端到端延迟：${endLatency}ms`)
    if (endLatency < 2000) console.log(`    → 后端响应正常，前端感觉慢需查前端 (ChatView.vue / useWebSocket.ts 渲染/handler 注册)`)
    else if (endLatency < 5000) console.log(`    → 略慢，可接受范围`)
    else console.log(`    → 明显慢，需查 LLM 推理/工具调用耗时`)
  }
  console.log('')

  clearTimeout(overallTimeout)
  ws.close()
  setTimeout(() => process.exit(0), 100)
}

process.on('SIGINT', () => {
  console.log('\n[INTERRUPTED] Closing...')
  clearTimeout(overallTimeout)
  ws.close()
  process.exit(0)
})
