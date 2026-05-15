#!/usr/bin/env node
/**
 * 跨平台编译脚本
 * 自动检测当前平台和架构，选择对应 bun 编译目标
 */

import { execSync } from 'child_process'
import os from 'os'

const platform = os.platform()  // darwin | linux | win32
const arch = os.arch()          // x64 | arm64

const targetMap = {
  darwin: { arm64: 'bun-darwin-arm64', x64: 'bun-darwin-x64' },
  linux:  { arm64: 'bun-linux-arm64',  x64: 'bun-linux-x64'  },
  win32:  { arm64: 'bun-windows-x64',  x64: 'bun-windows-x64' }
}

const target = targetMap[platform]?.[arch] ?? 'bun-linux-x64'
const outExt = platform === 'win32' ? '.exe' : ''
const outfile = `dist/crabclaw/crabclaw-server${outExt}`

console.log(`[build] platform=${platform} arch=${arch} target=${target}`)
console.log(`[build] outfile=${outfile}`)

execSync(
  `bun build --compile server/main.ts --outfile=${outfile} --target=${target}`,
  { stdio: 'inherit' }
)
