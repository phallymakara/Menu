import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  serviceRequestKeys,
  useAcknowledgeServiceRequest,
  useBranchServiceRequests,
  useCreateGuestServiceRequest,
  useGuestServiceRequests,
} from './useServiceRequestQueries'

const BIZ = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const TABLE = '33333333-3333-4333-8333-333333333333'
const REQUEST = '44444444-4444-4444-8444-444444444444'
const SESSION_TOKEN = 'guest-session-token'

const guestSession = {
  branchId: BRANCH,
  tableId: TABLE,
  sessionId: 'session-1',
  sessionToken: SESSION_TOKEN,
}

const staffRequest = {
  id: REQUEST,
  business_id: BIZ,
  branch_id: BRANCH,
  table_id: TABLE,
  table_session_id: 'session-1',
  table_number: 'T-01',
  request_type: 'water',
  status: 'open',
  created_at: '2026-10-05T10:00:00Z',
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_request: Request) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('guest service request hooks', () => {
  it('sends the session token in a header, never in the URL', async () => {
    const fetchMock = stubFetch([])

    const { result } = renderHook(() => useGuestServiceRequests(guestSession), {
      wrapper: makeWrapper(newClient()),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const request = fetchMock.mock.calls[0][0]
    expect(request.url).toContain(`/api/v1/public/tables/service-requests?branch_id=${BRANCH}&table_id=${TABLE}`)
    expect(request.url).not.toContain(SESSION_TOKEN)
    expect(request.headers.get('X-Table-Session-Token')).toBe(SESSION_TOKEN)
  })

  it('does not call the API before the table session is ready', () => {
    const fetchMock = stubFetch([])

    renderHook(() => useGuestServiceRequests({ ...guestSession, sessionToken: null }), {
      wrapper: makeWrapper(newClient()),
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a duplicate open request as a 409 ApiError', async () => {
    stubFetch({ detail: 'You already have an open request of this type.' }, 409)

    const { result } = renderHook(() => useCreateGuestServiceRequest(guestSession), {
      wrapper: makeWrapper(newClient()),
    })

    await expect(
      result.current.mutateAsync({ request_type: 'water', note: null })
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('staff service request hooks', () => {
  it('skips the request for demo or missing IDs', () => {
    const fetchMock = stubFetch([])

    renderHook(() => useBranchServiceRequests('demo-biz', BRANCH), {
      wrapper: makeWrapper(newClient()),
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('updates the cached queue with the acknowledged request', async () => {
    const client = newClient()
    const queryKey = serviceRequestKeys.branch(BIZ, BRANCH)
    client.setQueryData(queryKey, [staffRequest])
    const fetchMock = stubFetch({ ...staffRequest, status: 'acknowledged', acknowledged_by_name: 'Sokha' })

    const { result } = renderHook(() => useAcknowledgeServiceRequest(BIZ, BRANCH), {
      wrapper: makeWrapper(client),
    })
    await act(() => result.current.mutateAsync(REQUEST))

    const request = fetchMock.mock.calls[0][0]
    expect(request.method).toBe('POST')
    expect(request.url).toContain(
      `/api/v1/businesses/${BIZ}/branches/${BRANCH}/service-requests/${REQUEST}/acknowledge`
    )
    expect(client.getQueryData(queryKey)).toMatchObject([
      { id: REQUEST, status: 'acknowledged', acknowledged_by_name: 'Sokha' },
    ])
  })
})
