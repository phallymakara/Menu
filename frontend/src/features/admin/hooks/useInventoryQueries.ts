import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type InventoryItemResponse = components['schemas']['InventoryItemResponse']
export type BranchStockResponse = components['schemas']['BranchStockResponse']
export type InventoryItemCreate = components['schemas']['InventoryItemCreate']
export type BranchStockAdjustRequest = components['schemas']['BranchStockAdjustRequest']

export function useInventoryItems(businessId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'items', businessId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/inventory/items',
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

export function useBranchStock(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'stock', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/inventory/branches/{branch_id}/stock',
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

export function useCreateInventoryItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: InventoryItemCreate) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/inventory/items',
        {
          params: { path: { business_id: businessId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items', businessId] })
    },
  })
}

export function useAdjustStock(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BranchStockAdjustRequest) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/inventory/branches/{branch_id}/stock/adjust',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock', businessId, branchId] })
    },
  })
}
