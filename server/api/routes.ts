/**
 * API 路由管理
 * 统一管理所有 API 路由
 */

import { handleHealthCheck, handleStatusCheck } from '../routes/health.routes'
import { handleMcpRoute } from '../routes/mcp.routes'
import { handleSystemRoute } from '../routes/system.routes'
import { handleChatRoute } from '../routes/chat.routes'
import { handleConfigRoute } from '../routes/config.routes'
import { handleSkillMarketRoute } from '../routes/skill-market.routes'
import { handleBridgeRoute } from '../routes/bridge.routes'
import { handleAuthRoute } from '../routes/auth.routes'
import { handleChatHistoryRoute } from '../routes/chat-history.routes'
import { handleAgentRoute } from '../routes/agent.routes'

/**
 * 路由处理器类型
 */
export type RouteHandler = (pathname: string, request: Request) => Promise<Response | null>

/**
 * 所有 API 路由处理器
 */
export const apiRoutes: RouteHandler[] = [
  handleHealthCheck,
  handleStatusCheck,
  handleMcpRoute,
  handleSystemRoute,
  handleChatRoute,
  handleConfigRoute,
  handleChatHistoryRoute,
  handleAuthRoute,
  handleSkillMarketRoute,
  handleBridgeRoute,
  handleAgentRoute
]

/**
 * 处理 API 请求
 */
export async function handleApiRequest(pathname: string, request: Request): Promise<Response | null> {
  // 按顺序尝试所有路由处理器
  for (const handler of apiRoutes) {
    const response = await handler(pathname, request)
    if (response) {
      return response
    }
  }
  return null
}
