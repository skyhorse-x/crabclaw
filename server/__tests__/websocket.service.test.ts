import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { wsService } from '../services/websocket.service'

describe('WebSocket Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wsService.close()
  })

  describe('initialization', () => {
    it('should have empty clients on init', () => {
      expect(wsService.getClientCount()).toBe(0)
    })

    it('should return empty array for getClients', () => {
      expect(wsService.getClients()).toEqual([])
    })

    it('should return undefined for non-existent client', () => {
      expect(wsService.getClient('non-existent')).toBeUndefined()
    })
  })

  describe('message sending', () => {
    it('should return false for non-existent client', () => {
      const result = wsService.send('non-existent', { type: 'test' })
      expect(result).toBe(false)
    })

    it('should return false when broadcasting from non-existent sender', () => {
      wsService.broadcast('non-existent', { type: 'test' })
    })

    it('should return false when sending to non-existent user', () => {
      const result = wsService.sendToUser('non-existent-user', { type: 'test' })
      expect(result).toBe(false)
    })
  })

  describe('broadcastAll', () => {
    it('should not throw when broadcasting to empty clients', () => {
      expect(() => {
        wsService.broadcastAll({ type: 'test' })
      }).not.toThrow()
    })
  })

  describe('setMetadata', () => {
    it('should not throw for non-existent client', () => {
      expect(() => {
        wsService.setMetadata('non-existent', { key: 'value' })
      }).not.toThrow()
    })
  })

  describe('setUserId', () => {
    it('should not throw for non-existent client', () => {
      expect(() => {
        wsService.setUserId('non-existent', 'user-1')
      }).not.toThrow()
    })
  })
})
