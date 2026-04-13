/**
 * 启动引导模块
 * 负责应用初始化和服务注册
 */

import { logger } from '../services/logger.service'
import { getConfigService } from '../services/config.service'
import { disconnectAllMcp } from '../services/mcp.service'
import { skillRegistry } from '../skills/skill-registry'
import { taskScheduler } from '../services/task-scheduler.service'
import { PATHS } from '../shared/constants'

const TASK_TIMERS = new Map<string, ReturnType<typeof setInterval>>()

/**
 * 初始化应用
 */
export async function bootstrap() {
  logger.info('Starting application bootstrap...')

  try {
    // 1. 初始化配置服务
    logger.debug('Initializing config service...')
    const configService = getConfigService()
    const config = await configService.getConfig()
    logger.info('Config service initialized', { 
      port: config.settings.backendPort,
      skillsCount: config.skills.length,
      tasksCount: config.tasks.length 
    })

    // 2. 加载本地技能
    logger.debug('Loading local skills from directory...')
    const skillsDir = config.settings?.skillsDir || PATHS.SKILLS_DIR
    await skillRegistry.migrateJsonSkillsToFolders(skillsDir)
    const loadedCount = await skillRegistry.loadFromDirectory(skillsDir)
    logger.info('Local skills loaded', { count: loadedCount })

    // 3. 初始化 MCP 连接（如果有配置）
    logger.debug('Initializing MCP connections...')
    // MCP 连接会在首次调用时自动建立

    // 4. 应用任务调度
    logger.debug('Applying task schedules...')
    applyTaskSchedules(config)

    logger.info('Application bootstrap completed successfully')
    
    return {
      config,
      configService
    }
  } catch (error) {
    logger.error('Application bootstrap failed', error)
    throw error
  }
}

/**
 * 应用任务调度
 */
function applyTaskSchedules(config: any) {
  // 清除现有定时器
  for (const timer of TASK_TIMERS.values()) {
    clearInterval(timer)
  }
  TASK_TIMERS.clear()

  // 为启用的任务设置定时器
  for (const task of config.tasks) {
    if (!task.enabled || task.intervalMinutes <= 0) continue

    // 如果配置为启动时运行，则立即运行一次
    if (task.runOnStartup) {
      logger.info(`Running task on startup: ${task.name}`)
      // 这里会由 server.ts 中的任务执行器处理
    }

    // 设置定时器
    const timer = setInterval(() => {
      logger.debug(`Executing scheduled task: ${task.name}`)
      // 这里会由 server.ts 中的任务执行器处理
    }, task.intervalMinutes * 60 * 1000)

    TASK_TIMERS.set(task.id, timer)
  }

  logger.info('Task schedules applied', { 
    enabledTasks: config.tasks.filter((t: any) => t.enabled).length 
  })
}

/**
 * 优雅关闭
 */
export async function gracefulShutdown() {
  logger.info('Starting graceful shutdown...')

  try {
    // 1. 断开所有 MCP 连接
    logger.debug('Disconnecting MCP servers...')
    await disconnectAllMcp()

    // 2. 关闭任务调度器
    logger.debug('Shutting down task scheduler...')
    taskScheduler.shutdown()

    // 3. 清除所有任务定时器
    logger.debug('Clearing task timers...')
    // 这里会由 server.ts 处理

    // 4. 关闭日志服务
    logger.debug('Stopping logger...')
    // logger.stopCleanup() // 如果需要的话

    logger.info('Graceful shutdown completed')
  } catch (error) {
    logger.error('Error during graceful shutdown', error)
  }
}
