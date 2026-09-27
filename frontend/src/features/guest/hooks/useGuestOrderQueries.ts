import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type TablePublicVerifyResponse = components['schemas']['TablePublicVerifyResponse']
export type TableSessionResponse = components['schemas']['TableSessionResponse']
export type GuestOrderPlacementRequest = components['schemas']['GuestOrderPlacementRequest']
export type OrderResponse = components['schemas']['OrderResponse']

export function useVerifyTable(
  branchId: string | null,
  tableId: string | null,
  token: string | null
) {
  return useQuery({
    queryKey: ['guest', 'verify-table', branchId, tableId, token],
    queryFn: async () => {
      if (!branchId || !tableId || !token) return null
      const { data, error } = await apiFetch.GET('/api/v1/public/tables/verify', {
        params: {
          query: {
            branch_id: branchId,
            table_id: tableId,
            token: token,
          },
        },
      })
      if (error) throw error
      return data
    },
    enabled: !!branchId && !!tableId && !!token,
    retry: 1,
  })
}

export function useOpenTableSession() {
  return useMutation({
    mutationFn: async ({
      branchId,
      tableId,
      token,
      guestCount = 2,
    }: {
      branchId: string
      tableId: string
      token: string
      guestCount?: number
    }) => {
      const { data, error } = await apiFetch.POST('/api/v1/public/tables/sessions/open', {
        params: {
          query: {
            branch_id: branchId,
            table_id: tableId,
            token: token,
          },
        },
        body: { guest_count: guestCount },
      })
      if (error) throw error
      return data
    },
  })
}

export function useGuestCatalog(businessId: string | null) {
  return useQuery({
    queryKey: ['guest', 'catalog', businessId],
    queryFn: async () => {
      if (!businessId) return { categories: [], items: [] }

      const [catRes, itemRes] = await Promise.all([
        apiFetch.GET('/api/v1/businesses/{business_id}/categories', {
          params: { path: { business_id: businessId } },
        }),
        apiFetch.GET('/api/v1/businesses/{business_id}/items', {
          params: { path: { business_id: businessId } },
        }),
      ])

      const rawItems = (itemRes.data as any)?.items || (Array.isArray(itemRes.data) ? itemRes.data : [])
      return {
        categories: catRes.data || [],
        items: rawItems,
      }
    },
    enabled: !!businessId,
  })
}

export function useGuestSessionOrders(
  branchId: string | null,
  tableId: string | null,
  token: string | null
) {
  return useQuery({
    queryKey: ['guest', 'session-orders', branchId, tableId, token],
    queryFn: async () => {
      if (!branchId || !tableId || !token) return null
      const { data, error } = await apiFetch.GET(
        '/api/v1/public/tables/sessions/orders',
        {
          params: {
            query: {
              branch_id: branchId,
              table_id: tableId,
              token: token,
            },
          },
        }
      )
      if (error) throw error
      return data || null
    },
    enabled: !!branchId && !!tableId && !!token,
    refetchInterval: 5000,
  })
}

export function useCreateGuestOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      branchId,
      tableId,
      token,
      payload,
    }: {
      branchId: string
      tableId: string
      token: string
      payload: GuestOrderPlacementRequest
    }) => {
      const { data, error } = await apiFetch.POST('/api/v1/public/tables/orders', {
        params: {
          query: {
            branch_id: branchId,
            table_id: tableId,
            token: token,
          },
        },
        body: payload,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['guest', 'session-orders', vars.branchId, vars.tableId, vars.token],
      })
    },
  })
}
