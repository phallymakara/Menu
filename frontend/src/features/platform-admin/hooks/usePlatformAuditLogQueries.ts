import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap, getApiErrorStatus } from '@/lib/api-error'
import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import type { components } from '@/types/api'

export type AdminAuditLogListResponse = components['schemas']['AdminAuditLogListResponse']
export type AdminAuditLogItem = components['schemas']['AdminAuditLogItem']

export interface PlatformAuditLogFilters {
  organization_id?: string
  user_id?: string
  action?: string
  resource_type?: string
  from_date?: string
  to_date?: string
  page?: number
  pageSize?: number
}

/**
 * Hook to query paginated platform-wide cross-tenant audit logs with rich filters.
 */
export function usePlatformAuditLogs(filters: PlatformAuditLogFilters = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'audit-logs', filters],
    queryFn: async () => {
      return unwrap(
        await apiFetch.GET('/api/v1/admin/audit-logs', {
          params: {
            query: {
              organization_id: filters.organization_id || undefined,
              user_id: filters.user_id || undefined,
              action: filters.action || undefined,
              resource_type: filters.resource_type || undefined,
              from_date: filters.from_date || undefined,
              to_date: filters.to_date || undefined,
              page: filters.page || 1,
              page_size: filters.pageSize || 50,
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
 * Hook for deep inspection of an individual audit log record including actor, IP address, and payload diffs.
 */
export function usePlatformAuditLogDetail(logId: string | null) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'audit-logs', logId],
    queryFn: async () => {
      if (!logId) return null
      return unwrap(
        await apiFetch.GET('/api/v1/admin/audit-logs/{log_id}', {
          params: { path: { log_id: logId } },
        })
      )
    },
    enabled: !!token && !!logId,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}
