/**
 * 加密服务
 * 提供敏感信息加密和解密功能
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt, scryptSync } from 'crypto'
import { logger } from './logger.service'

export interface EncryptionConfig {
  password: string
  salt?: string
  algorithm: string
  keylen: number
}

/**
 * 加密服务类
 */
export class EncryptionService {
  private readonly config: EncryptionConfig
  private readonly key: Buffer

  constructor(config?: Partial<EncryptionConfig>) {
    // 使用环境变量或默认配置
    this.config = {
      password: process.env.ENCRYPTION_PASSWORD || 'default-encryption-key-change-in-production',
      salt: process.env.ENCRYPTION_SALT,
      algorithm: 'aes-256-cbc',
      keylen: 32,
      ...config
    }

    // 生成密钥
    this.key = this.deriveKey(this.config.password, this.config.salt)
  }

  /**
   * 从密码派生密钥
   */
  private deriveKey(password: string, salt?: string): Buffer {
    // 使用固定的默认 salt，确保密钥一致性
    const defaultSalt = 'd7b8c9a6e5f4g3h2i1j0k9l8m7n6o5p4'
    const saltBuffer = salt ? Buffer.from(salt, 'hex') : Buffer.from(defaultSalt, 'hex')
    
    try {
      return scryptSync(password, saltBuffer, this.config.keylen)
    } catch (error) {
      logger.error('[Encryption] Failed to derive key', error)
      throw new Error('密钥派生失败')
    }
  }

  /**
   * 加密文本
   */
  encrypt(text: string): string {
    try {
      // 生成随机 IV
      const iv = randomBytes(16)
      
      // 创建加密器
      const cipher = createCipheriv(
        this.config.algorithm,
        this.key,
        iv
      )

      // 加密数据
      let encrypted = cipher.update(text, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      // 返回 IV + 加密数据（IV 需要用于解密）
      const result = iv.toString('hex') + ':' + encrypted
      
      logger.debug('[Encryption] Data encrypted successfully')
      return result
    } catch (error) {
      logger.error('[Encryption] Failed to encrypt', error)
      throw new Error('加密失败')
    }
  }

  /**
   * 解密文本
   */
  decrypt(encryptedText: string): string {
    try {
      // 分离 IV 和加密数据
      const parts = encryptedText.split(':')
      if (parts.length !== 2) {
        throw new Error('无效的加密数据格式')
      }

      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]

      // 创建解密器
      const decipher = createDecipheriv(
        this.config.algorithm,
        this.key,
        iv
      )

      // 解密数据
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      logger.debug('[Encryption] Data decrypted successfully')
      return decrypted
    } catch (error) {
      logger.error('[Encryption] Failed to decrypt', error)
      throw new Error('解密失败')
    }
  }

  /**
   * 加密对象
   */
  encryptObject<T extends Record<string, any>>(obj: T): string {
    const json = JSON.stringify(obj)
    return this.encrypt(json)
  }

  /**
   * 解密对象
   */
  decryptObject<T extends Record<string, any>>(encryptedText: string): T {
    const json = this.decrypt(encryptedText)
    return JSON.parse(json) as T
  }

  /**
   * 哈希密码（用于存储密码）
   */
  async hashPassword(password: string): Promise<string> {
    const crypto = await import('crypto')
    const salt = randomBytes(16).toString('hex')
    
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) {
          logger.error('[Encryption] Failed to hash password', err)
          reject(err)
          return
        }
        resolve(salt + ':' + derivedKey.toString('hex'))
      })
    })
  }

  /**
   * 验证密码
   */
  async verifyPassword(password: string, hashed: string): Promise<boolean> {
    try {
      const [salt, keyHex] = hashed.split(':')
      const crypto = await import('crypto')
      
      return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
          if (err) {
            logger.error('[Encryption] Failed to verify password', err)
            reject(err)
            return
          }
          
          const storedKey = Buffer.from(keyHex, 'hex')
          const isMatch = crypto.timingSafeEqual(derivedKey, storedKey)
          resolve(isMatch)
        })
      })
    } catch (error) {
      logger.error('[Encryption] Password verification failed', error)
      return false
    }
  }
}

// 同步版本的 scrypt（用于 Node.js 环境）
function scryptSync(password: string, salt: Buffer, keylen: number): Buffer {
  const crypto = require('crypto')
  return crypto.scryptSync(password, salt, keylen)
}

// 创建单例
let encryptionService: EncryptionService | null = null

export function getEncryptionService(): EncryptionService {
  if (!encryptionService) {
    encryptionService = new EncryptionService()
  }
  return encryptionService
}
