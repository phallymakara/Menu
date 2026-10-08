import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import {
  useOpenTableSession,
  useTransferTable,
  useMergeTables,
  useUnmergeTables,
  useCancelOrder,
} from './usePOSQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const TABLE_A = '33333333-3333-4333-8333-333333333333'
const TABLE_B = '44444444-4444-4444-8444-444444444444'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: BodyInit, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const requestOf = (fetchMock: ReturnType<typeof stubFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [Request])[0]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useOpenTableSession', () => {
  it('posts open table session with guest count', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        id: 'session-123',
        table_id: TABLE_A,
        status: 'active',
        guest_count: 4,
      }),
      201
    )

    const { result } = renderHook(() => useOpenTableSession(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        tableId: TABLE_A,
        payload: { guest_count: 4 },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/tables/${TABLE_A}/sessions/open`
    )
    expect(req.method).toBe('POST')
  })
})

describe('useTransferTable', () => {
  it('posts transfer table session to target table', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        table_id: TABLE_B,
        status: 'occupied',
      }),
      200
    )

    const { result } = renderHook(() => useTransferTable(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        tableId: TABLE_A,
        payload: { target_table_id: TABLE_B, reason: 'Guest requested window seat' },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/tables/${TABLE_A}/transfer`
    )
    expect(req.method).toBe('POST')
  })
})

describe('useMergeTables and useUnmergeTables', () => {
  it('merges secondary tables into primary table', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        table_id: TABLE_A,
        status: 'occupied',
      }),
      200
    )

    const { result } = renderHook(() => useMergeTables(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        tableId: TABLE_A,
        payload: { secondary_table_ids: [TABLE_B], notes: 'Large banquet' },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/tables/${TABLE_A}/merge`
    )
    expect(req.method).toBe('POST')
  })

  it('unmerges tables back to individual tables', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        table_id: TABLE_A,
        status: 'available',
      }),
      200
    )

    const { result } = renderHook(() => useUnmergeTables(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        tableId: TABLE_A,
        payload: { secondary_table_ids: [TABLE_B] },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/tables/${TABLE_A}/unmerge`
    )
    expect(req.method).toBe('POST')
  })
})

describe('useCancelOrder', () => {
  it('posts cancel order request with reason', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        id: 'order-123',
        status: 'cancelled',
      }),
      200
    )

    const { result } = renderHook(() => useCancelOrder(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        orderId: 'order-123',
        cancelReasonCode: 'guest_changed_mind',
        cancelReason: 'Guest had an emergency',
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/orders/order-123/cancel`
    )
    expect(req.method).toBe('POST')
  })
})

