import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWebSocket } from './websocket'

/** Minimal WebSocket stand-in whose server-side events the tests trigger by hand. */
class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readyState = 0
  closedByClient = false
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  close() {
    this.closedByClient = true
  }

  send() {}

  serverOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  serverClose(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code } as CloseEvent)
  }
}

const sockets = () => FakeWebSocket.instances
const lastSocket = () => sockets()[sockets().length - 1]

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.useFakeTimers()
  // Remove jitter so the delays are predictable: Math.random() = 1 gives the full backoff.
  vi.spyOn(Math, 'random').mockReturnValue(1)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useWebSocket', () => {
  it('never reopens a superseded socket when the URL changes', () => {
    const { rerender } = renderHook(({ url }) => useWebSocket(url), {
      initialProps: { url: '/ws/branches/1?station=a' },
    })
    const first = lastSocket()
    first.serverOpen()

    rerender({ url: '/ws/branches/1?station=b' })
    expect(first.closedByClient).toBe(true)
    const second = lastSocket()
    expect(second.url).toContain('station=b')

    // The old socket's close event arrives after the new connection started.
    act(() => first.serverClose())
    act(() => vi.advanceTimersByTime(60_000))

    expect(sockets()).toHaveLength(2)
    expect(sockets().filter((s) => s.url.includes('station=a'))).toHaveLength(1)
  })

  it('stops reconnecting after unmount', () => {
    const { unmount } = renderHook(() => useWebSocket('/ws/branches/1'))
    const socket = lastSocket()
    unmount()

    act(() => socket.serverClose())
    act(() => vi.advanceTimersByTime(60_000))
    expect(sockets()).toHaveLength(1)
  })

  it('backs off exponentially and resets after a successful connection', () => {
    renderHook(() => useWebSocket('/ws/branches/1', { reconnectInterval: 1000 }))

    act(() => lastSocket().serverClose())
    act(() => vi.advanceTimersByTime(999))
    expect(sockets()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(sockets()).toHaveLength(2)

    act(() => lastSocket().serverClose())
    act(() => vi.advanceTimersByTime(1999))
    expect(sockets()).toHaveLength(2)
    act(() => vi.advanceTimersByTime(1))
    expect(sockets()).toHaveLength(3)

    // A successful open resets the delay to the base interval.
    act(() => lastSocket().serverOpen())
    act(() => lastSocket().serverClose())
    act(() => vi.advanceTimersByTime(1000))
    expect(sockets()).toHaveLength(4)
  })

  it('does not retry when the server rejects the connection (policy violation)', () => {
    renderHook(() => useWebSocket('/ws/branches/1'))
    act(() => lastSocket().serverClose(1008))
    act(() => vi.advanceTimersByTime(60_000))
    expect(sockets()).toHaveLength(1)
  })

  it('reconnects after the server asks the client to try again later', () => {
    renderHook(() => useWebSocket('/ws/branches/1', { reconnectInterval: 500 }))
    act(() => lastSocket().serverClose(1013))
    act(() => vi.advanceTimersByTime(500))
    expect(sockets()).toHaveLength(2)
  })
})
