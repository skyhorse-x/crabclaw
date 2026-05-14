#!/usr/bin/env node
/**
 * CrabClaw 开发模式启动脚本（跨平台）
 * 由 neu run 通过 devCommand 调用
 * 职责：启动后端（随机端口）+ 前端 dev server
 * Neutralino 自己等 devUrl 可用后打开窗口
 */

import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT_FILE = path.join(ROOT, 'server', '.port')
const FRONTEND_DEV_PORT = 5173

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function waitFile(filePath, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) return true
    await sleep(300)
  }
  return false
}

function run(cmd, args, cwd, label) {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  proc.on('error', err => {
    console.error(`[${label}] Failed to start:`, err.message)
    process.exit(1)
  })
  return proc
}

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' })
      const pids = [...new Set(result.trim().split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))]
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' })
    }
  } catch {}
}

for (const f of [PORT_FILE]) {
  try { fs.unlinkSync(f) } catch {}
}

killPort(FRONTEND_DEV_PORT)

console.log('[dev] Starting backend (Bun)...')
const backendProc = run('bun', ['--env-file=server/.env', 'run', 'server/main.ts'], ROOT, 'backend')

if (!await waitFile(PORT_FILE, 10000)) {
  console.error('[dev] Backend failed to write .port within 10s')
  backendProc.kill()
  process.exit(1)
}

const backendPort = fs.readFileSync(PORT_FILE, 'utf-8').trim()
console.log(`[dev] Backend on port ${backendPort}`)

console.log(`[dev] Starting frontend on port ${FRONTEND_DEV_PORT}...`)
console.log(`[dev] Frontend will proxy /api and /ws to backend on port ${backendPort}`)

const frontendProc = run('npm', ['run', 'frontend:dev'], ROOT, 'frontend')

function shutdown() {
  for (const p of [frontendProc, backendProc]) {
    try { p.kill() } catch {}
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
