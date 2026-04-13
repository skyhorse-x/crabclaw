import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export function getUnifiedDbPath(): string {
  const cwd = process.cwd()
  const serverDir = path.basename(cwd) === 'server' ? cwd : path.join(cwd, 'server')

  if (!existsSync(serverDir)) {
    mkdirSync(serverDir, { recursive: true })
  }

  return path.join(serverDir, 'data.db')
}
