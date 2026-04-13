/**
 * API 路由管理
 * 统一管理所有 API 路由
 */

import { handleHealthCheck, handleStatusCheck } from '../routes/health.routes'
import { handleMcpRoute } from '../routes/mcp.routes'
import { handleSystemRoute } from '../routes/system.routes'
import { handleConfigRoute } from '../routes/config.routes'
import { handleSkillMarketRoute } from '../routes/skill-market.routes'
import { handleBridgeRoute } from '../routes/bridge.routes'
import { handleAuthRoute } from '../routes/auth.routes'
import { handleChatHistoryRoute } from '../routes/chat-history.routes'
import { handleAgentRoute } from '../routes/agent.routes'
import { handleRemoteControlRoute } from '../routes/remote-control.routes'
import { handleScheduledTasksRoute } from '../routes/scheduled-tasks.routes'

/**
 * 路由处理器类型
 */
export type RouteHandler = (pathname: string, request: Request) => Promise<Response | null>

/**
 * 按前缀分组的路由处理器
 * 避免遍历所有处理器，提升性能
 */
const prefixRouteMap: Map<string, RouteHandler> = new Map([
  ['/health', handleHealthCheck],
  ['/api/health', handleHealthCheck],
  ['/status', handleStatusCheck],
  ['/api/status', handleStatusCheck],
  ['/api/mcp', handleMcpRoute],
  ['/api/system', handleSystemRoute],
  ['/api/config', handleConfigRoute],
  ['/api/skill-market', handleSkillMarketRoute],
  ['/api/bridge', handleBridgeRoute],
  ['/api/auth', handleAuthRoute],
  ['/api/chat-history', handleChatHistoryRoute],
  ['/api/agents', handleAgentRoute],
  ['/api/remote-control', handleRemoteControlRoute],
  ['/api/scheduled-tasks', handleScheduledTasksRoute]
])

/**
 * 处理 API 请求
 * 使用前缀匹配优化路由查找
 */
export async function handleApiRequest(pathname: string, request: Request): Promise<Response | null> {
  for (const [prefix, handler] of prefixRouteMap) {
    if (pathname.startsWith(prefix)) {
      const response = await handler(pathname, request)
      if (response) {
        return response
      }
    }
  }
  return null
}
