import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type TableResponse = components['schemas']['RestaurantTableResponse']
export type DiningAreaResponse = components['schemas']['DiningAreaResponse']
export type DiningAreaCreate = components['schemas']['DiningAreaCreate']
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
  return useQuery({
    queryKey: ['dining-areas', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/areas',
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

export function useTables(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['tables', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return []
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables',
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

export function useTablesDashboard(businessId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: ['tables-dashboard', businessId, branchId],
    queryFn: async () => {
      if (!businessId || !branchId) return null
      const { data, error } = await apiFetch.GET(
        '/api/v1/businesses/{business_id}/branches/{branch_id}/tables-dashboard',
        {
          params: { path: { business_id: businessId, branch_id: branchId } },
        }
      )
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!branchId,
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
  return useQuery({
    queryKey: ['table-qr-codes', businessId, branchId],
    queryFn: async (): Promise<Map<string, TableQrDetail>> => {
      if (!businessId || !branchId) return new Map()
      const batch = unwrap(
        await apiFetch.GET('/api/v1/businesses/{business_id}/branches/{branch_id}/tables/qr/batch', {
          params: {
            path: { business_id: businessId, branch_id: branchId },
            query: { format: 'json', base_url: orderingBaseUrl() },
          },
        })
      ) as TableQrBatch
      return new Map(batch.tables.map((qr) => [qr.table_id, qr]))
    },
    enabled: !!businessId && !!branchId,
  })
}
