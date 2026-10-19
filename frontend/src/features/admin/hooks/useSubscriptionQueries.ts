import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type PlanResponse = components['schemas']['PlanResponse']
export type SubscriptionResponse = components['schemas']['SubscriptionResponse']
export type ChangePlanRequest = components['schemas']['ChangePlanRequest']
export type AuditLogPaginationResponse = components['schemas']['AuditLogPaginationResponse']
export type AuditLogResponse = components['schemas']['AuditLogResponse']

/** List all available public subscription plans and feature matrices. */
export function usePublicPlans() {
  return useQuery({
    queryKey: ['plans', 'public'],
    queryFn: async (): Promise<PlanResponse[]> =>
      unwrap(await apiFetch.GET('/api/v1/plans')),
  })
}

/** View active subscription status, trial details, and branch/staff resource usage. */
export function useTenantSubscription(orgId: string | null) {
  return useQuery({
    queryKey: ['tenant-subscription', orgId],
    queryFn: async (): Promise<SubscriptionResponse> => {
      if (!orgId) throw new Error('Organization ID is required')
      return unwrap(
        await apiFetch.GET('/api/v1/organizations/{org_id}/subscription', {
          params: { path: { org_id: orgId } },
        })
      )
    },
    enabled: !!orgId,
  })
}

/** Change or upgrade organization subscription plan tier. */
export function useChangeTenantPlan(orgId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ChangePlanRequest): Promise<SubscriptionResponse> => {
      if (!orgId) throw new Error('Organization ID is required')
      return unwrap(
        await apiFetch.POST('/api/v1/organizations/{org_id}/subscription/change-plan', {
          params: { path: { org_id: orgId } },
          body: payload,
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-subscription', orgId] })
      queryClient.invalidateQueries({ queryKey: ['auth'] })
    },
  })
}

export interface TenantAuditLogFilters {
  action?: string
  resource_type?: string
  page?: number
  page_size?: number
}

/** Retrieve paginated audit logs for a tenant organization. */
export function useTenantAuditLogs(orgId: string | null, filters?: TenantAuditLogFilters) {
  return useQuery({
    queryKey: ['tenant-audit-logs', orgId, filters],
    queryFn: async (): Promise<AuditLogPaginationResponse> => {
      if (!orgId) throw new Error('Organization ID is required')
      return unwrap(
        await apiFetch.GET('/api/v1/organizations/{org_id}/audit-logs', {
          params: {
            path: { org_id: orgId },
            query: {
              action: filters?.action || undefined,
              resource_type: filters?.resource_type || undefined,
              page: filters?.page ?? 1,
              page_size: filters?.page_size ?? 20,
            },
          },
        })
      )
    },
    enabled: !!orgId,
  })
}
