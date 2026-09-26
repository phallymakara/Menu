import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type SalesOverviewMetrics = components['schemas']['SalesOverviewMetrics']
export type TopSellingItemsResponse = components['schemas']['TopSellingItemsResponse']
export type PaymentBreakdownResponse = components['schemas']['PaymentBreakdownResponse']

export function useSalesOverview(
  businessId: string | null,
  branchId?: string | null,
  startDate?: string | null,
  endDate?: string | null
) {
  return useQuery({
    queryKey: ['analytics', 'overview', businessId, branchId, startDate, endDate],
    queryFn: async () => {
      if (!businessId) return null
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/analytics/overview',
        {
          params: {
            path: { business_id: businessId },
            query: {
              branch_id: branchId || undefined,
              start_date: startDate || undefined,
              end_date: endDate || undefined,
            },
          },
        }
      )
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })
}

export function useTopSellingItems(businessId: string | null, branchId?: string | null) {
  return useQuery({
    queryKey: ['analytics', 'top-items', businessId, branchId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/analytics/top-items',
        {
          params: {
            path: { business_id: businessId },
            query: { branch_id: branchId || undefined },
          },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: !!businessId,
  })
}

export function usePaymentBreakdown(businessId: string | null, branchId?: string | null) {
  return useQuery({
    queryKey: ['analytics', 'payment-breakdown', businessId, branchId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/analytics/payment-breakdown',
        {
          params: {
            path: { business_id: businessId },
            query: { branch_id: branchId || undefined },
          },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: !!businessId,
  })
}

export function useBranchComparison(businessId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'branch-comparison', businessId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/analytics/branch-comparison',
        {
          params: { path: { business_id: businessId } },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: !!businessId,
  })
}
