#!/usr/bin/env node
/**
 * 跨平台端口释放脚本
 * 用法: node scripts/kill-port.mjs 17870 4173
 */

import { execSync } from 'child_process'

const ports = process.argv.slice(2).map(Number).filter(Boolean)

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
      execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' })
    }
    console.log(`[kill-port] Released port ${port}`)
  } catch {
    // 端口未占用，忽略
  }
}

for (const port of ports) {
  killPort(port)
}
