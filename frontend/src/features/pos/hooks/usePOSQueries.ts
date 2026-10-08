import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'
import { toPOSRounds } from '../utils/orderMapping'

type TableStatus = components['schemas']['TableStatus']
type CashPaymentRequest = components['schemas']['CashPaymentRequest']
export type TableSessionOpenRequest = components['schemas']['TableSessionOpenRequest']
export type TableSessionCloseRequest = components['schemas']['TableSessionCloseRequest']
export type TableTransferRequest = components['schemas']['TableTransferRequest']
export type TableMergeRequest = components['schemas']['TableMergeRequest']
export type TableUnmergeRequest = components['schemas']['TableUnmergeRequest']
export type BillSummaryResponse = components['schemas']['BillSummaryResponse']
export type TableSessionResponse = components['schemas']['TableSessionResponse']

function requireIds(businessId: string | null, branchId: string | null) {
  if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
  return { business_id: businessId, branch_id: branchId }
}

/** Order rounds placed during a table's active dining session. */
export function sessionRoundsQuery(
  businessId: string,
  branchId: string,
  tableId: string,
  sessionId: string
) {
  return queryOptions({
    queryKey: ['pos', 'rounds', businessId, branchId, sessionId],
    queryFn: async () => {
      const orders = unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/orders', {
          params: {
            path: { business_id: businessId, branch_id: branchId },
            query: { table_id: tableId },
          },
        })
      )
      return toPOSRounds(orders, sessionId)
    },
  })
}

/** Update physical table status (e.g. available, occupied, dirty_cleaning). */
export function useUpdateTableStatus(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ tableId, status }: { tableId: string; status: TableStatus }) =>
      unwrap(
        await apiFetch.PATCH(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/status',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
            body: { status },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}

/** Settle dining table session with cash tender. */
export function useSettleSessionCash(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, payload }: { sessionId: string; payload: CashPaymentRequest }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/table-sessions/{session_id}/payments/cash',
          {
            params: { path: { ...requireIds(businessId, branchId), session_id: sessionId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['pos'] })
    },
  })
}

/** Supervisor-authorized order item void. */
export function useVoidOrderItem(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      itemId,
      reason,
    }: {
      orderId: string
      itemId: string
      reason: string
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/items/{item_id}/void',
          {
            params: {
              path: { ...requireIds(businessId, branchId), order_id: orderId, item_id: itemId },
            },
            body: { void_reason_code: 'other', void_reason: reason || null },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos', 'rounds'] })
    },
  })
}

/** Supervisor-authorized cancellation of entire order round. */
export function useCancelOrder(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      cancelReasonCode,
      cancelReason,
    }: {
      orderId: string
      cancelReasonCode: components['schemas']['VoidReasonCode']
      cancelReason?: string | null
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/cancel',
          {
            params: {
              path: { ...requireIds(businessId, branchId), order_id: orderId },
            },
            body: {
              cancel_reason_code: cancelReasonCode,
              cancel_reason: cancelReason || null,
            },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['pos'] })
      queryClient.invalidateQueries({ queryKey: ['kds'] })
    },
  })
}

/** Fetch itemized bill calculations for active table session. */
export function useSessionBillSummary(
  businessId: string | null,
  branchId: string | null,
  sessionId: string | null
) {
  return useQuery({
    queryKey: ['pos', 'bill-summary', 'session', businessId, branchId, sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/table-sessions/{session_id}/bill',
          {
            params: { path: { ...requireIds(businessId, branchId), session_id: sessionId } },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!sessionId,
  })
}

/** Fetch itemized bill calculations for standalone order. */
export function useOrderBillSummary(
  businessId: string | null,
  branchId: string | null,
  orderId: string | null
) {
  return useQuery({
    queryKey: ['pos', 'bill-summary', 'order', businessId, branchId, orderId],
    queryFn: async () => {
      if (!orderId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/bill',
          {
            params: { path: { ...requireIds(businessId, branchId), order_id: orderId } },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!orderId,
  })
}

/** Fetch active session details for table. */
export function useActiveTableSession(
  businessId: string | null,
  branchId: string | null,
  tableId: string | null
) {
  return useQuery({
    queryKey: ['pos', 'table-session', 'active', businessId, branchId, tableId],
    queryFn: async () => {
      if (!tableId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/sessions/active',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!tableId,
  })
}

/** Staff opens/seats a dining session on table. */
export function useOpenTableSession(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tableId,
      payload,
    }: {
      tableId: string
      payload: TableSessionOpenRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/sessions/open',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}

/** Staff manually closes session / releases table. */
export function useCloseTableSession(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tableId,
      payload,
    }: {
      tableId: string
      payload?: TableSessionCloseRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/sessions/close',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
            body: payload ?? {},
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}

/** Staff marks table as bill requested. */
export function useRequestTableBill(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ tableId }: { tableId: string }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/sessions/request-bill',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}

/** Transfer table session and all orders to another physical table. */
export function useTransferTable(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tableId,
      payload,
    }: {
      tableId: string
      payload: TableTransferRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/transfer',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}

/** Merge physical tables together for large parties. */
export function useMergeTables(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tableId,
      payload,
    }: {
      tableId: string
      payload: TableMergeRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/merge',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}

/** Unmerge physical tables back to independent tables. */
export function useUnmergeTables(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tableId,
      payload,
    }: {
      tableId: string
      payload: TableUnmergeRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/unmerge',
          {
            params: { path: { ...requireIds(businessId, branchId), table_id: tableId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
    },
  })
}
