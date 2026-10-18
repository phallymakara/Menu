import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  usePlatformKPIStats,
  usePlatformOrganizations,
  usePlatformPlans,
  usePlatformUsers,
  usePlatformAuditLogs,
  useUpdateOrganizationStatus,
  useTogglePlatformAdmin,
} from './index'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (fetchMock: ReturnType<typeof stubFetch>, callIndex = 0) =>
  new URL((fetchMock.mock.calls[callIndex] as unknown as [Request])[0].url)

const methodOf = (fetchMock: ReturnType<typeof stubFetch>, callIndex = 0) =>
  (fetchMock.mock.calls[callIndex] as unknown as [Request])[0].method

beforeEach(() => {
  localStorage.setItem('emenu_access_token', 'test-superadmin-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('Platform Admin React Query Hooks', () => {
  it('usePlatformKPIStats queries /api/v1/admin/stats successfully', async () => {
    const mockStats = {
      generated_at: '2026-10-18T05:00:00Z',
      organizations: {
        total_organizations: 12,
        active_organizations: 10,
        trial_organizations: 2,
        suspended_organizations: 0,
        archived_organizations: 0,
      },
      entities: {
        total_businesses: 12,
        total_branches: 15,
        total_active_branches: 14,
        total_registered_users: 45,
        total_staff_memberships: 50,
      },
      saas_economics: {
        estimated_mrr_usd: '450.00',
        estimated_arr_usd: '5400.00',
        new_tenants_last_30d: 3,
        tenant_growth_percentage_30d: 25.0,
        active_tenant_churn_rate: 0.0,
      },
      subscription_distribution: [],
    }
    const fetchMock = stubFetch(mockStats)
    const { result } = renderHook(() => usePlatformKPIStats(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.organizations.total_organizations).toBe(12)
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/admin/stats')
  })

  it('usePlatformOrganizations forwards filters and pagination', async () => {
    const mockResponse = {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    }
    const fetchMock = stubFetch(mockResponse)
    const { result } = renderHook(
      () =>
        usePlatformOrganizations({
          search: 'bistro',
          status: 'active',
          plan_code: 'pro',
          page: 2,
          pageSize: 25,
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = urlOf(fetchMock)
    expect(url.pathname).toBe('/api/v1/admin/organizations')
    expect(url.searchParams.get('search')).toBe('bistro')
    expect(url.searchParams.get('status')).toBe('active')
    expect(url.searchParams.get('plan_code')).toBe('pro')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('page_size')).toBe('25')
  })

  it('usePlatformPlans passes include_inactive flag', async () => {
    const fetchMock = stubFetch([{ id: 'plan-1', code: 'starter', name: 'Starter' }])
    const { result } = renderHook(() => usePlatformPlans(false), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/admin/plans')
    expect(urlOf(fetchMock).searchParams.get('include_inactive')).toBe('false')
  })

  it('usePlatformUsers passes search and platform admin flag', async () => {
    const fetchMock = stubFetch({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
    const { result } = renderHook(
      () =>
        usePlatformUsers({
          search: 'admin@platform.com',
          is_platform_admin: true,
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/admin/users')
    expect(urlOf(fetchMock).searchParams.get('search')).toBe('admin@platform.com')
    expect(urlOf(fetchMock).searchParams.get('is_platform_admin')).toBe('true')
  })

  it('usePlatformAuditLogs passes action filter and date range', async () => {
    const fetchMock = stubFetch({ items: [], total: 0, page: 1, page_size: 50, total_pages: 0 })
    const { result } = renderHook(
      () =>
        usePlatformAuditLogs({
          action: 'admin.*',
          resource_type: 'organization',
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/admin/audit-logs')
    expect(urlOf(fetchMock).searchParams.get('action')).toBe('admin.*')
    expect(urlOf(fetchMock).searchParams.get('resource_type')).toBe('organization')
  })

  it('useUpdateOrganizationStatus mutation sends PATCH to organization status endpoint', async () => {
    const fetchMock = stubFetch({ id: 'org-123', status: 'SUSPENDED', is_active: false })
    const { result } = renderHook(() => useUpdateOrganizationStatus(), { wrapper })

    await result.current.mutateAsync({
      orgId: 'org-123',
      payload: { status: 'suspended', reason: 'Billing delinquency' },
    })

    expect(methodOf(fetchMock)).toBe('PATCH')
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/admin/organizations/org-123/status')
  })

  it('useTogglePlatformAdmin mutation sends PATCH with target boolean', async () => {
    const fetchMock = stubFetch({ id: 'user-456', is_platform_admin: true })
    const { result } = renderHook(() => useTogglePlatformAdmin(), { wrapper })

    await result.current.mutateAsync({
      userId: 'user-456',
      payload: { is_platform_admin: true },
    })

    expect(methodOf(fetchMock)).toBe('PATCH')
    expect(urlOf(fetchMock).pathname).toBe('/api/v1/admin/users/user-456/platform-admin')
  })
})
