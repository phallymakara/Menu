import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import { clearSession, refreshAccessToken } from '@/lib/auth-session'
import { ACCESS_TOKEN_KEY } from '@/stores/useAuthStore'

export const apiFetch = createClient<paths>({
  // Same-origin requests (proxied by Vite in dev); an absolute base also works outside the browser.
  baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  // Resolve fetch per call so tests can stub it after this module loads.
  fetch: (request) => globalThis.fetch(request),
})

/** Guest QR pages call public endpoints; a 401 there never concerns a staff session. */
const GUEST_PATH_PREFIXES = ['/t/', '/order/']
const STAFF_PATH_PREFIXES = ['/admin', '/pos', '/kds', '/onboarding']
/** Endpoints whose 401 means wrong credentials or tokens, not an expired access token. */
const AUTH_ENDPOINT_PREFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/password-reset/',
]

/**
 * Untouched copies of requests sent with the stored access token, so each can be
 * replayed once after a refresh (the original body is consumed when it is sent).
 */
const replayableRequests = new WeakMap<Request, Request>()

function currentPath(): string {
  return typeof window !== 'undefined' ? window.location.pathname : ''
}

function isAuthEndpoint(request: Request): boolean {
  const { pathname } = new URL(request.url)
  return AUTH_ENDPOINT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization')
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

/** Clear the local session and send staff pages back to the sign-in screen. */
function endSession(): void {
  clearSession()
  if (typeof window === 'undefined') return
  const path = currentPath()
  if (
    STAFF_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
    !window.location.search.includes('auth=login')
  ) {
    window.location.href = '/?auth=login'
  }
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const tenantId =
      localStorage.getItem('emenu_tenant_id') ||
      localStorage.getItem('emenu_organization_id')
    if (tenantId) {
      request.headers.set('X-Tenant-ID', tenantId)
      request.headers.set('X-Organization-Id', tenantId)
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    // An explicit Authorization header (e.g. right after login) wins over the stored token.
    if (token && !request.headers.has('Authorization')) {
      if (token.startsWith('token_') || token.split('.').length !== 3) {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
      } else {
        request.headers.set('Authorization', `Bearer ${token}`)
        replayableRequests.set(request, request.clone())
      }
    }

    return request
  },

  async onResponse({ request, response }) {
    const replay = replayableRequests.get(request)
    replayableRequests.delete(request)

    if (response.status !== 401 || isAuthEndpoint(request)) return response
    if (GUEST_PATH_PREFIXES.some((prefix) => currentPath().startsWith(prefix))) {
      return response
    }

    const staleToken = replay ? bearerToken(replay) : null
    if (!replay || !staleToken) {
      // Sent without the stored session: there is nothing to refresh. A caller that set
      // its own Authorization header handles the 401 itself.
      if (!request.headers.has('Authorization')) endSession()
      return response
    }

    // Try one refresh (shared with any concurrent 401s), then replay the request once.
    const result = await refreshAccessToken(staleToken)
    if (result.status === 'refreshed') {
      replay.headers.set('Authorization', `Bearer ${result.accessToken}`)
      const retried = await globalThis.fetch(replay)
      if (retried.status === 401) endSession()
      return retried
    }

    if (result.status === 'rejected') endSession()
    return response
  },
}

apiFetch.use(authMiddleware)
