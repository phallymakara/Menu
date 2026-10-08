import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useBranchPublishedMenu,
  useSetBranchItemOverride,
  useBulkSetBranchItemOverrides,
  useDeleteBranchItemOverride,
  useResetBranchOverrides,
  useAssignCategoriesToBranch,
  useCreateBranchLocalItem,
  usePromoteLocalItem,
  useCatalogComparison,
  useSyncMasterCatalog,
} from './useBranchMenuQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? {} : { 'Content-Type': 'application/json' },
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

describe('useBranchMenuQueries', () => {
  it('useBranchPublishedMenu fetches resolved catalog for branch', async () => {
    const fetchMock = stubFetch({
      branch_id: BRANCH,
      branch_name_en: 'Downtown Branch',
      currency: 'USD',
      categories: [],
      total_items: 0,
    })

    const { result } = renderHook(() => useBranchPublishedMenu(BIZ, BRANCH), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.branch_name_en).toBe('Downtown Branch')
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/published`)
  })

  it('useSetBranchItemOverride saves price and availability override', async () => {
    const fetchMock = stubFetch({
      id: 'override-1',
      menu_item_id: ITEM,
      price_override: 6.5,
      availability_status: 'AVAILABLE',
    })

    const { result } = renderHook(() => useSetBranchItemOverride(BIZ, BRANCH), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        itemId: ITEM,
        payload: {
          menu_item_id: ITEM,
          price_override: 6.5,
          availability_status: 'AVAILABLE',
        },
      })
    })

    expect(data).toMatchObject({ id: 'override-1', price_override: 6.5 })
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/overrides/${ITEM}`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useBulkSetBranchItemOverrides sends bulk list of overrides', async () => {
    const fetchMock = stubFetch([
      { id: 'ov-1', menu_item_id: ITEM, price_override: 7.0 },
    ])

    const { result } = renderHook(() => useBulkSetBranchItemOverrides(BIZ, BRANCH), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        overrides: [{ menu_item_id: ITEM, price_override: 7.0, availability_status: 'AVAILABLE' }],
      })
    })

    expect(data).toHaveLength(1)
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/overrides/bulk`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useDeleteBranchItemOverride removes override to revert to master', async () => {
    const fetchMock = stubFetch(null, 204)

    const { result } = renderHook(() => useDeleteBranchItemOverride(BIZ, BRANCH), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(ITEM)
    })

    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/overrides/${ITEM}`)
    expect(requestOf(fetchMock).method).toBe('DELETE')
  })

  it('useResetBranchOverrides resets overrides back to master', async () => {
    const fetchMock = stubFetch({ message: 'Reset 4 overrides', reset_count: 4 })

    const { result } = renderHook(() => useResetBranchOverrides(BIZ, BRANCH), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({ reset_prices: true, reset_availability: false })
    })

    expect(data).toMatchObject({ reset_count: 4 })
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/reset-to-master`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useAssignCategoriesToBranch updates branch category selection', async () => {
    const fetchMock = stubFetch(['cat-1', 'cat-2'])

    const { result } = renderHook(() => useAssignCategoriesToBranch(BIZ, BRANCH), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({ category_ids: ['cat-1', 'cat-2'] })
    })

    expect(data).toEqual(['cat-1', 'cat-2'])
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/categories`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useCreateBranchLocalItem creates branch-specific local dish', async () => {
    const fetchMock = stubFetch({ id: 'local-1', name_en: 'Special Drink', base_price: 3.5 }, 201)

    const { result } = renderHook(() => useCreateBranchLocalItem(BIZ, BRANCH), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        name_en: 'Special Drink',
        base_price: 3.5,
      })
    })

    expect(data).toMatchObject({ id: 'local-1', name_en: 'Special Drink' })
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/local-items`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('usePromoteLocalItem promotes branch item to master catalog', async () => {
    const fetchMock = stubFetch({ id: ITEM, name_en: 'Promoted Dish' })

    const { result } = renderHook(() => usePromoteLocalItem(BIZ, BRANCH), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync(ITEM)
    })

    expect(data).toMatchObject({ id: ITEM, name_en: 'Promoted Dish' })
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/branches/${BRANCH}/menu/local-items/${ITEM}/promote`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useCatalogComparison fetches comparison matrix across branches', async () => {
    const fetchMock = stubFetch({ total_master_items: 10, total_local_items: 2, items: [] })

    const { result } = renderHook(() => useCatalogComparison(BIZ), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.total_master_items).toBe(10)
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/catalog/comparison`)
  })

  it('useSyncMasterCatalog triggers HQ catalog push to branches', async () => {
    const fetchMock = stubFetch({
      branches_affected_count: 2,
      items_synced_count: 10,
      overrides_preserved_count: 3,
      overrides_reset_count: 0,
      message: 'Sync completed',
    })

    const { result } = renderHook(() => useSyncMasterCatalog(BIZ), { wrapper })

    let data: any
    await act(async () => {
      data = await result.current.mutateAsync({
        sync_scope: 'ALL_ITEMS',
        preserve_custom_prices: true,
        force_availability: false,
      })
    })

    expect(data?.branches_affected_count).toBe(2)
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/catalog/sync-branches`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })
})
