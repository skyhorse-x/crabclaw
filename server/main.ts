/**
 * 项目统一启动入口（放在 server 目录）
 */

import { startServer } from './core/server'
import { logger } from './services/logger.service'

process.on('uncaughtException', (error) => {
  if (error?.code === 'EPIPE') return
  logger.error('Uncaught exception — process terminating', error)
  setTimeout(() => process.exit(1), 1000)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)))
})

startServer()
