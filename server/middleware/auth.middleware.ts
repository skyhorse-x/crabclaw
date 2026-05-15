/**
 * 认证中间件
 * 提供 API 请求的身份验证和授权
 */

import { createHash } from 'crypto'
import { logger } from '../services/logger.service'
import { getEncryptionService } from '../services/encryption.service'

export interface AuthToken {
  userId: string
  username: string
  issuedAt: number
  expiresAt: number
  permissions: string[]
}

export interface AuthConfig {
  secretKey: string
  tokenExpiration: number // 小时
  enableAuth: boolean
}

/**
 * 简单的基于 Token 的认证系统
 */
export class AuthService {
  private readonly config: AuthConfig
  private readonly tokens: Map<string, AuthToken> = new Map()
  private readonly encryptionService = getEncryptionService()

  constructor(config?: Partial<AuthConfig>) {
    this.config = {
      secretKey: process.env.AUTH_SECRET_KEY || 'change-this-secret-in-production',
      tokenExpiration: 24, // 24 小时
      enableAuth: process.env.ENABLE_AUTH === 'true',
      ...config
    }
  }

  /**
   * 生成访问 Token
   */
  generateToken(userId: string, username: string, permissions: string[] = []): string {
    const now = Date.now()
    const tokenData: AuthToken = {
      userId,
      username,
      issuedAt: now,
      expiresAt: now + (this.config.tokenExpiration * 60 * 60 * 1000),
      permissions
    }

    // 加密 Token 数据
    const encrypted = this.encryptionService.encryptObject(tokenData)
    
    // 生成 Token ID
    const tokenId = this.hashTokenId(encrypted)
    
    // 存储 Token
    this.tokens.set(tokenId, tokenData)
    
    logger.info('[Auth] Token generated', { userId, username, expiresIn: this.config.tokenExpiration })
    
    return tokenId
  }

  /**
   * 验证 Token
   */
  verifyToken(tokenId: string): AuthToken | null {
    try {
      // 检查 Token 是否存在
      const token = this.tokens.get(tokenId)
      
      if (!token) {
        logger.debug('[Auth] Token not found', { tokenId })
        return null
      }

      // 检查是否过期
      if (Date.now() > token.expiresAt) {
        logger.warn('[Auth] Token expired', { userId: token.userId, username: token.username })
        this.tokens.delete(tokenId)
        return null
      }

      // 更新最后访问时间
      token.issuedAt = Date.now()
      this.tokens.set(tokenId, token)
      
      return token
    } catch (error) {
      logger.error('[Auth] Token verification failed', error)
      return null
    }
  }

  /**
   * 撤销 Token
   */
  revokeToken(tokenId: string): boolean {
    const deleted = this.tokens.delete(tokenId)
    logger.info('[Auth] Token revoked', { tokenId, success: deleted })
    return deleted
  }

  /**
   * 清理过期的 Token
   */
  cleanupExpiredTokens(): number {
    const now = Date.now()
    let count = 0
    
    for (const [tokenId, token] of this.tokens.entries()) {
      if (now > token.expiresAt) {
        this.tokens.delete(tokenId)
        count++
      }
    }
    
    if (count > 0) {
      logger.info('[Auth] Cleaned up expired tokens', { count })
    }
    
    return count
  }

  /**
   * 检查权限
   */
  hasPermission(tokenOrTokenId: AuthToken | string | null | undefined, permission: string): boolean {
    if (!tokenOrTokenId) return false

    const token = typeof tokenOrTokenId === 'string'
      ? this.verifyToken(tokenOrTokenId)
      : tokenOrTokenId

    if (!token) return false
    
    // 管理员拥有所有权限
    if (token.permissions.includes('admin')) return true
    
    return token.permissions.includes(permission)
  }

  /**
   * 从请求头提取 Token
   */
  extractTokenFromRequest(request: Request): string | null {
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader) {
      return null
    }

    // 支持 Bearer Token 格式
    const parts = authHeader.split(' ')
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1]
    }

    // 或者直接是 Token
    return authHeader
  }

  /**
   * 认证中间件工厂
   */
  middleware(requiredPermissions: string[] = []) {
    return async (request: Request): Promise<Response | null> => {
      // 如果未启用认证，直接通过
      if (!this.config.enableAuth) {
        return null
      }

      // 排除健康检查和登录接口
      const url = new URL(request.url)
      const publicPaths = ['/health', '/status', '/api/auth/login']
      if (publicPaths.includes(url.pathname)) {
        return null
      }

      // 提取并验证 Token
      const tokenId = this.extractTokenFromRequest(request)
      
      if (!tokenId) {
        logger.warn('[Auth] Missing authentication token', { path: url.pathname })
        return this.createAuthError('缺少认证 Token')
      }

      const token = this.verifyToken(tokenId)
      
      if (!token) {
        logger.warn('[Auth] Invalid or expired token', { path: url.pathname })
        return this.createAuthError('Token 无效或已过期')
      }

      // 检查权限
      for (const permission of requiredPermissions) {
        if (!this.hasPermission(token, permission)) {
          logger.warn('[Auth] Insufficient permissions', { 
            userId: token.userId, 
            permission,
            path: url.pathname 
          })
          return this.createAuthError('权限不足')
        }
      }

      // 将用户信息添加到请求头（供后续处理使用）
      request.headers.set('X-User-Id', token.userId)
      request.headers.set('X-Username', token.username)
      
      return null
    }
  }

  /**
   * 创建认证错误响应
   */
  private createAuthError(message: string): Response {
    return new Response(JSON.stringify({
      ok: false,
      error: message,
      code: 'AUTH_ERROR'
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  /**
   * 哈希 Token ID
   */
  private hashTokenId(data: string): string {
    return createHash('sha256').update(data).digest('hex')
  }

  /**
   * 获取活跃 Token 数量
   */
  getActiveTokenCount(): number {
    return this.tokens.size
  }

  /**
   * 获取所有活跃 Token 信息（不包含敏感数据）
   */
  getActiveTokens(): Array<{ id: string; username: string; expiresAt: number }> {
    const result: Array<{ id: string; username: string; expiresAt: number }> = []
    
    for (const [id, token] of this.tokens.entries()) {
      result.push({
        id,
        username: token.username,
        expiresAt: token.expiresAt
      })
    }
    
    return result
  }
}

// 创建单例
let authService: AuthService | null = null

export function getAuthService(config?: Partial<AuthConfig>): AuthService {
  if (!authService) {
    authService = new AuthService(config)
    
    // 每小时清理一次过期 Token
    setInterval(() => {
      authService!.cleanupExpiredTokens()
    }, 60 * 60 * 1000)
  }
  
  return authService
}
