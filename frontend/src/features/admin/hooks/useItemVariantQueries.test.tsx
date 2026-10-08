import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useItemVariants,
  useCreateItemVariant,
  useBatchCreateItemVariants,
  useUpdateItemVariant,
  useDeleteItemVariant,
} from './useItemVariantQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

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

const requestOf = (fetchMock: ReturnType<typeof stubFetch>, index = 0) =>
  (fetchMock.mock.calls[index] as unknown as [Request])[0]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useItemVariantQueries', () => {
  it('useItemVariants fetches variants list', async () => {
    const fetchMock = stubFetch([
      {
        id: 'var-1',
        variant_group: 'Size',
        name_en: 'Regular',
        name_km: 'ធម្មតា',
        price_adjustment: 0,
        is_default: true,
        is_active: true,
        display_order: 0,
      },
    ])

    const { result } = renderHook(() => useItemVariants(BIZ, ITEM), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].name_en).toBe('Regular')
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/items/${ITEM}/variants`)
  })

  it('useCreateItemVariant creates a single variant', async () => {
    const fetchMock = stubFetch(
      {
        id: 'var-2',
        variant_group: 'Size',
        name_en: 'Large',
        name_km: 'ធំ',
        price_adjustment: 0.75,
        is_default: false,
        is_active: true,
        display_order: 1,
      },
      201
    )

    const { result } = renderHook(() => useCreateItemVariant(BIZ, ITEM), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        variant_group: 'Size',
        name_en: 'Large',
        name_km: 'ធំ',
        price_adjustment: 0.75,
        is_default: false,
        is_active: true,
        display_order: 1,
      })
    })

    expect(data).toMatchObject({ id: 'var-2', name_en: 'Large' })
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useBatchCreateItemVariants creates multiple variants at once', async () => {
    const fetchMock = stubFetch(
      [
        { id: 'var-1', name_en: 'Regular', price_adjustment: 0 },
        { id: 'var-2', name_en: 'Large', price_adjustment: 0.75 },
      ],
      201
    )

    const { result } = renderHook(() => useBatchCreateItemVariants(BIZ, ITEM), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        variants: [
          { variant_group: 'Size', name_en: 'Regular', price_adjustment: 0, is_default: true, is_active: true, display_order: 0 },
          { variant_group: 'Size', name_en: 'Large', price_adjustment: 0.75, is_default: false, is_active: true, display_order: 1 },
        ],
      })
    })

    expect(data).toHaveLength(2)
    expect(requestOf(fetchMock).url).toContain(`/api/v1/businesses/${BIZ}/items/${ITEM}/variants/batch`)
    expect(requestOf(fetchMock).method).toBe('POST')
  })

  it('useUpdateItemVariant partially updates a variant', async () => {
    const fetchMock = stubFetch({ id: 'var-1', name_en: 'Regular', price_adjustment: 0.25 })

    const { result } = renderHook(() => useUpdateItemVariant(BIZ, ITEM), { wrapper })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        variantId: 'var-1',
        payload: { price_adjustment: 0.25 },
      })
    })

    expect(data).toMatchObject({ id: 'var-1', price_adjustment: 0.25 })
    expect(requestOf(fetchMock).method).toBe('PATCH')
    expect(requestOf(fetchMock).url).toContain(`/variants/var-1`)
  })

  it('useDeleteItemVariant removes a variant', async () => {
    const fetchMock = stubFetch({ message: 'Deleted' }, 200)

    const { result } = renderHook(() => useDeleteItemVariant(BIZ, ITEM), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('var-1')
    })

    expect(requestOf(fetchMock).method).toBe('DELETE')
    expect(requestOf(fetchMock).url).toContain(`/variants/var-1`)
  })
})
