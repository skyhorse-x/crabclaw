import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../shared/constants'

export function getUnifiedDbPath(): string {
  const serverDir = path.dirname(PATHS.DATA_DIR)

  if (!existsSync(serverDir)) {
    mkdirSync(serverDir, { recursive: true })
  }

  return path.join(serverDir, 'data.db')
}
