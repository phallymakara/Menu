import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap, getApiErrorStatus } from '@/lib/api-error'
import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import type { components } from '@/types/api'

export type PlatformKPIResponse = components['schemas']['PlatformKPIResponse']
export type PlatformEntityCounters = components['schemas']['PlatformEntityCounters']
export type PlatformSaaSEconomics = components['schemas']['PlatformSaaSEconomics']
export type OrganizationOverviewCounters = components['schemas']['OrganizationOverviewCounters']
export type SubscriptionTierMetric = components['schemas']['SubscriptionTierMetric']
export type MonthlyGrowthMetric = components['schemas']['MonthlyGrowthMetric']
export type ExpiringTrialOrg = components['schemas']['ExpiringTrialOrg']
export type RecentAuditFeedItem = components['schemas']['RecentAuditFeedItem']

/**
 * Hook to fetch platform-wide Super Admin KPI dashboard & SaaS economics.
 * Automatically polls every 5 seconds for live infrastructure counters and active dining sessions.
 */
export function usePlatformKPIStats() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'stats'],
    queryFn: async (): Promise<PlatformKPIResponse> => {
      const data = unwrap(await apiFetch.GET('/api/v1/admin/stats'))
      return data as unknown as PlatformKPIResponse
    },
    enabled: !!token,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}
