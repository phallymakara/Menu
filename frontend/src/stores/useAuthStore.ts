import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string | null
  phone?: string | null
  full_name: string
  preferred_language?: string
  is_platform_admin?: boolean
  status?: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  organizationId: string | null
  businessId: string | null
  branchId: string | null
  isAuthenticated: boolean
  setAuth: (token: string, user: AuthUser) => void
  setContext: (orgId?: string | null, bizId?: string | null, branchId?: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('emenu_access_token'),
  user: null,
  organizationId: localStorage.getItem('emenu_organization_id'),
  businessId: localStorage.getItem('emenu_business_id'),
  branchId: localStorage.getItem('emenu_branch_id'),
  isAuthenticated: !!localStorage.getItem('emenu_access_token'),

  setAuth: (token: string, user: AuthUser) => {
    localStorage.setItem('emenu_access_token', token)
    set({ token, user, isAuthenticated: true })
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
    localStorage.removeItem('emenu_access_token')
    localStorage.removeItem('emenu_organization_id')
    localStorage.removeItem('emenu_business_id')
    localStorage.removeItem('emenu_branch_id')
    set({
      token: null,
      user: null,
      organizationId: null,
      businessId: null,
      branchId: null,
      isAuthenticated: false,
    })
  },
}))
