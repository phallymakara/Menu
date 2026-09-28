import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { useMenuItems } from './useMenuQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const requestOf = (fetchMock: ReturnType<typeof stubFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [Request])[0]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMenuItems', () => {
  it('requests the largest page and returns the items array', async () => {
    const fetchMock = stubFetch({ items: [{ id: 'a' }], total: 1, page: 1, page_size: 100, total_pages: 1 })

    const { result } = renderHook(() => useMenuItems(BIZ), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([{ id: 'a' }])
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/items?page_size=100`)
  })

  it('surfaces the HTTP status on failure', async () => {
    stubFetch({ detail: 'Forbidden' }, 403)

    const { result } = renderHook(() => useMenuItems(BIZ), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toMatchObject({ status: 403, message: 'Forbidden' })
  })
})
