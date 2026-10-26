import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { getApiErrorStatus, unwrap } from '@/lib/api-error'
import { isUuid } from '@/lib/utils'
import type {
  GuestServiceRequest,
  GuestServiceRequestCreate,
  StaffServiceRequest,
} from '../types/serviceHub.types'
import { applyStaffRequestUpdate, isActiveServiceRequest } from '../utils/serviceRequests'

/** Header that carries the guest's table session token (kept out of URLs and logs). */
const TABLE_SESSION_TOKEN_HEADER = 'X-Table-Session-Token'

/** Staff queue polling fallback; WebSocket events normally refresh it sooner. */
export const STAFF_QUEUE_POLL_MS = 15_000

/** Guest polling fallback while a request still waits on staff. */
export const GUEST_REQUESTS_POLL_MS = 10_000

export const serviceRequestKeys = {
  all: ['service-requests'] as const,
  branch: (businessId: string | null, branchId: string | null) =>
    ['service-requests', 'branch', businessId, branchId] as const,
  guest: (sessionId: string | null) => ['service-requests', 'guest', sessionId] as const,
}

// ------------------------------------------------------------------------------
// Staff (POS service hub)
// ------------------------------------------------------------------------------

/** The branch's requests still waiting on staff (open and acknowledged). */
export function useBranchServiceRequests(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: serviceRequestKeys.branch(businessId, branchId),
    queryFn: async (): Promise<StaffServiceRequest[]> => {
      if (!isUuid(businessId) || !isUuid(branchId)) return []
      return unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/service-requests', {
          params: { path: { business_id: businessId, branch_id: branchId } },
        })
      )
    },
    enabled: isUuid(businessId) && isUuid(branchId),
    refetchInterval: STAFF_QUEUE_POLL_MS,
    staleTime: 0,
  })
}

type StaffAction = 'acknowledge' | 'resolve'

function useStaffAction(businessId: string | null, branchId: string | null, action: StaffAction) {
  const queryClient = useQueryClient()
  const queryKey = serviceRequestKeys.branch(businessId, branchId)

  return useMutation({
    mutationFn: async (requestId: string): Promise<StaffServiceRequest> => {
      if (!isUuid(businessId) || !isUuid(branchId)) {
        throw new Error('Business and branch are required')
      }
      const params = {
        path: { business_id: businessId, branch_id: branchId, request_id: requestId },
      }
      return unwrap(
        action === 'acknowledge'
          ? await apiFetch.POST(
              '/api/v1/businesses/{business_id}/branches/{branch_id}/service-requests/{request_id}/acknowledge',
              { params }
            )
          : await apiFetch.POST(
              '/api/v1/businesses/{business_id}/branches/{branch_id}/service-requests/{request_id}/resolve',
              { params }
            )
      )
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<StaffServiceRequest[]>(queryKey, (queue) =>
        applyStaffRequestUpdate(queue, updated)
      )
    },
    // Refetch either way: a 409 means another device changed the request first.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

/** Takes an open request ("on my way"). */
export function useAcknowledgeServiceRequest(businessId: string | null, branchId: string | null) {
  return useStaffAction(businessId, branchId, 'acknowledge')
}

/** Marks an open or acknowledged request as handled. */
export function useResolveServiceRequest(businessId: string | null, branchId: string | null) {
  return useStaffAction(businessId, branchId, 'resolve')
}

// ------------------------------------------------------------------------------
// Guest (QR ordering page, authenticated by the table session token)
// ------------------------------------------------------------------------------

export interface GuestTableSession {
  branchId: string | null
  tableId: string | null
  sessionId: string | null
  sessionToken: string | null
  qrToken?: string | null
}

function isGuestSessionReady(session: GuestTableSession): boolean {
  return (
    isUuid(session.branchId) &&
    isUuid(session.tableId) &&
    (!!session.sessionToken || !!session.qrToken)
  )
}

/**
 * The requests of the guest's own table session, newest first.
 *
 * Polls only while a request still waits on staff, and stops once the session
 * token is rejected (the session was closed).
 */
export function useGuestServiceRequests(session: GuestTableSession) {
  const { branchId, tableId, sessionId, sessionToken, qrToken } = session
  return useQuery({
    queryKey: serviceRequestKeys.guest(sessionId || qrToken),
    queryFn: async (): Promise<GuestServiceRequest[]> => {
      if (!isUuid(branchId) || !isUuid(tableId) || (!sessionToken && !qrToken)) return []
      const headers: Record<string, string> = {}
      if (sessionToken) {
        headers[TABLE_SESSION_TOKEN_HEADER] = sessionToken
      }
      return unwrap(
        await apiFetch.GET('/api/v1/public/tables/service-requests', {
          params: {
            query: {
              branch_id: branchId,
              table_id: tableId,
              token: qrToken || undefined,
            },
          },
          headers,
        })
      )
    },
    enabled: isGuestSessionReady(session),
    refetchInterval: (query) => {
      if (getApiErrorStatus(query.state.error) === 401) return false
      const waiting = query.state.data?.some((request) => isActiveServiceRequest(request.status))
      return waiting ? GUEST_REQUESTS_POLL_MS : false
    },
    retry: (failureCount, error) => getApiErrorStatus(error) !== 401 && failureCount < 1,
    staleTime: 0,
  })
}

/** Raises a request from the guest's table session or scanned QR. */
export function useCreateGuestServiceRequest(session: GuestTableSession) {
  const queryClient = useQueryClient()
  const { branchId, tableId, sessionId, sessionToken, qrToken } = session
  const queryKey = serviceRequestKeys.guest(sessionId || qrToken)

  return useMutation({
    mutationFn: async (body: GuestServiceRequestCreate): Promise<GuestServiceRequest> => {
      if (!isUuid(branchId) || !isUuid(tableId) || (!sessionToken && !qrToken)) {
        throw new Error('The table information is not ready yet')
      }
      const headers: Record<string, string> = {}
      if (sessionToken) {
        headers[TABLE_SESSION_TOKEN_HEADER] = sessionToken
      }
      return unwrap(
        await apiFetch.POST('/api/v1/public/tables/service-requests', {
          params: {
            query: {
              branch_id: branchId,
              table_id: tableId,
              token: qrToken || undefined,
            },
          },
          headers,
          body,
        })
      )
    },
    onSuccess: (created) => {
      queryClient.setQueryData<GuestServiceRequest[]>(queryKey, (requests) => [
        created,
        ...(requests ?? []).filter((request) => request.id !== created.id),
      ])
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

