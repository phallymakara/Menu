import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type DynamicKHQRRequest = components['schemas']['DynamicKHQRRequest']
export type DynamicKHQRResponse = components['schemas']['DynamicKHQRResponse']
export type KHQRPaymentAttemptResponse = components['schemas']['KHQRPaymentAttemptResponse']
export type KHQRResponse = components['schemas']['KHQRResponse']
export type KHQRPaymentRequest = components['schemas']['KHQRPaymentRequest']
export type KHQRManualConfirmationRequest = components['schemas']['KHQRManualConfirmationRequest']
export type PaymentResponse = components['schemas']['PaymentResponse']
export type CashPaymentRequest = components['schemas']['CashPaymentRequest']

function requireIds(businessId: string | null, branchId: string | null) {
  if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
  return { business_id: businessId, branch_id: branchId }
}

/**
 * Generate dynamic KHQR code for active dining session.
 */
export function useGenerateSessionKHQR(businessId: string | null, branchId: string | null) {
  return useMutation({
    mutationFn: async ({
      sessionId,
      payload,
    }: {
      sessionId: string
      payload: DynamicKHQRRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/khqr/table-sessions/{session_id}/dynamic',
          {
            params: { path: { ...requireIds(businessId, branchId), session_id: sessionId } },
            body: payload,
          }
        )
      ),
  })
}

/**
 * Generate dynamic KHQR code for standalone order / takeaway.
 */
export function useGenerateOrderKHQR(businessId: string | null, branchId: string | null) {
  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string
      payload: DynamicKHQRRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/khqr/orders/{order_id}/dynamic',
          {
            params: { path: { ...requireIds(businessId, branchId), order_id: orderId } },
            body: payload,
          }
        )
      ),
  })
}

/**
 * Poll payment attempt verification status.
 */
export function useKHQRAttemptStatus(
  businessId: string | null,
  branchId: string | null,
  attemptId: string | null,
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  return useQuery({
    queryKey: ['khqr', 'attempt', businessId, branchId, attemptId],
    queryFn: async () => {
      if (!attemptId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/khqr/attempts/{attempt_id}',
          {
            params: { path: { ...requireIds(businessId, branchId), attempt_id: attemptId } },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!attemptId && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? 2500,
  })
}

/**
 * Fetch static merchant KHQR fallback code.
 */
export function useStaticMerchantKHQR(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['khqr', 'static', businessId, branchId],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/khqr/static', {
          params: { path: requireIds(businessId, branchId) },
        })
      ),
    enabled: !!businessId && !!branchId,
  })
}

/**
 * Settle table session with Bakong verified KHQR payment.
 */
export function useSettleSessionKHQR(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sessionId,
      payload,
    }: {
      sessionId: string
      payload: KHQRPaymentRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/table-sessions/{session_id}/payments/khqr',
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

/**
 * Cashier manual confirmation for table session KHQR.
 */
export function useConfirmSessionKHQRManual(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sessionId,
      payload,
    }: {
      sessionId: string
      payload: KHQRManualConfirmationRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/table-sessions/{session_id}/payments/khqr/manual-confirmation',
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

/**
 * Settle standalone order with Bakong verified KHQR payment.
 */
export function useSettleOrderKHQR(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string
      payload: KHQRPaymentRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/payments/khqr',
          {
            params: { path: { ...requireIds(businessId, branchId), order_id: orderId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos'] })
    },
  })
}

/**
 * Cashier manual confirmation for standalone order KHQR.
 */
export function useConfirmOrderKHQRManual(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string
      payload: KHQRManualConfirmationRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/payments/khqr/manual-confirmation',
          {
            params: { path: { ...requireIds(businessId, branchId), order_id: orderId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos'] })
    },
  })
}

/**
 * Settle standalone takeaway order with cash tender.
 */
export function useSettleOrderCash(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string
      payload: CashPaymentRequest
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/payments/cash',
          {
            params: { path: { ...requireIds(businessId, branchId), order_id: orderId } },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos'] })
    },
  })
}
