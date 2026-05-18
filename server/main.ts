/**
 * 项目统一启动入口（放在 server 目录）
 */

import { startServer } from './core/server'
import { logger } from './services/logger.service'

process.on('uncaughtException', async (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'EPIPE') return
  try {
    await logger.error('Uncaught exception — process terminating', error)
  } catch {}
  setTimeout(() => process.exit(1), 1000)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)))
})

startServer().catch((error) => {
  logger.error('Server startup failed', error instanceof Error ? error : new Error(String(error)))
  process.exit(1)
})
