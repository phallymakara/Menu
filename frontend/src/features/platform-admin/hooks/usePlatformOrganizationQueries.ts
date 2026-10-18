import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap, getApiErrorStatus } from '@/lib/api-error'
import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import type { components } from '@/types/api'

export type AdminOrganizationListResponse = components['schemas']['AdminOrganizationListResponse']
export type AdminOrganizationListItem = components['schemas']['AdminOrganizationListItem']
export type AdminOrganizationDetail = components['schemas']['AdminOrganizationDetail']
export type AdminOrganizationStatusUpdate = components['schemas']['AdminOrganizationStatusUpdate']
export type AdminOrganizationSubscriptionOverride = components['schemas']['AdminOrganizationSubscriptionOverride']
export type OrganizationStatus = components['schemas']['OrganizationStatus']

export interface PlatformOrganizationFilters {
  search?: string
  status?: OrganizationStatus
  plan_code?: string
  page?: number
  pageSize?: number
}

/**
 * Hook to query paginated tenant organizations with multi-field search and filters.
 */
export function usePlatformOrganizations(filters: PlatformOrganizationFilters = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'organizations', filters],
    queryFn: async () => {
      return unwrap(
        await apiFetch.GET('/api/v1/admin/organizations', {
          params: {
            query: {
              search: filters.search || undefined,
              status: filters.status || undefined,
              plan_code: filters.plan_code || undefined,
              page: filters.page || 1,
              page_size: filters.pageSize || 20,
            },
          },
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
 * Hook for deep inspection of a specific tenant organization.
 */
export function usePlatformOrganizationDetail(orgId: string | null) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'organizations', orgId],
    queryFn: async () => {
      if (!orgId) return null
      return unwrap(
        await apiFetch.GET('/api/v1/admin/organizations/{org_id}', {
          params: { path: { org_id: orgId } },
        })
      )
    },
    enabled: !!token && !!orgId,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}

/**
 * Mutation to update organization lifecycle status (Activate, Suspend, Archive).
 * Setting status to SUSPENDED or ARCHIVED immediately locks out all organization staff.
 */
export function useUpdateOrganizationStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      orgId,
      payload,
    }: {
      orgId: string
      payload: AdminOrganizationStatusUpdate
    }) => {
      return unwrap(
        await apiFetch.PATCH('/api/v1/admin/organizations/{org_id}/status', {
          params: { path: { org_id: orgId } },
          body: payload,
        })
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organizations'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organizations', variables.orgId] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'stats'] })
    },
  })
}

/**
 * Mutation to override an organization's subscription tier, extend trial dates, or modify billing dates.
 */
export function useOverrideOrganizationSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      orgId,
      payload,
    }: {
      orgId: string
      payload: AdminOrganizationSubscriptionOverride
    }) => {
      return unwrap(
        await apiFetch.PATCH('/api/v1/admin/organizations/{org_id}/subscription', {
          params: { path: { org_id: orgId } },
          body: payload,
        })
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organizations'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'organizations', variables.orgId] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'stats'] })
    },
  })
}
