import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  useCreateKitchenStation,
  useUpdateKitchenStation,
  useDeleteKitchenStation,
  useAssignStationItems,
  useUndoItemStatus,
  useRerouteItem,
  useFireCourse,
  useStationRecallTickets,
  useStationMetrics,
} from './useKDSQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const STATION = '33333333-3333-4333-8333-333333333333'
const ITEM = '44444444-4444-4444-8444-444444444444'
const ORDER = '55555555-5555-4555-8555-555555555555'

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

const requestOf = (fetchMock: ReturnType<typeof stubFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [Request])[0]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KDS advanced operations', () => {
  it('useUndoItemStatus posts undo request', async () => {
    const fetchMock = stubFetch({ id: ITEM, status: 'cooking' }, 200)

    const { result } = renderHook(() => useUndoItemStatus(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(ITEM)
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kds/items/${ITEM}/undo`
    )
  })

  it('useRerouteItem posts reroute target station', async () => {
    const fetchMock = stubFetch({ id: ITEM, kitchen_station_id: STATION }, 200)

    const { result } = renderHook(() => useRerouteItem(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        orderItemId: ITEM,
        targetStationId: STATION,
      })
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kds/items/${ITEM}/reroute`
    )
  })

  it('useFireCourse posts fire request for order courses', async () => {
    const fetchMock = stubFetch([{ id: ITEM, status: 'cooking' }], 200)

    const { result } = renderHook(() => useFireCourse(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        orderId: ORDER,
        courseStage: 'mains',
      })
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kds/orders/${ORDER}/fire`
    )
  })

  it('useStationRecallTickets queries completed tickets', async () => {
    const fetchMock = stubFetch([{ order_id: ORDER, order_number: 'ORD-1' }], 200)

    const { result } = renderHook(() => useStationRecallTickets(BIZ, BRANCH, STATION), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const req = requestOf(fetchMock)
    expect(req.method).toBe('GET')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kds/stations/${STATION}/recall`
    )
    expect(result.current.data).toHaveLength(1)
  })

  it('useStationMetrics queries real-time SLA metrics', async () => {
    const fetchMock = stubFetch(
      {
        station_id: STATION,
        station_name: 'Grill',
        station_code: 'GRILL',
        branch_id: BRANCH,
        active_tickets: 5,
        overdue_tickets: 1,
        avg_prep_time_minutes: 8.5,
      },
      200
    )

    const { result } = renderHook(() => useStationMetrics(BIZ, BRANCH, STATION), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const req = requestOf(fetchMock)
    expect(req.method).toBe('GET')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kds/stations/${STATION}/metrics`
    )
    expect(result.current.data?.active_tickets).toBe(5)
  })
})

describe('Kitchen station configuration', () => {
  it('useCreateKitchenStation posts new station', async () => {
    const fetchMock = stubFetch({ id: STATION, name_en: 'Grill', code: 'GRILL' }, 201)

    const { result } = renderHook(() => useCreateKitchenStation(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        name_en: 'Grill',
        code: 'GRILL',
        station_type: 'prep_station',
      })
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kitchen-stations`
    )
  })

  it('useUpdateKitchenStation puts station configuration', async () => {
    const fetchMock = stubFetch({ id: STATION, name_en: 'Updated Grill' }, 200)

    const { result } = renderHook(() => useUpdateKitchenStation(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        stationId: STATION,
        payload: { name_en: 'Updated Grill' },
      })
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('PUT')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kitchen-stations/${STATION}`
    )
  })

  it('useDeleteKitchenStation deletes station', async () => {
    const fetchMock = stubFetch(null, 204)

    const { result } = renderHook(() => useDeleteKitchenStation(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(STATION)
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('DELETE')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kitchen-stations/${STATION}`
    )
  })

  it('useAssignStationItems posts category and item assignments', async () => {
    const fetchMock = stubFetch({ status: 'assigned' }, 200)

    const { result } = renderHook(() => useAssignStationItems(BIZ, BRANCH), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        stationId: STATION,
        payload: { category_ids: ['cat-1'] },
      })
    })

    const req = requestOf(fetchMock)
    expect(req.method).toBe('POST')
    expect(new URL(req.url).pathname).toBe(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/kitchen-stations/${STATION}/assignments`
    )
  })
})
