#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import os from 'os'

const isWin = os.platform() === 'win32'
const shellCmd = isWin ? 'powershell.exe' : '/bin/bash'
const shellArg = isWin ? '-Command' : '-c'

process.stdin.setEncoding('utf-8')
let buf = ''
let reqId = 0

function writeJson(obj) {
  const msg = JSON.stringify(obj)
  const len = Buffer.byteLength(msg, 'utf-8')
  process.stdout.write(`Content-Length: ${len}\r\n\r\n${msg}`)
}

// 列出工具
function handleListTools(id) {
  writeJson({
    id,
    jsonrpc: '2.0',
    result: {
      tools: [{
        name: 'shell_execute',
        description: '执行 Shell 命令（跨平台，Windows 使用 PowerShell，Unix 使用 Bash）',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的命令' },
            workingDirectory: { type: 'string', description: '工作目录（可选）' }
          },
          required: ['command']
        }
      }]
    }
  })
}

// 执行命令
async function handleCallTool(id, params) {
  const name = params?.name || params?.toolName || ''
  const args = params?.arguments || params?.args || {}
  const command = String(args.command || '').trim()

  if (name !== 'shell_execute' && name !== 'execute') {
    writeJson({ id, jsonrpc: '2.0', error: { code: -32601, message: `Tool not found: ${name}` } })
    return
  }

  if (!command) {
    writeJson({ id, jsonrpc: '2.0', error: { code: -32602, message: 'Missing required argument: command' } })
    return
  }

  const cwd = args.workingDirectory || args.working_directory || process.cwd()

  try {
    const result = execSync(command, {
      cwd,
      shell: isWin ? 'powershell.exe' : true,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf-8',
    })

    writeJson({
      id,
      jsonrpc: '2.0',
      result: {
        content: [{
          type: 'text',
          text: result || '(命令执行成功，无输出)'
        }]
      }
    })
  } catch (err) {
    const stderr = err.stderr || ''
    const stdout = err.stdout || ''
    const output = stdout || stderr || err.message

    writeJson({
      id,
      jsonrpc: '2.0',
      result: {
        content: [{
          type: 'text',
          text: output
        }],
        isError: err.status !== 0
      }
    })
  }
}

// 处理 stdio JSON-RPC
process.stdin.on('data', (chunk) => {
  buf += chunk
  const parts = buf.split('\r\n\r\n')
  while (parts.length >= 2) {
    const header = parts.shift()
    buf = parts.join('\r\n\r\n')
    const lenMatch = header?.match(/Content-Length:\s*(\d+)/i)
    if (!lenMatch) continue
    const contentLen = parseInt(lenMatch[1], 10)
    if (buf.length < contentLen) {
      buf = header + '\r\n\r\n' + buf
      break
    }
    const raw = buf.slice(0, contentLen)
    buf = buf.slice(contentLen)

    try {
      const msg = JSON.parse(raw)
      if (msg.method === 'initialize') {
        writeJson({
          id: msg.id,
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'crabclaw-shell', version: '1.0.0' }
          }
        })
      } else if (msg.method === 'tools/list') {
        handleListTools(msg.id)
      } else if (msg.method === 'tools/call') {
        handleCallTool(msg.id, msg.params).catch(err => {
          writeJson({
            id: msg.id,
            jsonrpc: '2.0',
            error: { code: -32000, message: err.message }
          })
        })
      } else {
        writeJson({ id: msg.id, jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${msg.method}` } })
      }
    } catch (e) {
      // 忽略解析错误
    }
  }
})
