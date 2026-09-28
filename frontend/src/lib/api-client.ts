import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import { useAuthStore } from '@/stores/useAuthStore'

export const apiFetch = createClient<paths>({
  // Same-origin requests (proxied by Vite in dev); an absolute base also works outside the browser.
  baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  // Resolve fetch per call so tests can stub it after this module loads.
  fetch: (request) => globalThis.fetch(request),
})

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = localStorage.getItem('emenu_access_token')
    // An explicit Authorization header (e.g. right after login) wins over the stored token.
    if (token && !request.headers.has('Authorization')) {
      if (token.startsWith('token_') || token.split('.').length !== 3) {
        localStorage.removeItem('emenu_access_token')
      } else {
        request.headers.set('Authorization', `Bearer ${token}`)
      }
    }

    const tenantId =
      localStorage.getItem('emenu_tenant_id') ||
      localStorage.getItem('emenu_organization_id')
    if (tenantId) {
      request.headers.set('X-Tenant-ID', tenantId)
      request.headers.set('X-Organization-Id', tenantId)
    }

    return request
  },

  async onResponse({ response }) {
    if (response.status === 401) {
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      if (!path.startsWith('/t/') && !path.startsWith('/order/')) {
        // Clear auth state and storage so stale sessions stop retrying.
        useAuthStore.getState().logout()
        if (
          path.startsWith('/admin') ||
          path.startsWith('/pos') ||
          path.startsWith('/kds') ||
          path.startsWith('/onboarding')
        ) {
          if (typeof window !== 'undefined' && !window.location.search.includes('auth=login')) {
            window.location.href = '/?auth=login'
          }
        }
      }
    }
    return response
  },
}

apiFetch.use(authMiddleware)
