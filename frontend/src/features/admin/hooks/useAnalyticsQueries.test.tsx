import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { useSalesOverview, useTopSellingItems } from './useAnalyticsQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const START = '2026-10-05T17:00:00.000Z'
const END = '2026-10-06T02:30:00.000Z'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (fetchMock: ReturnType<typeof stubFetch>) =>
  new URL((fetchMock.mock.calls[0] as unknown as [Request])[0].url)

beforeEach(() => {
  localStorage.setItem('emenu_access_token', 'test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('analytics date range', () => {
  it('sends the date range for the sales overview', async () => {
    const fetchMock = stubFetch({ business_id: BIZ })
    const { result } = renderHook(() => useSalesOverview(BIZ, null, START, END), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(urlOf(fetchMock).searchParams.get('start_date')).toBe(START)
    expect(urlOf(fetchMock).searchParams.get('end_date')).toBe(END)
  })

  it('sends the date range for top-selling items and unwraps the item list', async () => {
    const fetchMock = stubFetch({ business_id: BIZ, items: [{ menu_item_id: 'a' }] })
    const { result } = renderHook(() => useTopSellingItems(BIZ, null, START, END), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([{ menu_item_id: 'a' }])
    expect(urlOf(fetchMock).searchParams.get('start_date')).toBe(START)
    expect(urlOf(fetchMock).searchParams.get('end_date')).toBe(END)
  })
})
