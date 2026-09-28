import { useCallback, useEffect, useRef, useState } from 'react'

export interface WebSocketOptions {
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (event: Event) => void
  reconnectInterval?: number
  autoConnect?: boolean
}

/** Resolve a relative path such as `/ws/branches/1` against the current host. */
function toWebSocketUrl(url: string): string {
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * Keep a WebSocket open to `url`, reconnecting after drops while `autoConnect` is on.
 *
 * Handlers are read from a ref, so passing inline callbacks does not reconnect the
 * socket on every render. Messages are JSON-parsed when possible.
 */
export function useWebSocket(url: string | null, options: WebSocketOptions = {}) {
  const { reconnectInterval = 3000, autoConnect = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<unknown | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(false)
  const handlersRef = useRef(options)

  useEffect(() => {
    handlersRef.current = options
  })

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    socketRef.current?.close()
    socketRef.current = null
    setIsConnected(false)
  }, [])

  const connect = useCallback(() => {
    if (!url) return
    shouldReconnectRef.current = autoConnect

    function open(target: string) {
      let socket: WebSocket
      try {
        socket = new WebSocket(toWebSocketUrl(target))
      } catch (err) {
        console.warn('WebSocket connection error:', err)
        return
      }
      socketRef.current = socket

      socket.onopen = () => {
        setIsConnected(true)
        handlersRef.current.onOpen?.()
      }

      socket.onmessage = (event: MessageEvent) => {
        let payload: unknown = event.data
        try {
          payload = JSON.parse(event.data)
        } catch {
          // Non-JSON frame: pass the raw data through.
        }
        setLastMessage(payload)
        handlersRef.current.onMessage?.(payload)
      }

      socket.onerror = (event) => {
        handlersRef.current.onError?.(event)
      }

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null
        setIsConnected(false)
        handlersRef.current.onClose?.()

        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(() => open(target), reconnectInterval)
        }
      }
    }

    open(url)
  }, [url, autoConnect, reconnectInterval])

  const sendMessage = useCallback((data: unknown) => {
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(typeof data === 'string' ? data : JSON.stringify(data))
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (autoConnect && url) connect()
    return disconnect
  }, [url, autoConnect, connect, disconnect])

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
  }
}
