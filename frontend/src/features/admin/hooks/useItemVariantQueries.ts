import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type ItemVariantResponse = components['schemas']['ItemVariantResponse']
export type ItemVariantCreate = components['schemas']['ItemVariantCreate']
export type ItemVariantBatchCreate = components['schemas']['ItemVariantBatchCreate']
export type ItemVariantUpdate = components['schemas']['ItemVariantUpdate']

function requireBusinessId(businessId: string | null): string {
  if (!businessId) throw new Error('Business ID is required')
  return businessId
}

function requireItemId(itemId: string | null): string {
  if (!itemId) throw new Error('Item ID is required')
  return itemId
}

/** List all variants/sizes for a menu item. */
export function useItemVariants(
  businessId: string | null,
  itemId: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['item-variants', businessId, itemId],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/items/{item_id}/variants', {
          params: {
            path: {
              business_id: requireBusinessId(businessId),
              item_id: requireItemId(itemId),
            },
          },
        })
      ),
    enabled: (options?.enabled ?? true) && !!businessId && !!itemId,
  })
}

/** Retrieve a single variant by ID. */
export function useItemVariant(
  businessId: string | null,
  itemId: string | null,
  variantId: string | null
) {
  return useQuery({
    queryKey: ['item-variant', businessId, itemId, variantId],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/items/{item_id}/variants/{variant_id}', {
          params: {
            path: {
              business_id: requireBusinessId(businessId),
              item_id: requireItemId(itemId),
              variant_id: variantId ?? '',
            },
          },
        })
      ),
    enabled: !!businessId && !!itemId && !!variantId,
  })
}

/** Create a single variant for a menu item. */
export function useCreateItemVariant(businessId: string | null, itemId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ItemVariantCreate) =>
      unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/items/{item_id}/variants', {
          params: {
            path: {
              business_id: requireBusinessId(businessId),
              item_id: requireItemId(itemId),
            },
          },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-variants', businessId, itemId] })
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

/** Batch create multiple variants in one request (e.g. Standard Sizes). */
export function useBatchCreateItemVariants(businessId: string | null, itemId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ItemVariantBatchCreate) =>
      unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/items/{item_id}/variants/batch', {
          params: {
            path: {
              business_id: requireBusinessId(businessId),
              item_id: requireItemId(itemId),
            },
          },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-variants', businessId, itemId] })
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

/** Partially update a variant (price adjustment, default, active, display order). */
export function useUpdateItemVariant(businessId: string | null, itemId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      variantId,
      payload,
    }: {
      variantId: string
      payload: ItemVariantUpdate
    }) =>
      unwrap(
        await apiFetch.PATCH(
          '/api/v1/businesses/{business_id}/items/{item_id}/variants/{variant_id}',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                item_id: requireItemId(itemId),
                variant_id: variantId,
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-variants', businessId, itemId] })
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}

/** Delete an item variant. */
export function useDeleteItemVariant(businessId: string | null, itemId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (variantId: string) =>
      unwrap(
        await apiFetch.DELETE(
          '/api/v1/businesses/{business_id}/items/{item_id}/variants/{variant_id}',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                item_id: requireItemId(itemId),
                variant_id: variantId,
              },
            },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-variants', businessId, itemId] })
      queryClient.invalidateQueries({ queryKey: ['menu-items', businessId] })
    },
  })
}
