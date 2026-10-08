import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'
import type { ModifierOption } from '../types/admin.types'

export type CategoryResponse = components['schemas']['CategoryResponse']
export type MenuItemResponse = components['schemas']['MenuItemResponse']
export type MenuItemCreate = components['schemas']['MenuItemCreate']
export type MenuItemUpdate = components['schemas']['MenuItemUpdate']
export type CategoryCreate = components['schemas']['CategoryCreate']
export type CategoryUpdate = components['schemas']['CategoryUpdate']
export type CategoryReorderRequest = components['schemas']['CategoryReorderRequest']
export type ModifierGroupDetailResponse = components['schemas']['ModifierGroupDetailResponse']
export type ModifierOptionResponse = components['schemas']['ModifierOptionResponse']
export type ModifierOptionUpdate = components['schemas']['ModifierOptionUpdate']

/** Largest page the items endpoint allows. Menus beyond this need real pagination. */
const MENU_ITEMS_PAGE_SIZE = 100

function requireBusinessId(businessId: string | null): string {
  if (!businessId) throw new Error('Business ID is required')
  return businessId
}

export function useCategories(businessId: string | null) {
  return useQuery({
    queryKey: ['categories', businessId],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/categories', {
          params: { path: { business_id: requireBusinessId(businessId) } },
        })
      ),
    enabled: !!businessId,
  })
}

export function useMenuItems(businessId: string | null) {
  return useQuery({
    queryKey: ['menu-items', businessId],
    queryFn: async () => {
      const page = unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/items', {
          params: {
            path: { business_id: requireBusinessId(businessId) },
            query: { page_size: MENU_ITEMS_PAGE_SIZE },
          },
        })
      )
      return page?.items ?? []
    },
    enabled: !!businessId,
  })
}

export function useCreateCategory(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CategoryCreate) =>
      unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/categories', {
          params: { path: { business_id: requireBusinessId(businessId) } },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu', businessId] })
    },
  })
}

export function useUpdateCategory(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, payload }: { categoryId: string; payload: CategoryUpdate }) =>
      unwrap(
        await apiFetch.PATCH('/api/v1/businesses/{business_id}/categories/{category_id}', {
          params: {
            path: { business_id: requireBusinessId(businessId), category_id: categoryId },
          },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu', businessId] })
    },
  })
}

export function useDeleteCategory(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) =>
      unwrap(
        await apiFetch.DELETE('/api/v1/businesses/{business_id}/categories/{category_id}', {
          params: {
            path: { business_id: requireBusinessId(businessId), category_id: categoryId },
          },
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu', businessId] })
    },
  })
}

export function useCreateMenuItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: MenuItemCreate) =>
      unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/items', {
          params: { path: { business_id: requireBusinessId(businessId) } },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu', businessId] })
    },
  })
}

export function useUpdateMenuItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: MenuItemUpdate }) =>
      unwrap(
        await apiFetch.PATCH('/api/v1/businesses/{business_id}/items/{item_id}', {
          params: { path: { business_id: requireBusinessId(businessId), item_id: itemId } },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu', businessId] })
    },
  })
}

export function useDeleteMenuItem(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) =>
      unwrap(
        await apiFetch.DELETE('/api/v1/businesses/{business_id}/items/{item_id}', {
          params: { path: { business_id: requireBusinessId(businessId), item_id: itemId } },
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
      queryClient.invalidateQueries({ queryKey: ['branch-published-menu', businessId] })
    },
  })
}

export function itemModifierGroupsQuery(businessId: string, itemId: string) {
  return queryOptions({
    queryKey: ['modifier-groups', businessId, itemId],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/items/{item_id}/modifier-groups', {
          params: { path: { business_id: businessId, item_id: itemId } },
        })
      ),
  })
}

export function useItemModifierGroups(businessId: string | null, itemId: string | null) {
  return useQuery({
    ...itemModifierGroupsQuery(businessId ?? '', itemId ?? ''),
    enabled: !!businessId && !!itemId,
  })
}

export function useAssignItemModifierGroups(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, modifierGroupIds }: { itemId: string; modifierGroupIds: string[] }) =>
      unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/items/{item_id}/modifier-groups', {
          params: { path: { business_id: requireBusinessId(businessId), item_id: itemId } },
          body: { group_ids: modifierGroupIds },
        })
      ),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups', businessId, vars.itemId] })
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

/**
 * Persist options added in the item form. New options (local `opt_` IDs) are saved into
 * the item's first modifier group, which is created and attached when the item has none.
 */
export function useSaveItemOptions(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, options }: { itemId: string; options: ModifierOption[] }) => {
      const business_id = requireBusinessId(businessId)
      const newOptions = options.filter((opt) => opt.id.startsWith('opt_'))
      if (newOptions.length === 0) return

      const existingGroups = await queryClient.fetchQuery(
        itemModifierGroupsQuery(business_id, itemId)
      )
      let groupId = existingGroups[0]?.id
      if (!groupId) {
        const group = unwrap(
          await apiFetch.POST('/api/v1/businesses/{business_id}/modifier-groups', {
            params: { path: { business_id } },
            body: {
              name_en: 'Options',
              name_km: 'ជម្រើសបន្ថែម',
              min_selections: 0,
              max_selections: 20,
              display_order: 0,
              is_active: true,
            },
          })
        )
        groupId = group.id
        unwrap(
          await apiFetch.POST('/api/v1/businesses/{business_id}/items/{item_id}/modifier-groups', {
            params: { path: { business_id, item_id: itemId } },
            body: { group_ids: [groupId] },
          })
        )
      }

      for (const opt of newOptions) {
        unwrap(
          await apiFetch.POST(
            '/api/v1/businesses/{business_id}/modifier-groups/{group_id}/options',
            {
              params: { path: { business_id, group_id: groupId } },
              body: {
                name_en: opt.name_en,
                name_km: opt.name_km || opt.name_en,
                price: opt.price_usd,
                is_default: opt.is_default || false,
                is_active: true,
              },
            }
          )
        )
      }
    },
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups', businessId, itemId] })
    },
  })
}

/** Batch update display order for menu categories. */
export function useReorderCategories(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CategoryReorderRequest) =>
      unwrap(
        await apiFetch.PUT('/api/v1/businesses/{business_id}/categories/reorder', {
          params: { path: { business_id: requireBusinessId(businessId) } },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', businessId] })
    },
  })
}

/** Partially update a modifier option (price, name, active). */
export function useUpdateModifierOption(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      groupId,
      optionId,
      payload,
    }: {
      groupId: string
      optionId: string
      payload: ModifierOptionUpdate
    }) =>
      unwrap(
        await apiFetch.PATCH(
          '/api/v1/businesses/{business_id}/modifier-groups/{group_id}/options/{option_id}',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                group_id: groupId,
                option_id: optionId,
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups', businessId] })
    },
  })
}

/** Delete a modifier option from a modifier group. */
export function useDeleteModifierOption(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      groupId,
      optionId,
    }: {
      groupId: string
      optionId: string
    }) =>
      unwrap(
        await apiFetch.DELETE(
          '/api/v1/businesses/{business_id}/modifier-groups/{group_id}/options/{option_id}',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                group_id: groupId,
                option_id: optionId,
              },
            },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifier-groups', businessId] })
    },
  })
}
