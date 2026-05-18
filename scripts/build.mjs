#!/usr/bin/env node
/**
 * 跨平台编译脚本
 * 编译后端 Bun 服务为 5 个平台的独立二进制
 * 生成启动脚本，自动检测当前平台/架构，启动对应的后端 + Neutralino 应用
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const distDir = path.resolve('dist/crabclaw')

// 清理无平台后缀的旧版残留二进制（如 crabclaw-server、crabclaw-server.exe）
for (const stale of ['crabclaw-server', 'crabclaw-server.exe']) {
  const stalePath = path.join(distDir, stale)
  if (fs.existsSync(stalePath)) {
    fs.rmSync(stalePath)
    console.log(`[build] 清理残留文件: ${stale}`)
  }
}

// 5 个编译目标（与 Neutralino 命名风格对齐）
const targets = [
  { label: 'win_x64',   target: 'bun-windows-x64',   ext: '.exe' },
  { label: 'mac_arm64', target: 'bun-darwin-arm64',  ext: ''      },
  { label: 'mac_x64',   target: 'bun-darwin-x64',    ext: ''      },
  { label: 'linux_x64', target: 'bun-linux-x64',     ext: ''      },
  { label: 'linux_arm64', target: 'bun-linux-arm64', ext: ''      },
]

fs.mkdirSync(distDir, { recursive: true })

// 1. 编译全部 5 个平台的后端二进制
console.log('[build] 开始编译全平台后端二进制...\n')

for (const { label, target, ext } of targets) {
  const filename = `crabclaw-server-${label}${ext}`
  const outfile = path.join(distDir, filename)
  console.log(`[build] 编译 ${label} (target=${target})...`)
  execSync(
    `bun build --compile server/main.ts --outfile="${outfile}" --target=${target}`,
    { stdio: 'inherit' }
  )
  console.log(`[build] ✓ 完成: ${filename}\n`)
}

// 2. 生成 Windows 启动脚本 (start.bat)
console.log('[build] 生成启动脚本...')

const batContent = `@echo off
chcp 65001 >nul
title crabclaw 启动中...

rem 检测 Windows 架构
if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set ARCH=arm64
) else (
    set ARCH=x64
)

set "BACKEND=%~dp0crabclaw-server-win_%ARCH%.exe"
if not exist "%BACKEND%" (
    echo [launcher] 错误: 未找到后端程序 %BACKEND%
    pause
    exit /b 1
)

echo [launcher] 启动后端服务...
start /B "" "%BACKEND%"

echo [launcher] 等待后端就绪...
setlocal enabledelayedexpansion
set WAIT_COUNT=0
:waitLoop
if !WAIT_COUNT! gtr 30 (
    echo [launcher] 后端启动超时，请检查日志
    pause
    exit /b 1
)
set /a WAIT_COUNT+=1

rem 优先用 curl（Windows 10 1803+ 内置），回退到 PowerShell
where curl >nul 2>&1
if %errorlevel% equ 0 (
    curl -sf --connect-timeout 2 --max-time 3 "http://127.0.0.1:17870/api/health" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [launcher] 后端已就绪
        goto :launch
    )
) else (
    powershell -NoProfile -NonInteractive -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:17870/api/health' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [launcher] 后端已就绪
        goto :launch
    )
)
>nul 2>&1 timeout /t 1 /nobreak
goto :waitLoop

:launch
endlocal
echo [launcher] 启动应用...
"%~dp0crabclaw-win_%ARCH%.exe"
echo [launcher] 应用已退出
`

fs.writeFileSync(path.join(distDir, 'start.bat'), batContent, 'utf-8')
console.log('[build] 已生成 start.bat')

// 3. 生成 macOS/Linux 启动脚本 (start.sh)
const shContent = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

# 检测操作系统和架构
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_LABEL="mac"  ;;
  Linux)  OS_LABEL="linux" ;;
  *)
    echo "[launcher] 不支持的操作系统: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_LABEL="x64"   ;;
  aarch64|arm64) ARCH_LABEL="arm64" ;;
  *)
    echo "[launcher] 不支持的架构: $ARCH"
    exit 1
    ;;
esac

BACKEND="$DIR/crabclaw-server-\${OS_LABEL}_\${ARCH_LABEL}"
NEUTRALINO="$DIR/crabclaw-\${OS_LABEL}_\${ARCH_LABEL}"

if [ ! -f "$BACKEND" ]; then
  echo "[launcher] 错误: 未找到后端程序 $BACKEND"
  exit 1
fi

echo "[launcher] 启动后端服务..."
"$BACKEND" &
SERVER_PID=$!

echo "[launcher] 等待后端就绪..."
WAIT_COUNT=0
while [ $WAIT_COUNT -lt 20 ]; do
  if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:17870/api/health" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
      echo "[launcher] 后端已就绪"
      break
    fi
  else
    if nc -z 127.0.0.1 17870 2>/dev/null; then
      echo "[launcher] 后端已就绪"
      break
    fi
  fi
  WAIT_COUNT=$((WAIT_COUNT + 1))
  sleep 1
done

if [ $WAIT_COUNT -ge 20 ]; then
  echo "[launcher] 后端启动超时"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "[launcher] 启动应用..."
"$NEUTRALINO"

echo "[launcher] 应用已退出，清理后端..."
kill $SERVER_PID 2>/dev/null
`

const shPath = path.join(distDir, 'start.sh')
fs.writeFileSync(shPath, shContent, 'utf-8')
fs.chmodSync(shPath, 0o755)
console.log('[build] 已生成 start.sh')

// 4. 生成 macOS .app bundle（双击即可启动，内部调用 start.sh）
console.log('[build] 生成 macOS .app bundle...')

const appBundle = path.join(distDir, 'crabclaw.app')
const appMacOS = path.join(appBundle, 'Contents', 'MacOS')
const appResources = path.join(appBundle, 'Contents', 'Resources')
fs.mkdirSync(appMacOS, { recursive: true })
fs.mkdirSync(appResources, { recursive: true })

// Info.plist
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>crabclaw</string>
  <key>CFBundleDisplayName</key>
  <string>crabclaw</string>
  <key>CFBundleIdentifier</key>
  <string>com.study.crabclaw</string>
  <key>CFBundleVersion</key>
  <string>2.0.0</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>`
fs.writeFileSync(path.join(appBundle, 'Contents', 'Info.plist'), plist, 'utf-8')

// launcher 脚本：从 .app/Contents/MacOS 找到 dist/crabclaw 目录运行 start.sh
const launcherSh = `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_DIR="$(cd "\${SCRIPT_DIR}/../../.." && pwd)"
exec "\${BUNDLE_DIR}/start.sh"
`
const launcherPath = path.join(appMacOS, 'launcher')
fs.writeFileSync(launcherPath, launcherSh, 'utf-8')
fs.chmodSync(launcherPath, 0o755)

console.log(`[build] 已生成 ${appBundle}`)
console.log('[build] macOS 用户可双击 crabclaw.app 启动，也可直接运行 start.sh')

console.log('\n[build] 全部编译完成')
