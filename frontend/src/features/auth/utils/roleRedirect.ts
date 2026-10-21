import type { components } from '@/types/api'

type CurrentUserResponse = components['schemas']['CurrentUserResponse']

/**
 * Determine the destination route based on user roles and platform privileges.
 * 
 * Hierarchy:
 * 1. Super Admin (is_platform_admin === true) -> /superadmin
 * 2. Kitchen staff -> /kds
 * 3. Cashier or Waiter -> /pos
 * 4. Owner, Manager, or other tenant staff -> /admin
 */
export function getRoleBasedRedirectPath(me?: CurrentUserResponse | null): string {
  if (me?.is_platform_admin) {
    return '/superadmin'
  }

  const primaryMembership = me?.memberships?.[0] as { role?: string; is_owner?: boolean } | undefined
  if (primaryMembership?.is_owner) {
    return '/admin'
  }

  const role = (primaryMembership?.role || '').toLowerCase()

  if (role === 'kitchen' || role === 'chef') {
    return '/kds'
  }

  if (role === 'waiter' || role === 'cashier') {
    return '/pos'
  }

  return '/admin'
}
