import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import { getApiErrorStatus } from '@/lib/api-error'

export type BusinessResponse = components['schemas']['BusinessResponse']
export type BranchResponse = components['schemas']['BranchResponse']
export type BusinessUpdate = components['schemas']['BusinessUpdate']
export type BranchCreate = components['schemas']['BranchCreate']
export type BranchUpdate = components['schemas']['BranchUpdate']

export function useBusinesses() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null
  return useQuery({
    queryKey: ['businesses'],
    queryFn: async () => {
      const { data, error } = await apiFetch.GET('/api/v1/businesses')
      if (error) throw error
      return data || []
    },
    enabled: !!token,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}

export function useBranches(businessId: string | null) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null
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
    enabled: !!businessId && !!token,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, payload }: { businessId: string; payload: BusinessUpdate }) =>
      unwrap(
        await apiFetch.PATCH('/api/v1/businesses/{business_id}', {
          params: { path: { business_id: businessId } },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] })
    },
  })
}

export function useCreateBranch(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BranchCreate) => {
      if (!businessId) throw new Error('Business ID is required')
      return unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/branches', {
          params: { path: { business_id: businessId } },
          body: payload,
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', businessId] })
    },
  })
}

export function useUpdateBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      businessId,
      branchId,
      payload,
    }: {
      businessId: string
      branchId: string
      payload: BranchUpdate
    }) =>
      unwrap(
        await apiFetch.PATCH('/api/v1/businesses/{business_id}/branches/{branch_id}', {
          params: { path: { business_id: businessId, branch_id: branchId } },
          body: payload,
        })
      ),
    onSuccess: (_, { businessId }) => {
      queryClient.invalidateQueries({ queryKey: ['branches', businessId] })
    },
  })
}
