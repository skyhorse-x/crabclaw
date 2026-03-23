/**
 * 认证路由
 * 处理登录、登出、Token 刷新等认证相关请求
 */

import { readJsonBody } from '../shared/utils'
import { getAuthService } from '../middleware/auth.middleware'
import { logger } from '../services/logger.service'
import { getEncryptionService } from '../services/encryption.service'

/**
 * 简单的用户凭证存储（生产环境应该使用数据库）
 */
const USERS_DB = new Map<string, { password: string; permissions: string[] }>()

// 初始化默认管理员账户
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
USERS_DB.set('admin', {
  password: DEFAULT_ADMIN_PASSWORD,
  permissions: ['read', 'write', 'admin']
})
USERS_DB.set('testuser', {
  password: process.env.DEFAULT_TEST_USER_PASSWORD || 'password123',
  permissions: ['read', 'write']
})

/**
 * 处理认证路由请求
 */
export async function handleAuthRoute(pathname: string, request: Request) {
  const authService = getAuthService()

  // POST /api/auth/login - 用户登录
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request)
      const { username, password } = body

      if (!username || !password) {
        return new Response(JSON.stringify({
          ok: false,
          error: '用户名或密码不能为空'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }

      // 验证用户名密码
      const user = USERS_DB.get(username)
      const isValidUser = user && user.password === password

      if (!isValidUser) {
        logger.warn('[Auth] Login failed', { username })
        return new Response(JSON.stringify({
          ok: false,
          error: '用户名或密码错误'
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      }

      // 生成 Token
      const token = authService.generateToken(
        `user-${Date.now()}`,
        username,
        ['read', 'write'] // 默认权限
      )

      logger.info('[Auth] Login successful', { username })

      return new Response(JSON.stringify({
        ok: true,
        message: '登录成功',
        data: {
          token,
          expiresIn: authService['config'].tokenExpiration,
          user: {
            id: `user-${Date.now()}`,
            username
          }
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[Auth] Login failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '登录失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/auth/logout - 用户登出
  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    try {
      const tokenId = authService.extractTokenFromRequest(request)
      
      if (tokenId) {
        authService.revokeToken(tokenId)
      }

      return new Response(JSON.stringify({
        ok: true,
        message: '登出成功'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[Auth] Logout failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '登出失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // GET /api/auth/me - 获取当前用户信息
  if (pathname === '/api/auth/me' && request.method === 'GET') {
    try {
      const tokenId = authService.extractTokenFromRequest(request)
      
      if (!tokenId) {
        return new Response(JSON.stringify({
          ok: false,
          error: '未认证'
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      }

      const token = authService.verifyToken(tokenId)
      
      if (!token) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Token 无效或已过期'
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        ok: true,
        data: {
          user: {
            id: token.userId,
            username: token.username,
            permissions: token.permissions
          },
          expiresAt: token.expiresAt
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[Auth] Get user info failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '获取用户信息失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // POST /api/auth/refresh - 刷新 Token
  if (pathname === '/api/auth/refresh' && request.method === 'POST') {
    try {
      const tokenId = authService.extractTokenFromRequest(request)
      
      if (!tokenId) {
        return new Response(JSON.stringify({
          ok: false,
          error: '缺少 Token'
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      }

      const token = authService.verifyToken(tokenId)
      
      if (!token) {
        // Token 已过期，需要重新登录
        return new Response(JSON.stringify({
          ok: false,
          error: 'Token 已过期，请重新登录'
        }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      }

      // 撤销旧 Token，生成新 Token
      authService.revokeToken(tokenId)
      const newToken = authService.generateToken(
        token.userId,
        token.username,
        token.permissions
      )

      return new Response(JSON.stringify({
        ok: true,
        message: 'Token 已刷新',
        data: {
          token: newToken,
          expiresIn: authService['config'].tokenExpiration
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[Auth] Refresh token failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '刷新 Token 失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // GET /api/auth/status - 获取认证状态
  if (pathname === '/api/auth/status' && request.method === 'GET') {
    try {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          authEnabled: authService['config'].enableAuth,
          activeTokens: authService.getActiveTokenCount(),
          tokenExpiration: authService['config'].tokenExpiration
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    } catch (error) {
      logger.error('[Auth] Get status failed', error)
      return new Response(JSON.stringify({
        ok: false,
        error: '获取状态失败'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  return null
}
