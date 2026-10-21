import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap, getApiErrorStatus } from '@/lib/api-error'
import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import type { components } from '@/types/api'

export type AdminPlanListItem = components['schemas']['AdminPlanListItem']
export type AdminPlanDetail = components['schemas']['AdminPlanDetail']
export type AdminPlanCreateRequest = components['schemas']['AdminPlanCreateRequest']
export type AdminPlanUpdateRequest = components['schemas']['AdminPlanUpdateRequest']

/**
 * Hook to fetch all subscription plans with subscriber counts.
 */
export function usePlatformPlans(includeInactive = true) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'plans', includeInactive],
    queryFn: async () => {
      return unwrap(
        await apiFetch.GET('/api/v1/admin/plans', {
          params: { query: { include_inactive: includeInactive } },
        })
      )
    },
    enabled: !!token,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}

/**
 * Hook for deep inspection of a subscription plan including active subscribers.
 */
export function usePlatformPlanDetail(planId: string | null) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'plans', planId],
    queryFn: async () => {
      if (!planId) return null
      return unwrap(
        await apiFetch.GET('/api/v1/admin/plans/{plan_id}', {
          params: { path: { plan_id: planId } },
        })
      )
    },
    enabled: !!token && !!planId,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}

/**
 * Mutation to create a new subscription plan tier with custom entitlement limits and pricing.
 */
export function useCreatePlatformPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: AdminPlanCreateRequest) => {
      return unwrap(
        await apiFetch.POST('/api/v1/admin/plans', {
          body: payload,
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'plans'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['plans', 'public'] })
    },
  })
}

/**
 * Mutation to update subscription plan pricing, limits, and feature toggles.
 */
export function useUpdatePlatformPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      planId,
      payload,
    }: {
      planId: string
      payload: AdminPlanUpdateRequest
    }) => {
      return unwrap(
        await apiFetch.PATCH('/api/v1/admin/plans/{plan_id}', {
          params: { path: { plan_id: planId } },
          body: payload,
        })
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'plans'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'plans', variables.planId] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['plans', 'public'] })
    },
  })
}

/**
 * Mutation to soft-archive/deactivate a subscription plan tier.
 */
export function useArchivePlatformPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (planId: string) => {
      return unwrap(
        await apiFetch.DELETE('/api/v1/admin/plans/{plan_id}', {
          params: { path: { plan_id: planId } },
        })
      )
    },
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'plans'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'plans', planId] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['plans', 'public'] })
    },
  })
}
