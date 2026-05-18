#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PORTS = { BACKEND: 17870, FRONTEND: 5173 }
let actualFrontendPort = PORTS.FRONTEND
const TIMEOUT = 20000 // 20秒足够
const isWin = process.platform === 'win32'
const isNeuMode = process.argv.includes('--neu')

// 简洁的日志
const log = {
  info: (msg) => console.log(`\x1b[36m›\x1b[0m ${msg}`),
  ok: (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`),
  err: (msg) => console.error(`\x1b[31m✗\x1b[0m ${msg}`)
}

// 核心：端口检测（300ms超时足够）
function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1')
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 300)
    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

// 等待端口就绪（轮询间隔100ms）
async function waitForPort(port) {
  const start = Date.now()
  while (Date.now() - start < TIMEOUT) {
    if (await isPortOpen(port)) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return false
}

// 清理端口（只杀实际占用的进程）
function freePort(port) {
  try {
    if (isWin) {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { 
        encoding: 'utf-8', 
        stdio: ['pipe', 'pipe', 'ignore'] 
      })
      const pids = new Set(output.split('\n').map(line => {
        const match = line.trim().split(/\s+/).pop()
        return match && /^\d+$/.test(match) ? match : null
      }).filter(Boolean))
      
      pids.forEach(pid => {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          log.info(`Freed port ${port} (PID: ${pid})`)
        } catch (e) {
          // 进程可能已退出，忽略
        }
      })
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' })
    }
  } catch {
    // 端口未被占用，正常情况
  }
}

// 启动进程（简化版本）
function start(cmd, args, name) {
  log.info(`Starting ${name}...`)
  const proc = spawn(cmd, args, { cwd: ROOT, shell: isWin, stdio: 'pipe' })

  proc.stderr?.on('data', (d) => process.stderr.write(d.toString()))
  proc.stdout?.on('data', (d) => {
    const msg = d.toString()
    if (msg.includes('ready') || msg.includes('VITE')) {
      log.ok(`${name}: ${msg.split('\n')[0].slice(0, 80)}`)
      // 感知 Vite 实际监听端口（strictPort:false 时可能不是 5173）
      if (name === 'Frontend') {
        const portMatch = msg.match(/localhost:(\d+)/)
        if (portMatch) actualFrontendPort = parseInt(portMatch[1], 10)
      }
    }
  })

  return proc
}

// 清理函数
let procs = []
function cleanup() {
  if (procs.length === 0) return
  log.info('Stopping services...')
  procs.forEach(p => {
    try {
      if (isWin) execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' })
      else p.kill('SIGTERM')
    } catch {}
  })
  log.ok('Done')
  process.exit(0)
}

// 主函数
async function main() {
  console.log('\n\x1b[36m CrabClaw Dev Server\x1b[0m\n')
  
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  
  // 快速检查后端是否已运行
  if (await isPortOpen(PORTS.BACKEND)) {
    log.info('Backend already running')
    const frontend = start('npm', ['run', 'frontend:dev'], 'Frontend')
    procs = [frontend]
    
    if (await waitForPort(PORTS.FRONTEND)) {
      log.ok(`Frontend: http://localhost:${PORTS.FRONTEND}`)
    }
    
    if (isNeuMode) {
      const neu = start('npx', ['@neutralinojs/neu', 'run'], 'Neutralino')
      procs.push(neu)
    }
    
    await new Promise(() => {})
    return
  }
  
  // 清理端口
  log.info('Cleaning ports...')
  freePort(PORTS.BACKEND)
  freePort(PORTS.FRONTEND)
  
  // 并行启动前后端
  log.info('Starting services...')
  const frontend = start('npm', ['run', 'frontend:dev'], 'Frontend')
  const backend = start('bun', ['--env-file=server/.env', 'server/main.ts'], 'Backend')
  procs = [frontend, backend]
  
  // 等待两者就绪（前端先等 5173，若 Vite 换端口由 stdout 解析更新）
  const [frontendReady, backendReady] = await Promise.all([
    waitForPort(PORTS.FRONTEND),
    waitForPort(PORTS.BACKEND)
  ])

  if (!frontendReady) log.err('Frontend timeout')
  if (!backendReady) log.err('Backend timeout')

  console.log(`\n\x1b[32m✓ Frontend\x1b[0m  http://localhost:${actualFrontendPort}`)
  console.log(`\x1b[32m✓ Backend\x1b[0m   http://localhost:${PORTS.BACKEND}\n`)
  
  if (isNeuMode) {
    const neu = start('npx', ['@neutralinojs/neu', 'run'], 'Neutralino')
    procs.push(neu)
  }
  
  log.info('Press Ctrl+C to stop')
  await new Promise(() => {})
}

main().catch(e => {
  log.err(e.message)
  process.exit(1)
})