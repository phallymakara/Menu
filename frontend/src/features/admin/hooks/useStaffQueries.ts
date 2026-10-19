import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type MemberResponse = components['schemas']['MemberResponse'] & {
  pos_permissions?: Record<string, any> | null
}
export type MemberInvite = components['schemas']['MemberInvite'] & {
  pos_permissions?: Record<string, any> | null
}
export type InviteResponse = components['schemas']['InviteResponse']
export type MemberUpdate = components['schemas']['MemberUpdate'] & {
  pos_permissions?: Record<string, any> | null
}
export type ManagerPinVerifyRequest = components['schemas']['ManagerPinVerifyRequest']
export type ManagerPinVerifyResponse = components['schemas']['ManagerPinVerifyResponse']

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('emenu_access_token') : null
      if (!token) return null
      const { data, error } = await apiFetch.GET('/api/v1/auth/me')
      if (error) throw error
      return data
    },
  })
}

export function useStaffMembers(orgId: string | null, branchId?: string | null) {
  return useQuery({
    queryKey: ['staff', orgId, branchId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await apiFetch.GET('/api/v1/organizations/{org_id}/members', {
        params: {
          path: { org_id: orgId },
          query: { branch_id: branchId || undefined },
        },
      })
      if (error) throw error
      return data || []
    },
    enabled: !!orgId,
  })
}

export function useInviteStaffMember(orgId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: MemberInvite) => {
      if (!orgId) throw new Error('Organization ID is required')
      const { data, error } = await apiFetch.POST('/api/v1/organizations/{org_id}/members', {
        params: { path: { org_id: orgId } },
        body: payload,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', orgId] })
    },
  })
}

/** Dispatch staff invitation with an assigned role/branch, generating an invitation token. */
export function useSendStaffInvitation(orgId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: MemberInvite): Promise<InviteResponse> => {
      if (!orgId) throw new Error('Organization ID is required')
      return unwrap(
        await apiFetch.POST('/api/v1/organizations/{org_id}/members/invite', {
          params: { path: { org_id: orgId } },
          body: payload,
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', orgId] })
    },
  })
}

/** Fetch full details of an individual staff member. */
export function useStaffMemberDetail(orgId: string | null, memberId: string | null) {
  return useQuery({
    queryKey: ['staff-detail', orgId, memberId],
    queryFn: async (): Promise<MemberResponse> => {
      if (!orgId || !memberId) throw new Error('Organization ID and Member ID are required')
      return unwrap(
        await apiFetch.GET('/api/v1/organizations/{org_id}/members/{member_id}', {
          params: { path: { org_id: orgId, member_id: memberId } },
        })
      )
    },
    enabled: !!orgId && !!memberId,
  })
}

export function useUpdateStaffMember(orgId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      memberId,
      payload,
    }: {
      memberId: string
      payload: MemberUpdate
    }) => {
      if (!orgId) throw new Error('Organization ID is required')
      const { data, error } = await apiFetch.PATCH(
        '/api/v1/organizations/{org_id}/members/{member_id}',
        {
          params: { path: { org_id: orgId, member_id: memberId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', orgId] })
    },
  })
}

export function useRevokeStaffMember(orgId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      if (!orgId) throw new Error('Organization ID is required')
      const { data, error } = await apiFetch.DELETE(
        '/api/v1/organizations/{org_id}/members/{member_id}',
        {
          params: { path: { org_id: orgId, member_id: memberId } },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', orgId] })
    },
  })
}

/** Verify manager/supervisor PIN for POS override actions (voids, cancellations). */
export function useVerifyManagerPin(orgId: string | null) {
  return useMutation({
    mutationFn: async (payload: ManagerPinVerifyRequest): Promise<ManagerPinVerifyResponse> => {
      if (!orgId) throw new Error('Organization ID is required')
      return unwrap(
        await apiFetch.POST('/api/v1/organizations/{org_id}/members/verify-manager-pin', {
          params: { path: { org_id: orgId } },
          body: payload,
        })
      )
    },
  })
}
