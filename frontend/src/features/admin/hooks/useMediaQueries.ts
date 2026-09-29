import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import { unwrap } from '@/lib/api-error'
import type { components } from '@/types/api'

export type MediaUploadResponse = components['schemas']['MediaUploadResponse']

/** Upload an image to the business media store and return its public URL. */
export function useUploadMedia(businessId: string | null) {
  return useMutation({
    mutationFn: async (file: File): Promise<MediaUploadResponse> => {
      if (!businessId) throw new Error('Business ID is required')
      return unwrap(
        await apiFetch.POST('/api/v1/businesses/{business_id}/media/upload', {
          params: { path: { business_id: businessId } },
          // The generated schema types binary fields as string; the runtime value is the File.
          body: { file: file as unknown as string },
          bodySerializer: (body) => {
            const formData = new FormData()
            formData.append('file', body.file as unknown as Blob)
            return formData
          },
        })
      )
    },
  })
}
