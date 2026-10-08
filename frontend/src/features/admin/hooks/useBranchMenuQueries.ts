import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type BranchMenuCatalogResponse = components['schemas']['BranchMenuCatalogResponse']
export type BranchCategoryMenuResponse = components['schemas']['BranchCategoryMenuResponse']
export type BranchMenuItemDisplayResponse = components['schemas']['BranchMenuItemDisplayResponse']
export type BranchItemOverrideCreate = components['schemas']['BranchItemOverrideCreate']
export type BranchItemOverrideResponse = components['schemas']['BranchItemOverrideResponse']
export type BulkBranchItemOverrideRequest = components['schemas']['BulkBranchItemOverrideRequest']
export type BranchCategoryAssignmentRequest = components['schemas']['BranchCategoryAssignmentRequest']
export type BranchLocalItemCreate = components['schemas']['BranchLocalItemCreate']
export type ResetBranchOverridesRequest = components['schemas']['ResetBranchOverridesRequest']
export type CatalogComparisonResponse = components['schemas']['CatalogComparisonResponse']
export type CatalogComparisonItem = components['schemas']['CatalogComparisonItem']
export type CatalogSyncResult = components['schemas']['CatalogSyncResult']
export type MasterCatalogSyncRequest = components['schemas']['MasterCatalogSyncRequest']

function requireBusinessId(businessId: string | null): string {
  if (!businessId) throw new Error('Business ID is required')
  return businessId
}

function requireBranchId(branchId: string | null): string {
  if (!branchId) throw new Error('Branch ID is required')
  return branchId
}

/**
 * 1. Retrieve live resolved menu catalog for a specific branch (master items + branch overrides + local items).
 */
export function useBranchPublishedMenu(
  businessId: string | null,
  branchId: string | null,
  includeHidden: boolean = false
) {
  return useQuery({
    queryKey: ['branch-published-menu', businessId, branchId, includeHidden],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/published',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
              },
              query: { include_hidden: includeHidden },
            },
          }
        )
      ),
    enabled: !!businessId && !!branchId,
  })
}

/**
 * 2. Set or update price and availability overrides for a single branch menu item.
 */
export function useSetBranchItemOverride(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      itemId,
      payload,
    }: {
      itemId: string
      payload: BranchItemOverrideCreate
    }) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/overrides/{item_id}',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
                item_id: itemId,
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
    },
  })
}

/**
 * 3. Bulk update price or availability overrides across multiple items at a branch.
 */
export function useBulkSetBranchItemOverrides(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BulkBranchItemOverrideRequest) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/overrides/bulk',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
    },
  })
}

/**
 * 4. Reset a branch menu item override back to master catalog defaults.
 */
export function useDeleteBranchItemOverride(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) =>
      unwrap(
        await apiFetch.DELETE(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/overrides/{item_id}',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
                item_id: itemId,
              },
            },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
    },
  })
}

/**
 * 5. Reset branch overrides back to Central Master defaults in bulk (all or by category).
 */
export function useResetBranchOverrides(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ResetBranchOverridesRequest) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/reset-to-master',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
    },
  })
}

/**
 * 6. Selectively publish/assign categories to a branch.
 */
export function useAssignCategoriesToBranch(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BranchCategoryAssignmentRequest) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/categories',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
    },
  })
}

/**
 * 7. Create a branch-local dish or add-on (only available at this branch).
 */
export function useCreateBranchLocalItem(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BranchLocalItemCreate) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/local-items',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
              },
            },
            body: payload,
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
      queryClient.invalidateQueries({
        queryKey: ['menu-items', businessId],
      })
    },
  })
}

/**
 * 8. Promote a local branch dish to the Central Master Brand Catalog.
 */
export function usePromoteLocalItem(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) =>
      unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/menu/local-items/{item_id}/promote',
          {
            params: {
              path: {
                business_id: requireBusinessId(businessId),
                branch_id: requireBranchId(branchId),
                item_id: itemId,
              },
            },
          }
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu', businessId, branchId],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
      queryClient.invalidateQueries({
        queryKey: ['menu-items', businessId],
      })
    },
  })
}

/**
 * 9. HQ Multi-branch catalog comparison matrix (Master vs Branch prices & local add-ons).
 */
export function useCatalogComparison(businessId: string | null) {
  return useQuery({
    queryKey: ['catalog-comparison', businessId],
    queryFn: async () =>
      unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/catalog/comparison', {
          params: { path: { business_id: requireBusinessId(businessId) } },
        })
      ),
    enabled: !!businessId,
  })
}

/**
 * 10. Push master catalog updates across all or selected branches.
 */
export function useSyncMasterCatalog(businessId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: MasterCatalogSyncRequest) =>
      unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/catalog/sync-branches', {
          params: { path: { business_id: requireBusinessId(businessId) } },
          body: payload,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['branch-published-menu'],
      })
      queryClient.invalidateQueries({
        queryKey: ['catalog-comparison', businessId],
      })
      queryClient.invalidateQueries({
        queryKey: ['menu-items', businessId],
      })
    },
  })
}
