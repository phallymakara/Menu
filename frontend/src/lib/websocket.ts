import { useEffect, useRef, useState, useCallback } from 'react'

export interface WebSocketOptions {
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (event: Event) => void
  reconnectInterval?: number
  autoConnect?: boolean
}

export function useWebSocket(url: string | null, options: WebSocketOptions = {}) {
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    autoConnect = true,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<unknown | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const connect = useCallback(() => {
    if (!url) return

    // Derive protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = url.startsWith('ws://') || url.startsWith('wss://')
      ? url
      : `${protocol}//${window.location.host}${url.startsWith('/') ? '' : '/'}${url}`

    try {
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        setIsConnected(true)
        onOpen?.()
      }

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          setLastMessage(parsed)
          onMessage?.(parsed)
        } catch {
          setLastMessage(event.data)
          onMessage?.(event.data)
        }
      }

      socket.onerror = (event) => {
        onError?.(event)
      }

      socket.onclose = () => {
        setIsConnected(false)
        onClose?.()
        socketRef.current = null

        // Auto-reconnect
        if (autoConnect) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect()
          }, reconnectInterval)
        }
      }
    } catch (err) {
      console.warn('WebSocket connection error:', err)
    }
  }, [url, autoConnect, reconnectInterval, onMessage, onOpen, onClose, onError])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    setIsConnected(false)
  }, [])

  const sendMessage = useCallback((data: unknown) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data)
      socketRef.current.send(payload)
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (autoConnect && url) {
      connect()
    }
    return () => {
      disconnect()
    }
  }, [url, autoConnect, connect, disconnect])

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
  }
}
