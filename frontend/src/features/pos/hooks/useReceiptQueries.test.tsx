import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { useSessionPrecheckReceipt, usePaymentReceipt } from './useReceiptQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const SESSION = '33333333-3333-4333-8333-333333333333'
const PAYMENT = '55555555-5555-4555-8555-555555555555'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: BodyInit, contentType = 'application/json') {
  const fetchMock = vi.fn(async () =>
    new Response(body, {
      status: 200,
      headers: { 'Content-Type': contentType },
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

describe('useSessionPrecheckReceipt', () => {
  it('requests html thermal pre-check slip with 80mm width and bilingual language', async () => {
    const htmlBody = JSON.stringify('<div id="receipt">Precheck Receipt</div>')
    const fetchMock = stubFetch(htmlBody, 'application/json')

    const { result } = renderHook(
      () =>
        useSessionPrecheckReceipt(BIZ, BRANCH, SESSION, {
          format: 'html',
          width: '80mm',
          lang: 'bilingual',
        }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/table-sessions/${SESSION}/pre-check`
    )
    expect(url.searchParams.get('format')).toBe('html')
    expect(url.searchParams.get('width')).toBe('80mm')
    expect(url.searchParams.get('lang')).toBe('bilingual')
  })
})

describe('usePaymentReceipt', () => {
  it('requests official paid sales receipt from backend', async () => {
    const htmlBody = JSON.stringify('<div id="receipt">Official Paid Receipt</div>')
    const fetchMock = stubFetch(htmlBody, 'application/json')

    const { result } = renderHook(
      () =>
        usePaymentReceipt(BIZ, BRANCH, PAYMENT, {
          format: 'html',
          width: '80mm',
          lang: 'bilingual',
        }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const req = requestOf(fetchMock)
    const url = new URL(req.url)
    expect(url.pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/payments/${PAYMENT}/receipt`
    )
    expect(url.searchParams.get('format')).toBe('html')
  })
})
