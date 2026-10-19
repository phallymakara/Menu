import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import { isUuid } from '@/lib/utils'
import type { components } from '@/types/api'

export type TableResponse = components['schemas']['RestaurantTableResponse']
export type TableCreate = components['schemas']['RestaurantTableCreate']
export type TableUpdate = components['schemas']['RestaurantTableUpdate']
export type DiningAreaResponse = components['schemas']['DiningAreaResponse']
export type DiningAreaCreate = components['schemas']['DiningAreaCreate']
export type DiningAreaUpdate = components['schemas']['DiningAreaUpdate']
export type DiningAreaReorderRequest = components['schemas']['DiningAreaReorderRequest']
export type BatchTableCreate = components['schemas']['RestaurantTableBatchCreate']
export type TableQrDetail = components['schemas']['TableQRDetailResponse']

/** Batch QR export as JSON (the endpoint declares no response model in OpenAPI). */
interface TableQrBatch {
  branch_id: string
  branch_name_en: string
  total_count: number
  tables: TableQrDetail[]
}

/** QR codes encode the guest ordering URL on the site the admin is using. */
function orderingBaseUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined
}

export function useDiningAreas(businessId: string | null, branchId: string | null) {
  const isValid = isUuid(businessId) && isUuid(branchId)
  return useQuery({
    queryKey: ['dining-areas', businessId, branchId],
    queryFn: async () => {
      if (!isValid) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/areas',
        {
          params: { path: { business_id: businessId!, branch_id: branchId! } },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: isValid,
    retry: false,
  })
}

export function useDiningArea(
  businessId: string | null,
  branchId: string | null,
  areaId: string | null
) {
  const isValid = isUuid(businessId) && isUuid(branchId) && isUuid(areaId)
  return useQuery({
    queryKey: ['dining-area', businessId, branchId, areaId],
    queryFn: async () => {
      if (!isValid) return null
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/areas/{area_id}',
          {
            params: {
              path: {
                business_id: businessId!,
                branch_id: branchId!,
                area_id: areaId!,
              },
            },
          }
        )
      )
    },
    enabled: isValid,
    retry: false,
  })
}

export function useCreateDiningArea(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: DiningAreaCreate) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/areas',
          {
            params: { path: { business_id: businessId, branch_id: branchId } },
            body: payload,
          }
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-areas', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useUpdateDiningArea(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ areaId, payload }: { areaId: string; payload: DiningAreaUpdate }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.PATCH(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/areas/{area_id}',
          {
            params: { path: { business_id: businessId, branch_id: branchId, area_id: areaId } },
            body: payload,
          }
        )
      )
    },
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: ['dining-areas', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['dining-area', businessId, branchId, areaId] })
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useDeleteDiningArea(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (areaId: string) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.DELETE(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/areas/{area_id}',
          {
            params: { path: { business_id: businessId, branch_id: branchId, area_id: areaId } },
          }
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-areas', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useReorderDiningAreas(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: DiningAreaReorderRequest) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.PUT(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/areas/reorder',
          {
            params: { path: { business_id: businessId, branch_id: branchId } },
            body: payload,
          }
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-areas', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useTables(businessId: string | null, branchId: string | null) {
  const isValid = isUuid(businessId) && isUuid(branchId)
  return useQuery({
    queryKey: ['tables', businessId, branchId],
    queryFn: async () => {
      if (!isValid) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables',
        {
          params: { path: { business_id: businessId!, branch_id: branchId! } },
        }
      )
      if (error) throw error
      return data || []
    },
    enabled: isValid,
    retry: false,
  })
}

export function useTablesDashboard(businessId: string | null, branchId: string | null) {
  const isValid = isUuid(businessId) && isUuid(branchId)
  return useQuery({
    queryKey: ['tables-dashboard', businessId, branchId],
    queryFn: async () => {
      if (!isValid) return null
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables-dashboard',
        {
          params: { path: { business_id: businessId!, branch_id: branchId! } },
        }
      )
      if (error) throw error
      return data
    },
    enabled: isValid,
    retry: false,
    refetchInterval: 15000, // Background poll every 15s for floor map sync
  })
}

