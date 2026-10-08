import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  useGenerateSessionKHQR,
  useKHQRAttemptStatus,
  useSettleSessionKHQR,
  useConfirmSessionKHQRManual,
} from './usePaymentQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const SESSION = '33333333-3333-4333-8333-333333333333'
const ATTEMPT = '44444444-4444-4444-8444-444444444444'

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

describe('useGenerateSessionKHQR', () => {
  it('calls dynamic table session KHQR endpoint with selected currency', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        attempt_id: ATTEMPT,
        qr_string: '000201010212...',
        qr_image_data_url: 'data:image/png;base64,mock',
        currency: 'USD',
        amount: 14.5,
        amount_usd: '14.50',
        amount_khr: 59450,
        exchange_rate: 4100,
        merchant_name: 'Bistro Siem Reap',
        merchant_city: 'Siem Reap',
        bakong_account_id: 'bistro@aclb',
        bill_reference: 'BILL-01',
        deep_link_url: 'bakong://qr?data=...',
        md5: 'md5hash',
        expires_at: '2026-10-07T12:00:00Z',
      }),
      201
    )

    const { result } = renderHook(() => useGenerateSessionKHQR(BIZ, BRANCH), { wrapper })
    let res: unknown
    await act(async () => {
      res = await result.current.mutateAsync({
        sessionId: SESSION,
        payload: { currency: 'USD' },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/khqr/table-sessions/${SESSION}/dynamic`
    )
    expect(req.method).toBe('POST')
    expect((res as any).attempt_id).toBe(ATTEMPT)
  })
})

describe('useKHQRAttemptStatus', () => {
  it('polls the KHQR attempt status endpoint and returns attempt state', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        id: ATTEMPT,
        status: 'succeeded',
        amount: 14.5,
        currency: 'USD',
        transaction_hash: 'tx-123456',
        created_at: '2026-10-07T10:00:00Z',
      })
    )

    const { result } = renderHook(
      () => useKHQRAttemptStatus(BIZ, BRANCH, ATTEMPT, { refetchInterval: 0 }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/khqr/attempts/${ATTEMPT}`
    )
    expect(result.current.data?.status).toBe('succeeded')
  })
})

describe('useSettleSessionKHQR', () => {
  it('posts attempt_id to settle session via verified KHQR', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        payment_id: '55555555-5555-4555-8555-555555555555',
        payment_method: 'khqr',
        amount_usd: 14.5,
        status: 'completed',
      }),
      201
    )

    const { result } = renderHook(() => useSettleSessionKHQR(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION,
        payload: { attempt_id: ATTEMPT },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/table-sessions/${SESSION}/payments/khqr`
    )
    expect(req.method).toBe('POST')
  })
})

describe('useConfirmSessionKHQRManual', () => {
  it('posts manual override confirmation with reason and attempt_id', async () => {
    const fetchMock = stubFetch(
      JSON.stringify({
        payment_id: '66666666-6666-4666-8666-666666666666',
        payment_method: 'khqr',
        amount_usd: 14.5,
        status: 'completed',
      }),
      201
    )

    const { result } = renderHook(() => useConfirmSessionKHQRManual(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        sessionId: SESSION,
        payload: {
          attempt_id: ATTEMPT,
          reason: 'Cashier confirmed receipt manually in banking app',
        },
      })
    })

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/table-sessions/${SESSION}/payments/khqr/manual-confirmation`
    )
    expect(req.method).toBe('POST')
  })
})
