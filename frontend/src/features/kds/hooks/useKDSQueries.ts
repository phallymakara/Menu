import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type KitchenStationResponse = components['schemas']['KitchenStationResponse']
export type KitchenStationCreate = components['schemas']['KitchenStationCreate']
export type KitchenStationUpdate = components['schemas']['KitchenStationUpdate']
export type StationItemAssignRequest = components['schemas']['StationItemAssignRequest']
export type KDSTicketResponse = components['schemas']['KDSTicketResponse']
export type KDSTicketItemResponse = components['schemas']['KDSTicketItemResponse']
export type ItemRerouteRequest = components['schemas']['ItemRerouteRequest']
export type CourseFireRequest = components['schemas']['CourseFireRequest']
export type CourseStage = components['schemas']['CourseStage']
export type StationMetricsResponse = components['schemas']['StationMetricsResponse']

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

export function useCreateKitchenStation(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: KitchenStationCreate) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kitchen-stations',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'stations', businessId, branchId] })
    },
  })
}

export function useUpdateKitchenStation(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stationId,
      payload,
    }: {
      stationId: string
      payload: KitchenStationUpdate
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.PUT(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kitchen-stations/{station_id}',
        {
          params: { path: { business_id: businessId, branch_id: branchId, station_id: stationId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'stations', businessId, branchId] })
    },
  })
}

export function useDeleteKitchenStation(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (stationId: string) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { error } = await apiFetch.DELETE(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kitchen-stations/{station_id}',
        {
          params: { path: { business_id: businessId, branch_id: branchId, station_id: stationId } },
        }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'stations', businessId, branchId] })
    },
  })
}

export function useAssignStationItems(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stationId,
      payload,
    }: {
      stationId: string
      payload: StationItemAssignRequest
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kitchen-stations/{station_id}/assignments',
        {
          params: { path: { business_id: businessId, branch_id: branchId, station_id: stationId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'stations', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', businessId, branchId] })
    },
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
    refetchInterval: process.env.NODE_ENV === 'test' ? false : 4000, // Real-time KDS polling every 4 seconds
    refetchIntervalInBackground: false,
  })
}

export function useStationRecallTickets(
  businessId: string | null,
  branchId: string | null,
  stationId: string | null
) {
  const isExpo = stationId === 'expo' || !stationId

  return useQuery({
    queryKey: ['kds', 'recall', businessId, branchId, stationId],
    queryFn: async () => {
      if (!businessId || !branchId || isExpo || !stationId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/stations/{station_id}/recall',
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
    },
    enabled: !!businessId && !!branchId && !isExpo && !!stationId,
  })
}

export function useStationMetrics(
  businessId: string | null,
  branchId: string | null,
  stationId: string | null
) {
  const isExpo = stationId === 'expo' || !stationId

  return useQuery({
    queryKey: ['kds', 'metrics', businessId, branchId, stationId],
    queryFn: async () => {
      if (!businessId || !branchId || isExpo || !stationId) return null
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/stations/{station_id}/metrics',
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
      return data ?? null
    },
    enabled: !!businessId && !!branchId && !isExpo && !!stationId,
    refetchInterval: process.env.NODE_ENV === 'test' ? false : 10000,
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
      queryClient.invalidateQueries({ queryKey: ['kds', 'metrics', businessId, branchId] })
    },
  })
}

export function useUndoItemStatus(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderItemId: string) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/items/{order_item_id}/undo',
        {
          params: {
            path: {
              business_id: businessId,
              branch_id: branchId,
              order_item_id: orderItemId,
            },
          },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['kds', 'recall', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['kds', 'metrics', businessId, branchId] })
    },
  })
}

export function useRerouteItem(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderItemId,
      targetStationId,
    }: {
      orderItemId: string
      targetStationId: string
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/items/{order_item_id}/reroute',
        {
          params: {
            path: {
              business_id: businessId,
              branch_id: branchId,
              order_item_id: orderItemId,
            },
          },
          body: { target_kitchen_station_id: targetStationId },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds', 'tickets', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['kds', 'metrics', businessId, branchId] })
    },
  })
}

export function useFireCourse(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orderId,
      courseStage,
      orderItemIds,
    }: {
      orderId: string
      courseStage?: CourseStage | null
      orderItemIds?: string[]
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/kds/orders/{order_id}/fire',
        {
          params: {
            path: {
              business_id: businessId,
              branch_id: branchId,
              order_id: orderId,
            },
          },
          body: {
            course_stage: courseStage ?? null,
            order_item_ids: orderItemIds,
          },
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
      queryClient.invalidateQueries({ queryKey: ['kds', 'metrics', businessId, branchId] })
    },
  })
}
