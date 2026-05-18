import { createDecipheriv, scryptSync } from 'crypto'

const password = 'default-encryption-key-change-in-production'
const salt = Buffer.from('d7b8c9a6e5f4g3h2i1j0k9l8m7n6o5p4', 'hex')
const key = scryptSync(password, salt, 32)

const encryptedToken = '20084f8a7eacad4787ccbc7b197ce1a3:7eda484b3617c01444af323ca48987db2fdedd9d376a83b2d588d45e08caff9b62c0756c34332d489839425c1984c9a54ed344d32df76ed297316c997ed03cca'
const parts = encryptedToken.split(':')
const iv = Buffer.from(parts[0], 'hex')
const encrypted = parts[1]

const decipher = createDecipheriv('aes-256-cbc', key, iv)
let decrypted = decipher.update(encrypted, 'hex', 'utf8')
decrypted += decipher.final('utf8')

const REAL_TOKEN = decrypted
const BASE_URL = 'https://ilinkai.weixin.qq.com'
const ILINK_APP_ID = 'bot'
const ILINK_APP_CLIENT_VERSION = '132099'

function b64RandomUin() {
  return Buffer.from(String(Math.floor(Math.random() * 4294967295))).toString('base64')
}

function iLinkHeaders(token) {
  const h = {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION,
  }
  if (token) {
    h['Authorization'] = 'Bearer ' + token
    h['AuthorizationType'] = 'ilink_bot_token'
    h['X-WECHAT-UIN'] = b64RandomUin()
    h['Content-Type'] = 'application/json'
  }
  return h
}

async function apiPost(endpoint, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(function () { controller.abort() }, timeoutMs || 15000)
  try {
    const r = await fetch(BASE_URL + '/' + endpoint, {
      method: 'POST',
      headers: iLinkHeaders(REAL_TOKEN),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return await r.json()
  } finally { clearTimeout(timer) }
}

async function main() {
  const TO_USER = 'o9cq802S84WTFlyF0ia015U7si1Q@im.wechat'
  const ILINK_USER = 'o9cq802S84WTFlyF0ia015U7si1Q@im.wechat'
  const BASE_INFO = { base_info: { channel_version: '1.0.2', bot_agent: 'crabclaw-wechat/1.0.0' } }

  console.log('Step 1: sendtyping (empty ticket)...')
  const r1 = await apiPost('ilink/bot/sendtyping', {
    to_user_id: TO_USER,
    typing_ticket: '',
    ilink_user_id: ILINK_USER,
    ...BASE_INFO,
  }, 5000)
  console.log('  result:', JSON.stringify(r1))

  console.log('Step 2: getconfig...')
  const r2 = await apiPost('ilink/bot/getconfig', { ilink_user_id: ILINK_USER, ...BASE_INFO }, 15000)
  console.log('  result:', JSON.stringify(r2))

  if (r2 && r2.typing_ticket) {
    console.log('Step 3: sendtyping (with ticket)...')
    const r3 = await apiPost('ilink/bot/sendtyping', {
      to_user_id: TO_USER,
      typing_ticket: r2.typing_ticket,
      ilink_user_id: ILINK_USER,
      ...BASE_INFO,
    }, 5000)
    console.log('  result:', JSON.stringify(r3))
    if (r3.ret === 0) {
      console.log('[OK] typing sent!')
    } else {
      console.log('[FAIL] ret=' + r3.ret)
    }
  } else {
    console.log('[FAIL] no typing_ticket')
  }
}

main().catch(function (e) { console.error('Error:', e.message) })