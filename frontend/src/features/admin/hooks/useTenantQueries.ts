import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type BusinessResponse = components['schemas']['BusinessResponse']
export type BranchResponse = components['schemas']['BranchResponse']

export function useBusinesses() {
  return useQuery({
    queryKey: ['businesses'],
    queryFn: async () => {
      const { data, error } = await apiFetch.GET('/api/v1/businesses')
      if (error) throw error
      return data || []
    },
  })
}

export function useBranches(businessId: string | null) {
  return useQuery({
    queryKey: ['branches', businessId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET('/api/v1/businesses/{business_id}/branches', {
        params: { path: { business_id: businessId } },
      })
      if (error) throw error
      return data || []
    },
    enabled: !!businessId,
  })
}
