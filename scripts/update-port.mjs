/**
 * 更新数据库中的后端端口配置
 */

import Database from 'bun:sqlite'

const dbPath = 'F:/开发项目/crabclaw/server/data.db'
const db = new Database(dbPath)

// 读取当前配置
const row = db.query('SELECT value FROM config WHERE key = ?').get('app_config')
if (!row) {
  console.log('未找到 app_config 配置')
  process.exit(1)
}

const config = JSON.parse(row.value)
console.log('当前端口:', config.settings.backendPort)

// 更新端口
config.settings.backendPort = 17883
console.log('新端口:', config.settings.backendPort)

// 保存回数据库
db.query('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)').run(
  'app_config',
  JSON.stringify(config),
  Date.now()
)

console.log('✅ 端口已更新为 17883')
db.close()
