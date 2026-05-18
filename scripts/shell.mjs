#!/usr/bin/env node
/**
 * 一键启动脚本
 * 在后台启动 Bun 后端，然后运行 Neutralino 窗口
 * 用户无需手动启动 bun，无多余终端窗口
 */

import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT_FILE = path.join(ROOT, 'server', '.port')
const BACKEND_PORT = 17870

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

// ── 清理旧进程 ──────────────────────────────────────────────────────────────
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      const pids = [...new Set(
        result.trim().split('\n')
          .map(l => l.trim().split(/\s+/).pop())
          .filter(p => p && /^\d+$/.test(p) && p !== '0')
      )]
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch {}
      }
    } else {
      try { execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' }) } catch {}
    }
  } catch {}
}

// 清理旧 .port 文件
try { fs.unlinkSync(PORT_FILE) } catch {}

console.log('[shell] 清理旧进程...')
killPort(BACKEND_PORT)

// ── 后台启动 Bun 后端（无窗口，detached） ───────────────────────────────────
console.log('[shell] 启动 Bun 后端（后台）...')

const backendProc = spawn('bun', ['--env-file=server/.env', '--watch', 'server/main.ts'], {
  cwd: ROOT,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  shell: process.platform === 'win32',
})

backendProc.unref()

if (!await waitFile(PORT_FILE, 15000)) {
  console.error('[shell] 后端启动超时（15s），继续启动 Neutralino...')
} else {
  const port = fs.readFileSync(PORT_FILE, 'utf-8').trim()
  console.log(`[shell] 后端已就绪, port=${port}`)
}

// ── 启动 Neutralino 窗口 ─────────────────────────────────────────────────────
console.log('[shell] 启动 Neutralino 窗口...')

const neuProc = spawn('npx', ['@neutralinojs/neu', 'run'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    BUN_ALREADY_RUNNING: 'true',
  },
})

neuProc.on('exit', (code) => {
  console.log(`[shell] Neutralino 已退出 (code=${code})`)
  // 不杀掉 backend，用户关闭窗口后自动清理
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  neuProc.kill()
})
