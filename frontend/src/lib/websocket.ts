import { useCallback, useEffect, useRef, useState } from 'react'

export interface WebSocketOptions {
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (event: Event) => void
  /** First reconnect delay in ms; it doubles after each failed attempt. */
  reconnectInterval?: number
  /** Upper bound for the reconnect delay in ms. */
  maxReconnectInterval?: number
  autoConnect?: boolean
}

/**
 * Close codes after which reconnecting cannot help: the server rejected the
 * connection (for example an expired token or a branch the user cannot access).
 * A new URL, such as one with a fresh token, starts a new connection.
 */
const NON_RETRYABLE_CLOSE_CODES = new Set([1008])

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
 *
 * Each connection gets a generation number. Disconnecting (including a URL change
 * or unmount) starts a new generation, so a superseded socket's late close event
 * is ignored and it is never reopened. Reconnects back off exponentially with
 * jitter and stop after a policy-violation close.
 */
export function useWebSocket(url: string | null, options: WebSocketOptions = {}) {
  const { reconnectInterval = 1000, maxReconnectInterval = 30000, autoConnect = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<unknown | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const handlersRef = useRef(options)

  useEffect(() => {
    handlersRef.current = options
  })

  /** Ends the current connection and its pending retry without touching state. */
  const teardown = useCallback(() => {
    generationRef.current += 1
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      // Suppress noisy browser warnings during React StrictMode mount/unmount cycles
      socket.onerror = () => {}
      socket.onclose = () => {}
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          try {
            socket.close(1000, 'Teardown')
          } catch {
            // Ignore teardown errors during unmount
          }
        }
      } else if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.close(1000, 'Teardown')
        } catch {
          // Ignore teardown errors during unmount
        }
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    teardown()
    setIsConnected(false)
  }, [teardown])

  const connect = useCallback(() => {
    if (!url) return
    teardown()
    const generation = generationRef.current
    const target = url
    let failedAttempts = 0

    const isCurrent = () => generationRef.current === generation

    function scheduleReconnect() {
      if (!autoConnect || !isCurrent()) return
      const backoff = Math.min(maxReconnectInterval, reconnectInterval * 2 ** failedAttempts)
      failedAttempts += 1
      // Jitter spreads reconnects out when many clients drop at once.
      const delay = backoff / 2 + Math.random() * (backoff / 2)
      reconnectTimeoutRef.current = window.setTimeout(open, delay)
    }

    function open() {
      reconnectTimeoutRef.current = null
      if (!isCurrent()) return
      let socket: WebSocket
      try {
        socket = new WebSocket(toWebSocketUrl(target))
      } catch (err) {
        console.warn('WebSocket connection error:', err)
        scheduleReconnect()
        return
      }
      socketRef.current = socket

      socket.onopen = () => {
        if (!isCurrent()) return
        failedAttempts = 0
        setIsConnected(true)
        handlersRef.current.onOpen?.()
      }

      socket.onmessage = (event: MessageEvent) => {
        if (!isCurrent()) return
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
        if (!isCurrent()) return
        handlersRef.current.onError?.(event)
      }

      socket.onclose = (event: CloseEvent) => {
        // A superseded socket closing late must not touch state or reconnect.
        if (!isCurrent()) return
        if (socketRef.current === socket) socketRef.current = null
        setIsConnected(false)
        handlersRef.current.onClose?.()
        if (NON_RETRYABLE_CLOSE_CODES.has(event.code)) return
        scheduleReconnect()
      }
    }

    open()
  }, [url, autoConnect, reconnectInterval, maxReconnectInterval, teardown])

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
