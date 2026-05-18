import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { Server } from 'http'
import { randomUUID } from 'crypto'
import { logger } from './logger.service'

try {
  const wsModule = await import('ws')
  const abortHandshake = (wsModule as any).abortHandshake
  if (abortHandshake) {
    const originalAbortHandshake = abortHandshake
    ;(wsModule as any).abortHandshake = function(...args: any[]) {
      try {
        return originalAbortHandshake.apply(this, args)
      } catch (err: any) {
        if (err?.message?.includes("undefined is not an object")) {
          return
        }
        throw err
      }
    }
  }
} catch (_) { logger.warn('[WebSocket] Failed to patch abortHandshake', _) }

export interface WSClient {
  id: string
  ws: WebSocket
  userId?: string
  metadata?: Record<string, unknown>
}

export interface WSMessage {
  type: string
  payload?: unknown
  clientId?: string
  timestamp?: number
}

type MessageHandler = (client: WSClient, message: WSMessage) => void
type ConnectionHandler = (client: WSClient) => void
type DisconnectionHandler = (client: WSClient) => void

class WebSocketService {
  private wss: WebSocketServer | null = null
  private clients: Map<string, WSClient> = new Map()
  private messageHandlers: Map<string, MessageHandler> = new Map()
  private connectionHandlers: ConnectionHandler[] = []
  private disconnectionHandlers: DisconnectionHandler[] = []

  initializeWithServer(server: Server, path: string = '/ws'): void {
    if (this.wss) {
      console.warn('[WebSocket] Server already initialized')
      return
    }

    this.wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      let url: URL | null = null
      try {
        url = new URL(request.url || '/ws', `http://${request.headers.host}`)
      } catch (error) {
        logger.warn('[WebSocket] Invalid upgrade url', {
          requestUrl: request.url,
          host: request.headers.host,
          error
        })
        try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
        return
      }

      if (url.pathname === path || url.pathname === '/api/ws') {
        const upgradeHeader = String(request.headers.upgrade || '').toLowerCase()
        const wsKey = String(request.headers['sec-websocket-key'] || '')
        if (upgradeHeader !== 'websocket' || !wsKey) {
          logger.warn('[WebSocket] Ignored invalid upgrade request', {
            path: url.pathname,
            upgradeHeader,
            hasWebSocketKey: Boolean(wsKey)
          })
          try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
          return
        }

        if (!socket || socket.destroyed || !socket.writable) {
          try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
          return
        }

        socket.removeAllListeners('error')
        socket.on('error', (e: Error) => { logger.warn('[WebSocket] Socket error', e) })

        if (!this.wss) {
          try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
          return
        }

        try {
          this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            if (!ws) {
              logger.warn('[WebSocket] handleUpgrade callback received empty ws instance', { path: url?.pathname })
              try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
              return
            }
            this.wss?.emit('connection', ws, request)
          })
        } catch (err: any) {
          logger.error('[WebSocket] handleUpgrade error', {
            message: err?.message || String(err),
            path: url?.pathname,
            headers: {
              upgrade: request.headers.upgrade,
              secWebSocketVersion: request.headers['sec-websocket-version'],
              hasWebSocketKey: Boolean(request.headers['sec-websocket-key'])
            }
          })
          try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
        }
      } else {
        try { socket.destroy() } catch (_) { logger.warn('[WebSocket] Socket destroy error', _) }
      }
    })

    this.wss.on('connection', (ws: WebSocket, _request: IncomingMessage) => {
      const clientId = randomUUID()
      const client: WSClient = {
        id: clientId,
        ws,
        metadata: {}
      }

      this.clients.set(clientId, client)
      console.log(`[WebSocket] Client connected: ${clientId}`)

      this.connectionHandlers.forEach(handler => handler(client))

      ws.on('message', (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString())
          message.clientId = clientId
          message.timestamp = Date.now()

          const handler = this.messageHandlers.get(message.type)
          if (handler) {
            handler(client, message)
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      })

      ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected: ${clientId}`)
        this.clients.delete(clientId)
        this.disconnectionHandlers.forEach(handler => handler(client))
      })

      ws.on('error', (error: Error) => {
        console.error(`[WebSocket] Client error (${clientId}):`, error)
      })

      this.send(clientId, {
        type: 'connected',
        payload: { clientId, message: 'Connected successfully' }
      })
    })

    console.log(`[WebSocket] Service ready on path: ${path}`)
  }

  on(type: string, handler: MessageHandler): void {
    this.messageHandlers.set(type, handler)
  }

  onConnection(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler)
  }

  onDisconnection(handler: DisconnectionHandler): void {
    this.disconnectionHandlers.push(handler)
  }

  send(clientId: string, message: WSMessage): boolean {
    const client = this.clients.get(clientId)
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      client.ws.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error(`[WebSocket] Failed to send to ${clientId}:`, error)
      return false
    }
  }

  broadcast(senderId: string, message: WSMessage): void {
    const payload = JSON.stringify(message)
    this.clients.forEach((client) => {
      if (client.id !== senderId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload)
      }
    })
  }

  broadcastAll(message: WSMessage): void {
    const payload = JSON.stringify(message)
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload)
      }
    })
  }

  sendToUser(userId: string, message: WSMessage): boolean {
    let sent = false
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message))
        sent = true
      }
    })
    return sent
  }

  getClientCount(): number {
    return this.clients.size
  }

  getClients(): WSClient[] {
    return Array.from(this.clients.values())
  }

  getClient(clientId: string): WSClient | undefined {
    return this.clients.get(clientId)
  }

  setUserId(clientId: string, userId: string): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.userId = userId
    }
  }

  setMetadata(clientId: string, metadata: Record<string, unknown>): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.metadata = { ...client.metadata, ...metadata }
    }
  }

  close(): void {
    if (this.wss) {
      this.clients.forEach((client) => {
        client.ws.close()
      })
      this.clients.clear()
      this.wss.close()
      this.wss = null
      console.log('[WebSocket] Service closed')
    }
  }
}

export const wsService = new WebSocketService()
export default wsService
