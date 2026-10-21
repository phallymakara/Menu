import { useCurrentUser } from '@/features/admin/hooks/useStaffQueries'
import { useAuthStore } from '@/stores/useAuthStore'

export interface UserRoleAccess {
  isLoading: boolean
  isAuthenticated: boolean
  isPlatformAdmin: boolean
  isOwner: boolean
  role: string | null
  isCashierOnly: boolean
  isKitchenOnly: boolean
  canAccessAdmin: boolean
  canAccessPOS: boolean
  canAccessKDS: boolean
  redirectPath: string
}

/**
 * Custom hook to enforce role-based access control (RBAC) across POS, KDS, and Admin pages.
 * - Cashier role: can only view and use POS (/pos). Cannot access /admin or /kds.
 * - Kitchen/Chef role: can only view and use KDS (/kds). Cannot access /admin or /pos.
 * - Owners, Managers, Platform Admins: full access to all areas.
 */
export function useUserRoleAccess(): UserRoleAccess {
  const { data: me, isLoading } = useCurrentUser()
  const activeOrgId = useAuthStore((s) => s.organizationId)
  const token = typeof window !== 'undefined' ? localStorage.getItem('emenu_access_token') : null

  if (isLoading) {
    return {
      isLoading: true,
      isAuthenticated: !!token,
      isPlatformAdmin: false,
      isOwner: false,
      role: null,
      isCashierOnly: false,
      isKitchenOnly: false,
      canAccessAdmin: true,
      canAccessPOS: true,
      canAccessKDS: true,
      redirectPath: '/admin',
    }
  }

  if (!me) {
    return {
      isLoading: false,
      isAuthenticated: false,
      isPlatformAdmin: false,
      isOwner: false,
      role: null,
      isCashierOnly: false,
      isKitchenOnly: false,
      canAccessAdmin: true,
      canAccessPOS: true,
      canAccessKDS: true,
      redirectPath: '/login',
    }
  }

  const isPlatformAdmin = Boolean(me.is_platform_admin)

  // Find membership corresponding to the active organization, or fallback to the first active membership
  const currentMembership =
    (activeOrgId ? me.memberships?.find((m) => m.organization_id === activeOrgId) : null) ||
    me.memberships?.[0]

  const isOwner = Boolean(currentMembership?.is_owner)
  const role = (currentMembership?.role || '').toLowerCase()

  // Cashier role restriction: when not owner or superadmin, cashier can ONLY see POS
  const isCashierOnly = !isPlatformAdmin && !isOwner && role === 'cashier'

  // Kitchen role restriction: when not owner or superadmin, kitchen/chef can ONLY see KDS
  const isKitchenOnly = !isPlatformAdmin && !isOwner && (role === 'kitchen' || role === 'chef')

  const canAccessAdmin = isPlatformAdmin || isOwner || (!isCashierOnly && !isKitchenOnly)
  const canAccessPOS = isPlatformAdmin || isOwner || !isKitchenOnly
  const canAccessKDS = isPlatformAdmin || isOwner || !isCashierOnly

  let redirectPath = '/admin'
  if (isPlatformAdmin) {
    redirectPath = '/superadmin'
  } else if (isCashierOnly) {
    redirectPath = '/pos'
  } else if (isKitchenOnly) {
    redirectPath = '/kds'
  }

  return {
    isLoading: false,
    isAuthenticated: true,
    isPlatformAdmin,
    isOwner,
    role,
    isCashierOnly,
    isKitchenOnly,
    canAccessAdmin,
    canAccessPOS,
    canAccessKDS,
    redirectPath,
  }
}
