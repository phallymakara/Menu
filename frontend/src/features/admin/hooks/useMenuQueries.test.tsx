import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useMenuItems,
  useReorderCategories,
  useUpdateModifierOption,
  useDeleteModifierOption,
} from './useMenuQueries'
import { act } from '@testing-library/react'

const BIZ = '11111111-1111-4111-8111-111111111111'
const GRP = '33333333-3333-4333-8333-333333333333'
const OPT = '44444444-4444-4444-8444-444444444444'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? undefined : { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const requestOf = (fetchMock: ReturnType<typeof stubFetch>, index = 0) =>
  (fetchMock.mock.calls[index] as unknown as [Request])[0]

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

describe('useReorderCategories', () => {
  it('sends category sequence to reorder endpoint', async () => {
    const fetchMock = stubFetch([{ id: 'cat-1', display_order: 0 }, { id: 'cat-2', display_order: 1 }])

    const { result } = renderHook(() => useReorderCategories(BIZ), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        items: [
          { id: 'cat-1', display_order: 0 },
          { id: 'cat-2', display_order: 1 },
        ],
      })
    })

    expect(requestOf(fetchMock).method).toBe('PUT')
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/categories/reorder`)
  })
})

describe('useUpdateModifierOption and useDeleteModifierOption', () => {
  it('updates modifier option price and name', async () => {
    const fetchMock = stubFetch({ id: OPT, name_en: 'Extra Oat Milk', price: 0.75 })

    const { result } = renderHook(() => useUpdateModifierOption(BIZ), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        groupId: GRP,
        optionId: OPT,
        payload: { name_en: 'Extra Oat Milk', price: 0.75 },
      })
    })

    expect(data).toMatchObject({ id: OPT, price: 0.75 })
    expect(requestOf(fetchMock).method).toBe('PATCH')
    expect(requestOf(fetchMock).url).toContain(`/modifier-groups/${GRP}/options/${OPT}`)
  })

  it('deletes modifier option', async () => {
    const fetchMock = stubFetch(null, 204)

    const { result } = renderHook(() => useDeleteModifierOption(BIZ), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        groupId: GRP,
        optionId: OPT,
      })
    })

    expect(requestOf(fetchMock).method).toBe('DELETE')
    expect(requestOf(fetchMock).url).toContain(`/modifier-groups/${GRP}/options/${OPT}`)
  })
})
