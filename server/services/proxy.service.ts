import { logger } from './logger.service'
import type { ProxyConfig } from '../shared/types/config.types'

class ProxyService {
  private currentConfig: ProxyConfig | null = null

  apply(config: ProxyConfig | undefined | null): void {
    if (!config || !config.enabled || !config.host || !config.port) {
      this.disable()
      return
    }

    const protocol = config.protocol || 'http'
    const auth = config.username && config.password
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
      : ''
    const proxyUrl = `${protocol}://${auth}${config.host}:${config.port}`

    process.env.HTTP_PROXY = proxyUrl
    process.env.HTTPS_PROXY = proxyUrl
    this.currentConfig = config

    logger.info('[Proxy] HTTP 代理已启用', { url: `${protocol}://${config.host}:${config.port}` })
  }

  disable(): void {
    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    this.currentConfig = null
    logger.info('[Proxy] HTTP 代理已禁用')
  }

  getConfig(): ProxyConfig | null {
    return this.currentConfig
  }

  isEnabled(): boolean {
    return !!this.currentConfig?.enabled
  }
}

export const proxyService = new ProxyService()
