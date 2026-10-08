import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'

export type ReceiptFormat = 'html' | 'text' | 'json'
export type ReceiptWidth = '80mm' | '58mm'
export type ReceiptLang = 'km' | 'en' | 'bilingual'

export interface ReceiptOptions {
  format?: ReceiptFormat
  width?: ReceiptWidth
  lang?: ReceiptLang
  enabled?: boolean
}

function requireIds(businessId: string | null, branchId: string | null) {
  if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
  return { business_id: businessId, branch_id: branchId }
}

/**
 * Fetch official paid payment sales receipt in HTML, text (ESC/POS), or JSON.
 */
export function usePaymentReceipt(
  businessId: string | null,
  branchId: string | null,
  paymentId: string | null,
  options?: ReceiptOptions
) {
  const format = options?.format ?? 'html'
  const width = options?.width ?? '80mm'
  const lang = options?.lang ?? 'bilingual'

  return useQuery({
    queryKey: ['receipt', 'payment', businessId, branchId, paymentId, format, width, lang],
    queryFn: async () => {
      if (!paymentId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/payments/{payment_id}/receipt',
          {
            params: {
              path: { ...requireIds(businessId, branchId), payment_id: paymentId },
              query: { format, width, lang },
            },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!paymentId && (options?.enabled ?? true),
  })
}

/**
 * Fetch dine-in table session pre-check bill slip.
 */
export function useSessionPrecheckReceipt(
  businessId: string | null,
  branchId: string | null,
  sessionId: string | null,
  options?: ReceiptOptions
) {
  const format = options?.format ?? 'html'
  const width = options?.width ?? '80mm'
  const lang = options?.lang ?? 'bilingual'

  return useQuery({
    queryKey: ['receipt', 'session-precheck', businessId, branchId, sessionId, format, width, lang],
    queryFn: async () => {
      if (!sessionId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/table-sessions/{session_id}/pre-check',
          {
            params: {
              path: { ...requireIds(businessId, branchId), session_id: sessionId },
              query: { format, width, lang },
            },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!sessionId && (options?.enabled ?? true),
  })
}

/**
 * Fetch takeaway / standalone order pre-check bill slip.
 */
export function useOrderPrecheckReceipt(
  businessId: string | null,
  branchId: string | null,
  orderId: string | null,
  options?: ReceiptOptions
) {
  const format = options?.format ?? 'html'
  const width = options?.width ?? '80mm'
  const lang = options?.lang ?? 'bilingual'

  return useQuery({
    queryKey: ['receipt', 'order-precheck', businessId, branchId, orderId, format, width, lang],
    queryFn: async () => {
      if (!orderId) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/pre-check',
          {
            params: {
              path: { ...requireIds(businessId, branchId), order_id: orderId },
              query: { format, width, lang },
            },
          }
        )
      )
    },
    enabled: !!businessId && !!branchId && !!orderId && (options?.enabled ?? true),
  })
}
