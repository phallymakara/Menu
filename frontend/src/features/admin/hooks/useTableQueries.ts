import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type TableResponse = components['schemas']['RestaurantTableResponse']
export type DiningAreaResponse = components['schemas']['DiningAreaResponse']
export type DiningAreaCreate = components['schemas']['DiningAreaCreate']
export type BatchTableCreate = components['schemas']['RestaurantTableBatchCreate']

export function useDiningAreas(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['dining-areas', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/areas',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: !!businessId && !!branchId,
  })
}

export function useTables(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['tables', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: !!businessId && !!branchId,
  })
}

export function useTablesDashboard(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['tables-dashboard', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return null
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables-dashboard',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
        }
      )
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!branchId,
    refetchInterval: 15000, // Background poll every 15s for floor map sync
  })
}

export function useBatchCreateTables(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BatchTableCreate) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/batch',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}
