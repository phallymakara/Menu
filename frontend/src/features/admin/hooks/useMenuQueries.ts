import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { components } from '@/types/api'

export type CategoryResponse = components['schemas']['CategoryResponse']
export type MenuItemResponse = components['schemas']['MenuItemResponse']
export type MenuItemCreate = components['schemas']['MenuItemCreate']
export type MenuItemUpdate = components['schemas']['MenuItemUpdate']
export type CategoryCreate = components['schemas']['CategoryCreate']
export type CategoryUpdate = components['schemas']['CategoryUpdate']

export function useCategories(businessId: string | null) {
  return useQuery({
    queryKey: ['categories', businessId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET('/api/v1/businesses/{business_id}/categories', {
        params: { path: { business_id: businessId } },
      })
      if (error) throw error
      return data || []
    },
    enabled: !!businessId,
  })
}

export function useMenuItems(businessId: string | null) {
  return useQuery({
    queryKey: ['menu-items', businessId],
    queryFn: async () => {
      if (!businessId) return []
      const { data, error } = await apiFetch.GET('/api/v1/businesses/{business_id}/items', {
        params: { path: { business_id: businessId } },
      })
      if (error) throw error
      return (data as any)?.items || (Array.isArray(data) ? data : [])
    },
    enabled: !!businessId,
  })
}

export function useCreateCategory(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CategoryCreate) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.POST('/api/v1/businesses/{business_id}/categories', {
        params: { path: { business_id: businessId } },
        body: payload,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
    },
  })
}

export function useUpdateCategory(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, payload }: { categoryId: string; payload: CategoryUpdate }) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.PATCH(
        '/api/v1/businesses/{business_id}/categories/{category_id}',
        {
          params: { path: { business_id: businessId, category_id: categoryId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
    },
  })
}

export function useDeleteCategory(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.DELETE(
        '/api/v1/businesses/{business_id}/categories/{category_id}',
        {
          params: { path: { business_id: businessId, category_id: categoryId } },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
    },
  })
}

export function useCreateMenuItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: MenuItemCreate) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.POST('/api/v1/businesses/{business_id}/items', {
        params: { path: { business_id: businessId } },
        body: payload,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

export function useUpdateMenuItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: MenuItemUpdate }) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.PATCH(
        '/api/v1/businesses/{business_id}/items/{item_id}',
        {
          params: { path: { business_id: businessId, item_id: itemId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

export function useDeleteMenuItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.DELETE(
        '/api/v1/businesses/{business_id}/items/{item_id}',
        {
          params: { path: { business_id: businessId, item_id: itemId } },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

export function useItemModifierGroups(businessId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: ['modifier-groups', businessId, itemId],
    queryFn: async () => {
      if (!businessId || !itemId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/items/{item_id}/modifier-groups',
        {
          params: { path: { business_id: businessId, item_id: itemId } },
        }
      )
      if (error) throw error
      return (data as any) || []
    },
    enabled: !!businessId && !!itemId,
  })
}

export function useAssignItemModifierGroups(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      itemId,
      modifierGroupIds,
    }: {
      itemId: string
      modifierGroupIds: string[]
    }) => {
      if (!businessId) throw new Error('Business ID is required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/items/{item_id}/modifier-groups',
        {
          params: { path: { business_id: businessId, item_id: itemId } },
          body: { group_ids: modifierGroupIds },
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups', businessId, vars.itemId] })
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

