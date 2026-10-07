import { create } from 'zustand'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'

export const ACCESS_TOKEN_KEY = 'emenu_access_token'
export const REFRESH_TOKEN_KEY = 'emenu_refresh_token'

/** Device preferences that survive a logout. Every other `emenu_*` key is session data. */
const DEVICE_PREFERENCE_KEYS = new Set(['emenu_theme', 'emenu_language'])

/** Remove tokens and every tenant `emenu_*` key from localStorage, keeping device preferences. */
function clearSessionStorage(): void {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key?.startsWith('emenu_') && !DEVICE_PREFERENCE_KEYS.has(key)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}

export interface AuthUser {
  id: string
  email: string | null
  phone?: string | null
  full_name: string
  avatar_url?: string | null
  preferred_language?: string
  is_platform_admin?: boolean
  status?: string
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: AuthUser | null
  organizationId: string | null
  businessId: string | null
  branchId: string | null
  isAuthenticated: boolean
  setAuth: (token: string, user: AuthUser, refreshToken?: string | null) => void
  /** Store a rotated token pair without touching the user profile. */
  setTokens: (token: string, refreshToken: string) => void
  updateUser: (updates: Partial<AuthUser>) => void
  setContext: (orgId?: string | null, bizId?: string | null, branchId?: string | null) => void
  /**
   * Reset local auth state and remove tokens and tenant keys from localStorage.
   * It does not revoke the session on the server: use `logout` from `@/lib/auth-session`.
   */
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(ACCESS_TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  user: null,
  organizationId: localStorage.getItem('emenu_organization_id'),
  businessId: localStorage.getItem('emenu_business_id'),
  branchId: localStorage.getItem('emenu_branch_id'),
  isAuthenticated: !!localStorage.getItem(ACCESS_TOKEN_KEY),

  setAuth: (token: string, user: AuthUser, refreshToken?: string | null) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
    set({ token, refreshToken: refreshToken ?? null, user, isAuthenticated: true })
  },

  setTokens: (token: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    set({ token, refreshToken, isAuthenticated: true })
  },

  updateUser: (updates: Partial<AuthUser>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }))
  },

  setContext: (orgId, bizId, branchId) => {
    if (orgId) localStorage.setItem('emenu_organization_id', orgId)
    if (bizId) localStorage.setItem('emenu_business_id', bizId)
    if (branchId) localStorage.setItem('emenu_branch_id', branchId)
    set({
      organizationId: orgId ?? null,
      businessId: bizId ?? null,
      branchId: branchId ?? null,
    })
  },

  logout: () => {
    clearSessionStorage()
    useOnboardingStore.getState().resetOnboarding()
    set({
      token: null,
      refreshToken: null,
      user: null,
      organizationId: null,
      businessId: null,
      branchId: null,
      isAuthenticated: false,
    })
  },
}))
