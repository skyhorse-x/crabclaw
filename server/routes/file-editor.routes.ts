import { readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { logger } from '../services/logger.service'

const ALLOWED_ROOTS = [
  process.cwd(),
  os.homedir(),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Downloads'),
]

function isPathAllowed(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  return ALLOWED_ROOTS.some(root => resolved.startsWith(root))
}

export async function handleFileEditorRoute(pathname: string, request: Request): Promise<Response | null> {
  if (pathname === '/api/file/read' && request.method === 'GET') {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      return new Response(JSON.stringify({ ok: false, error: '缺少 path 参数' }), {
        status: 400, headers: { 'content-type': 'application/json' }
      })
    }
    if (!isPathAllowed(filePath)) {
      return new Response(JSON.stringify({ ok: false, error: '无权访问该路径' }), {
        status: 403, headers: { 'content-type': 'application/json' }
      })
    }
    try {
      const resolved = path.resolve(filePath)
      const content = await readFile(resolved, 'utf-8')
      const ext = path.extname(resolved).slice(1)
      return new Response(JSON.stringify({ ok: true, content, path: resolved, ext, name: path.basename(resolved) }), {
        status: 200, headers: { 'content-type': 'application/json' }
      })
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: `读取失败: ${err.message}` }), {
        status: 500, headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/file/write' && request.method === 'POST') {
    try {
      const body = await request.json()
      const filePath = body.path
      const content = body.content
      if (!filePath || content === undefined) {
        return new Response(JSON.stringify({ ok: false, error: '缺少 path 或 content' }), {
          status: 400, headers: { 'content-type': 'application/json' }
        })
      }
      if (!isPathAllowed(filePath)) {
        return new Response(JSON.stringify({ ok: false, error: '无权访问该路径' }), {
          status: 403, headers: { 'content-type': 'application/json' }
        })
      }
      const resolved = path.resolve(filePath)
      await writeFile(resolved, content, 'utf-8')
      return new Response(JSON.stringify({ ok: true, message: '保存成功', path: resolved }), {
        status: 200, headers: { 'content-type': 'application/json' }
      })
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: `保存失败: ${err.message}` }), {
        status: 500, headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/file/type' && request.method === 'GET') {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      return new Response(JSON.stringify({ ok: false, error: '缺少 path 参数' }), {
        status: 400, headers: { 'content-type': 'application/json' }
      })
    }
    try {
      const resolved = path.resolve(filePath)
      const stats = await stat(resolved)
      return new Response(JSON.stringify({
        ok: true,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        path: resolved
      }), {
        status: 200, headers: { 'content-type': 'application/json' }
      })
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: `无法访问路径: ${err.message}` }), {
        status: 500, headers: { 'content-type': 'application/json' }
      })
    }
  }

  if (pathname === '/api/file/open-in-finder' && request.method === 'POST') {
    try {
      const body = await request.json()
      const dirPath = body.path
      if (!dirPath) {
        return new Response(JSON.stringify({ ok: false, error: '缺少 path 参数' }), {
          status: 400, headers: { 'content-type': 'application/json' }
        })
      }
      const resolved = path.resolve(dirPath)
      const platform = os.platform()
      if (platform === 'darwin') {
        execSync(`open "${resolved}"`, { timeout: 5000 })
      } else if (platform === 'win32') {
        execSync(`explorer "${resolved}"`, { timeout: 5000 })
      } else {
        execSync(`xdg-open "${resolved}"`, { timeout: 5000 })
      }
      return new Response(JSON.stringify({ ok: true, message: '已打开目录' }), {
        status: 200, headers: { 'content-type': 'application/json' }
      })
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: `打开失败: ${err.message}` }), {
        status: 500, headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
