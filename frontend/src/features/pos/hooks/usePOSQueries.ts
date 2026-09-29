import { queryOptions, useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'
import { toPOSRounds } from '../utils/orderMapping'

type TableStatus = components['schemas']['TableStatus']
type CashPaymentRequest = components['schemas']['CashPaymentRequest']

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

export function useUpdateTableStatus(businessId: string | null, branchId: string | null) {
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
  })
}

export function useSettleSessionCash(businessId: string | null, branchId: string | null) {
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
  })
}

export function useVoidOrderItem(businessId: string | null, branchId: string | null) {
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
  })
}