export function useBatchCreateTables(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BatchTableCreate) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const { data, error } = await apiFetch.POST(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/batch',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
          body: payload,
        }
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['table-qr-codes', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useCreateTable(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TableCreate) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables',
          {
            params: { path: { business_id: businessId, branch_id: branchId } },
            body: payload,
          }
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['table-qr-codes', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useTableDetail(
  businessId: string | null,
  branchId: string | null,
  tableId: string | null
) {
  const isValid = isUuid(businessId) && isUuid(branchId) && isUuid(tableId)
  return useQuery({
    queryKey: ['table-detail', businessId, branchId, tableId],
    queryFn: async (): Promise<TableResponse> => {
      if (!isValid) throw new Error('Valid IDs are required')
      return unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}',
          {
            params: {
              path: {
                business_id: businessId!,
                branch_id: branchId!,
                table_id: tableId!,
              },
            },
          }
        )
      )
    },
    enabled: isValid,
  })
}

export function useUpdateTable(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tableId,
      payload,
    }: {
      tableId: string
      payload: TableUpdate
    }) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.PATCH(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}',
          {
            params: {
              path: {
                business_id: businessId,
                branch_id: branchId,
                table_id: tableId,
              },
            },
            body: payload,
          }
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['table-qr-codes', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}

export function useDeleteTable(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tableId: string) => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.DELETE(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}',
          {
            params: { path: { business_id: businessId, branch_id: branchId, table_id: tableId } },
          }
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['table-qr-codes', businessId, branchId] })
    },
  })
}

/** Download every table QR code in the branch as a single ZIP archive. */
export function useDownloadTableQrZip(businessId: string | null, branchId: string | null) {
  return useMutation({
    mutationFn: async (): Promise<Blob> => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const blob = unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/tables/qr/batch', {
          params: {
            path: { business_id: businessId, branch_id: branchId },
            // Without format=zip the endpoint answers with its JSON listing.
            query: { format: 'zip', base_url: orderingBaseUrl() },
          },
          parseAs: 'blob',
        })
      )
      return new Blob([blob], { type: 'application/zip' })
    },
  })
}

/**
 * QR codes for every table in the branch, rendered by the backend for the real
 * guest ordering URL (the same codes as the printable ZIP), keyed by table ID.
 */
export function useTableQrCodes(businessId: string | null, branchId: string | null) {
  const isValid = isUuid(businessId) && isUuid(branchId)
  return useQuery({
    queryKey: ['table-qr-codes', businessId, branchId],
    queryFn: async (): Promise<Map<string, TableQrDetail>> => {
      if (!isValid) return new Map()
      const batch = unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/tables/qr/batch', {
          params: {
            path: { business_id: businessId!, branch_id: branchId! },
            query: { format: 'json', base_url: orderingBaseUrl() },
          },
        })
      ) as TableQrBatch
      return new Map(batch.tables.map((qr) => [qr.table_id, qr]))
    },
    enabled: isValid,
    retry: false,
  })
}

/** Download or fetch a single table's QR image (PNG or SVG) as a Blob. */
export function useSingleTableQr(businessId: string | null, branchId: string | null) {
  return useMutation({
    mutationFn: async ({
      tableId,
      format = 'png',
      download = true,
    }: {
      tableId: string
      format?: 'png' | 'svg'
      download?: boolean
    }): Promise<Blob> => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      const blob = unwrap(
        await apiFetch.GET(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/qr',
          {
            params: {
              path: { business_id: businessId, branch_id: branchId, table_id: tableId },
              query: {
                format,
                download,
                base_url: orderingBaseUrl(),
              },
            },
            parseAs: 'blob',
          }
        )
      )
      return new Blob([blob], {
        type: format === 'svg' ? 'image/svg+xml' : 'image/png',
      })
    },
  })
}

/** Regenerate / rotate a table's cryptographic verification token. */
export function useRegenerateTableQr(businessId: string | null, branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tableId: string): Promise<TableQrDetail> => {
      if (!businessId || !branchId) throw new Error('Business and Branch IDs are required')
      return unwrap(
        await apiFetch.POST(
          '/api/v1/businesses/{business_id}/branches/{branch_id}/tables/{table_id}/regenerate-qr',
          {
            params: { path: { business_id: businessId, branch_id: branchId, table_id: tableId } },
            query: { base_url: orderingBaseUrl() },
          }
        )
      ) as TableQrDetail
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table-qr-codes', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables', businessId, branchId] })
      queryClient.invalidateQueries({ queryKey: ['tables-dashboard', businessId, branchId] })
    },
  })
}
