import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import { useAuthStore, type AuthUser } from '@/stores/useAuthStore'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'
import type { components } from '@/types/api'

export type LoginRequest = components['schemas']['LoginRequest']
export type OwnerRegistrationRequest = components['schemas']['OwnerRegistrationRequest']
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
      const { access_token: token } = unwrap(
        await apiFetch.POST('/api/v1/auth/login', { body: credentials })
      )
      const me = await fetchCurrentUser(token)
      return { token, me }
    },
    onSuccess: ({ token, me }, credentials) => {
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

      setAuth(token, user)
      const orgId = me?.memberships?.[0]?.organization_id
      if (orgId) storeOrganizationId(orgId)
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
      }
      return { registration, token }
    },
    onSuccess: ({ registration, token }, payload) => {
      setAuth(token, {
        id: registration.user_id,
        full_name: payload.full_name,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
      })
      storeOrganizationId(registration.organization_id)
      localStorage.setItem('emenu_business_id', registration.business_id)
      localStorage.setItem('emenu_branch_id', registration.branch_id)
      useOnboardingStore.getState().resetOnboarding()
    },
  })
}
