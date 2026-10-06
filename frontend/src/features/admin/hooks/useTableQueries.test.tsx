import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useDownloadTableQrZip, useTableQrCodes } from './useTableQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const TABLE = '33333333-3333-4333-8333-333333333333'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: BodyInit, contentType: string) {
  const fetchMock = vi.fn(async () =>
    new Response(body, { status: 200, headers: { 'Content-Type': contentType } })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const requestOf = (fetchMock: ReturnType<typeof stubFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [Request])[0]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTableQrCodes', () => {
  it('loads backend-rendered QR codes for the real ordering URL, keyed by table', async () => {
    const orderingUrl = `${window.location.origin}/order/${BRANCH}?table=${TABLE}&token=abc`
    const fetchMock = stubFetch(
      JSON.stringify({
        branch_id: BRANCH,
        branch_name_en: 'Riverside',
        total_count: 1,
        tables: [
          {
            table_id: TABLE,
            table_number: 'T-01',
            branch_id: BRANCH,
            branch_name_en: 'Riverside',
            qr_token: 'abc',
            ordering_url: orderingUrl,
            qr_base64: 'data:image/png;base64,AAAA',
          },
        ],
      }),
      'application/json'
    )

    const { result } = renderHook(() => useTableQrCodes(BIZ, BRANCH), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.get(TABLE)?.ordering_url).toBe(orderingUrl)
    const url = new URL(requestOf(fetchMock).url)
    expect(url.pathname).toBe(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/tables/qr/batch`)
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('base_url')).toBe(window.location.origin)
  })
})

describe('useDownloadTableQrZip', () => {
  it('asks the backend for the ZIP archive, not its JSON listing', async () => {
    const fetchMock = stubFetch(new Blob(['zip-bytes']), 'application/zip')

    const { result } = renderHook(() => useDownloadTableQrZip(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync()
    })

    const url = new URL(requestOf(fetchMock).url)
    expect(url.searchParams.get('format')).toBe('zip')
    expect(url.searchParams.get('base_url')).toBe(window.location.origin)
  })
})
