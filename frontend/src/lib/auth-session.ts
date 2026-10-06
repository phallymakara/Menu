/**
 * Session lifecycle shared by the API client and the UI: single-flight access token
 * refresh, logout, and local session cleanup.
 *
 * The backend rotates refresh tokens: each one is single use, and presenting a used
 * token again revokes the whole session. Refreshes must therefore never run in
 * parallel, within a tab or across tabs.
 */
import createClient from 'openapi-fetch'
import type { paths } from '@/types/api'
import { queryClient } from '@/lib/query-client'
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, useAuthStore } from '@/stores/useAuthStore'

/** A client without the auth middleware, so refresh and logout calls never recurse. */
const sessionClient = createClient<paths>({
  baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  // Resolve fetch per call so tests can stub it after this module loads.
  fetch: (request) => globalThis.fetch(request),
})

const REFRESH_LOCK_NAME = 'emenu-token-refresh'

/**
 * Outcome of a refresh attempt:
 * - `refreshed`: a usable access token, freshly issued or already stored by another
 *   request or tab.
 * - `rejected`: the session is over (refresh token missing, expired, or revoked), so
 *   the user must sign in again.
 * - `unavailable`: the refresh could not complete (network or server error), so the
 *   session is kept and the original error is returned.
 */
export type RefreshResult =
  | { status: 'refreshed'; accessToken: string }
  | { status: 'rejected' }
  | { status: 'unavailable' }

let refreshInFlight: Promise<RefreshResult> | null = null

/** A newer access token than `staleToken`, if another request or tab already stored one. */
function newerStoredToken(staleToken: string): string | null {
  const stored = localStorage.getItem(ACCESS_TOKEN_KEY)
  return stored && stored !== staleToken ? stored : null
}

/** Run `task` while holding a cross-tab lock when the browser supports the Web Locks API. */
function withRefreshLock(task: () => Promise<RefreshResult>): Promise<RefreshResult> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return task()
  return locks.request(REFRESH_LOCK_NAME, task) as Promise<RefreshResult>
}

async function performRefresh(staleToken: string): Promise<RefreshResult> {
  // Another tab may have refreshed while this one waited for the lock.
  const newer = newerStoredToken(staleToken)
  if (newer) return { status: 'refreshed', accessToken: newer }

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return { status: 'rejected' }

  try {
    const { data, response } = await sessionClient.POST('/api/v1/auth/refresh', {
      body: { refresh_token: refreshToken },
    })
    if (data) {
      useAuthStore.getState().setTokens(data.access_token, data.refresh_token)
      return { status: 'refreshed', accessToken: data.access_token }
    }
    const definitive = response.status >= 400 && response.status < 500 && response.status !== 429
    return definitive ? { status: 'rejected' } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/**
 * Get a usable access token after a request made with `staleToken` was rejected.
 *
 * Concurrent callers share a single refresh request. If the stored token has already
 * changed (another request or tab refreshed it), that token is returned without
 * calling the server.
 */
export function refreshAccessToken(staleToken: string): Promise<RefreshResult> {
  const newer = newerStoredToken(staleToken)
  if (newer) return Promise.resolve({ status: 'refreshed', accessToken: newer })

  if (!refreshInFlight) {
    refreshInFlight = withRefreshLock(() => performRefresh(staleToken)).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Drop cached server data, reset auth state, and remove tokens and tenant keys. */
export function clearSession(): void {
  queryClient.clear()
  useAuthStore.getState().logout()
}

/** Revoke the session on the server (best effort), then clear all local session state. */
export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (refreshToken) {
    try {
      await sessionClient.POST('/api/v1/auth/logout', {
        body: { refresh_token: refreshToken },
      })
    } catch {
      // Offline or server error: the refresh token still expires on its own.
    }
  }
  clearSession()
}
