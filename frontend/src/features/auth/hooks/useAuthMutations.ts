import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import { useAuthStore, type AuthUser, ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'
import type { components } from '@/types/api'

export type LoginRequest = components['schemas']['LoginRequest']
export type OwnerRegistrationRequest = components['schemas']['OwnerRegistrationRequest']
export type PasswordResetRequestPayload = components['schemas']['PasswordResetRequest']
export type PasswordResetConfirmPayload = components['schemas']['PasswordResetConfirmRequest']
export type MyBranchesResponse = components['schemas']['MyBranchesResponse']
export type AccessibleBranchInfo = components['schemas']['AccessibleBranchInfo']
export type SwitchBranchResponse = components['schemas']['SwitchBranchResponse']
export type InviteAccept = components['schemas']['InviteAccept']
export type InviteAcceptExisting = components['schemas']['InviteAcceptExisting']
export type MemberResponse = components['schemas']['MemberResponse']
type CurrentUserResponse = components['schemas']['CurrentUserResponse']

function storeOrganizationId(orgId: string) {
  localStorage.setItem('emenu_tenant_id', orgId)
  localStorage.setItem('emenu_organization_id', orgId)
}

async function fetchCurrentUser(token: string): Promise<CurrentUserResponse | null> {
  try {
    return unwrap(
      await apiFetch.GET('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    )
  } catch {
    return null
  }
}

/** Log in with email or phone, load the profile, and persist the session. */
export function useLogin() {
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const { access_token: token, refresh_token: refreshToken } = unwrap(
        await apiFetch.POST('/api/v1/auth/login', { body: credentials })
      )
      const me = await fetchCurrentUser(token)
      return { token, refreshToken, me }
    },
    onSuccess: ({ token, refreshToken, me }, credentials) => {
      const isEmail = credentials.identifier.includes('@')
      const user: AuthUser = me
        ? {
            id: me.user_id,
            full_name: me.full_name,
            email: me.email,
            phone: me.phone,
            preferred_language: me.preferred_language,
            is_platform_admin: me.is_platform_admin,
          }
        : {
            id: 'usr_owner',
            full_name: credentials.identifier.split('@')[0],
            email: isEmail ? credentials.identifier : null,
          }

      setAuth(token, user, refreshToken)
      const primaryMembership = me?.memberships?.[0] as any
      const orgId = primaryMembership?.organization_id
      if (orgId) storeOrganizationId(orgId)
      if (primaryMembership?.branch_id) {
        localStorage.setItem('emenu_branch_id', primaryMembership.branch_id)
      }
      localStorage.setItem('emenu_onboarding_completed', 'true')
      queryClient.invalidateQueries()
    },
  })
}

/** Register a new owner workspace, then persist the session and tenant context. */
export function useRegisterOwner() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (payload: OwnerRegistrationRequest) => {
      const registration = unwrap(await apiFetch.POST('/api/v1/auth/register', { body: payload }))

      let token = registration.access_token ?? null
      let refreshToken = registration.refresh_token ?? null
      if (!token) {
        const login = unwrap(
          await apiFetch.POST('/api/v1/auth/login', {
            body: {
              identifier: payload.email || payload.phone || '',
              password: payload.password,
            },
          })
        )
        token = login.access_token
        refreshToken = login.refresh_token
      }
      return { registration, token, refreshToken }
    },
    onSuccess: ({ registration, token, refreshToken }, payload) => {
      setAuth(
        token,
        {
          id: registration.user_id,
          full_name: payload.full_name,
          email: payload.email ?? null,
          phone: payload.phone ?? null,
        },
        refreshToken
      )
      storeOrganizationId(registration.organization_id)
      localStorage.setItem('emenu_business_id', registration.business_id)
      localStorage.setItem('emenu_branch_id', registration.branch_id)
      useOnboardingStore.getState().resetOnboarding()
    },
  })
}

/**
 * Ask for password reset instructions. The server answers the same way whether
 * or not an account matches, so success only means the request was accepted.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (payload: PasswordResetRequestPayload) =>
      unwrap(await apiFetch.POST('/api/v1/auth/password-reset/request', { body: payload })),
  })
}

/** Set a new password with the token from a reset link. Every session of the account ends. */
export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: async (payload: PasswordResetConfirmPayload) =>
      unwrap(await apiFetch.POST('/api/v1/auth/password-reset/confirm', { body: payload })),
  })
}

/** Query all branches accessible to the authenticated staff member. */
export function useMyBranches() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null
  return useQuery({
    queryKey: ['auth', 'my-branches'],
    queryFn: async (): Promise<MyBranchesResponse> =>
      unwrap(await apiFetch.GET('/api/v1/auth/my-branches')),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
}

/** Switch active working branch on the server and update JWT claims. */
export function useSwitchBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (branchId: string): Promise<SwitchBranchResponse> =>
      unwrap(
        await apiFetch.POST('/api/v1/auth/switch-branch', {
          body: { branch_id: branchId },
        })
      ),
    onSuccess: (data) => {
      // 1. Persist rotated access token bearing the new active_branch_id claim
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
      const currentRefreshToken = localStorage.getItem('emenu_refresh_token')
      if (currentRefreshToken) {
        useAuthStore.getState().setTokens(data.access_token, currentRefreshToken)
      }

      // 2. Persist active branch context
      localStorage.setItem('emenu_branch_id', data.active_branch_id)
      useAuthStore.getState().setContext(
        useAuthStore.getState().organizationId,
        useAuthStore.getState().businessId,
        data.active_branch_id
      )

      // 3. Invalidate branch-scoped queries and broadcast event
      queryClient.invalidateQueries({ queryKey: ['auth', 'my-branches'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      queryClient.invalidateQueries({ queryKey: ['kds'] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu'] })

      window.dispatchEvent(
        new CustomEvent('emenu:branch-changed', { detail: { branchId: data.active_branch_id } })
      )
    },
  })
}

/** Accept staff invitation as a new user by setting account password. */
export function useAcceptStaffInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: InviteAccept): Promise<MemberResponse> => {
      return unwrap(
        await apiFetch.POST('/api/v1/auth/invitations/accept', {
          body: payload,
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

/** Accept staff invitation for an existing signed-in account. */
export function useAcceptStaffInvitationExisting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: InviteAcceptExisting): Promise<MemberResponse> => {
      return unwrap(
        await apiFetch.POST('/api/v1/auth/invitations/accept-existing', {
          body: payload,
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

