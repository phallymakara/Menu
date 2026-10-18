import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap, getApiErrorStatus } from '@/lib/api-error'
import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import type { components } from '@/types/api'

export type AdminUserListResponse = components['schemas']['AdminUserListResponse']
export type AdminUserListItem = components['schemas']['AdminUserListItem']
export type AdminUserDetail = components['schemas']['AdminUserDetail']
export type AdminUserStatusUpdate = components['schemas']['AdminUserStatusUpdate']
export type AdminUserPlatformAdminToggle = components['schemas']['AdminUserPlatformAdminToggle']
export type AdminUserResetPasswordRequest = components['schemas']['AdminUserResetPasswordRequest']
export type UserStatus = components['schemas']['UserStatus']

export interface PlatformUserFilters {
  search?: string
  status?: UserStatus
  is_platform_admin?: boolean
  organization_id?: string
  page?: number
  pageSize?: number
}

/**
 * Hook to query paginated platform user accounts with search and filters.
 */
export function usePlatformUsers(filters: PlatformUserFilters = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'users', filters],
    queryFn: async () => {
      return unwrap(
        await apiFetch.GET('/api/v1/admin/users', {
          params: {
            query: {
              search: filters.search || undefined,
              status: filters.status || undefined,
              is_platform_admin: filters.is_platform_admin !== undefined ? filters.is_platform_admin : undefined,
              organization_id: filters.organization_id || undefined,
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
 * Hook for deep inspection of a user's account including all multi-tenant organization memberships and roles.
 */
export function usePlatformUserDetail(userId: string | null) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

  return useQuery({
    queryKey: ['platform-admin', 'users', userId],
    queryFn: async () => {
      if (!userId) return null
      return unwrap(
        await apiFetch.GET('/api/v1/admin/users/{user_id}', {
          params: { path: { user_id: userId } },
        })
      )
    },
    enabled: !!token && !!userId,
    retry: (failureCount, error) => {
      const st = getApiErrorStatus(error)
      return st !== 401 && st !== 403 && failureCount < 1
    },
  })
}

/**
 * Mutation to update user account status (Activate / Suspend / Terminate).
 */
export function useUpdateUserStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      payload,
    }: {
      userId: string
      payload: AdminUserStatusUpdate
    }) => {
      return unwrap(
        await apiFetch.PATCH('/api/v1/admin/users/{user_id}/status', {
          params: { path: { user_id: userId } },
          body: payload,
        })
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'stats'] })
    },
  })
}

/**
 * Mutation to grant or revoke Platform Super Admin privileges.
 */
export function useTogglePlatformAdmin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      payload,
    }: {
      userId: string
      payload: AdminUserPlatformAdminToggle
    }) => {
      return unwrap(
        await apiFetch.PATCH('/api/v1/admin/users/{user_id}/platform-admin', {
          params: { path: { user_id: userId } },
          body: payload,
        })
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users', variables.userId] })
    },
  })
}

/**
 * Mutation to perform an administrative password reset for a user account.
 */
export function useAdminResetPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      payload,
    }: {
      userId: string
      payload: AdminUserResetPasswordRequest
    }) => {
      return unwrap(
        await apiFetch.POST('/api/v1/admin/users/{user_id}/reset-password', {
          params: { path: { user_id: userId } },
          body: payload,
        })
      )
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'users', variables.userId] })
    },
  })
}
