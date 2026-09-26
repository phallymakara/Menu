import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type KitchenStationResponse = components['schemas']['KitchenStationResponse']
export type KDSTicketResponse = components['schemas']['KDSTicketResponse']

export function useKitchenStations(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['kds', 'stations', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kitchen-stations',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: !!businessId && !!branchId,
  })
}

export function useKDSTickets(
  businessId: string | null,
  branchId: string | null,
  stationId: string | null
) {
  const isExpo = stationId === 'expo' || !stationId

  return useQuery({
    queryKey: ['kds', 'tickets', businessId, branchId, stationId],
    queryFn: async () => {
      if (!businessId || !branchId) return []

      if (isExpo) {
        const { data, error } = await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/expo/tickets',
          {
            params: { path: { business_id: businessId, branch_id: branchId } },
          }
        )
        if (error) throw error
        return data || []
      } else {
        const { data, error } = await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/stations/{station_id}/tickets',
          {
            params: {
              path: {
                business_id: businessId,
                branch_id: branchId,
                station_id: stationId,
              },
            },
          }
        )
        if (error) throw error
        return data || []
      }
    },
    enabled: !!businessId && !!branchId,
    refetchInterval: 4000, // Real-time KDS polling every 4 seconds
    refetchIntervalInBackground: false,
  })
}

export function useBumpItemStatus(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderItemId,
      status = 'ready_to_serve',
    }: {
      orderItemId: string
      status?: components['schemas']['OrderItemStatus']
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/items/{order_item_id}/bump',
        {
          params: {
            path: {
              business_id: businessId,
              branch_id: branchId,
              order_item_id: orderItemId,
            },
          },
          body: { target_status: status },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', businessId, branchId] })
    },
  })
}

export function useBumpStationTicket(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      stationId,
      status = 'ready_to_serve',
    }: {
      orderId: string
      stationId: string
      status?: components['schemas']['OrderItemStatus']
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/orders/{order_id}/station/{station_id}/bump',
        {
          params: {
            path: {
              business_id: businessId,
              branch_id: branchId,
              order_id: orderId,
              station_id: stationId,
            },
          },
          body: { target_status: status },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', businessId, branchId] })
    },
  })
}
