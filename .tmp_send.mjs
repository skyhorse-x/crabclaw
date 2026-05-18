import fs from 'node:fs'
import path from 'node:path'
const _port = (() => { try { return fs.readFileSync(path.resolve(import.meta.dirname, 'server/.port'), 'utf-8').trim() } catch { return '17870' } })()
const BASE = `http://localhost:${_port}`

async function callApi(apiPath, body) {
  const res = await fetch(BASE + apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function main() {
  console.log('调用 /api/plugins/wechat-bot/send...')
  const result = await callApi('/api/plugins/wechat-bot/send', { content: '你好，这是一条测试消息' })
  console.log('send 结果:', JSON.stringify(result, null, 2))
}

main().catch(e => console.error('Error:', e.message))