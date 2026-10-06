import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api-client'
import { logout } from './auth-session'
import { queryClient } from './query-client'
import { useAuthStore } from '@/stores/useAuthStore'

const OLD_ACCESS = 'old.access.token'
const NEW_ACCESS = 'new.access.token'
const OLD_REFRESH = 'refresh-token-1'
const NEW_REFRESH = 'refresh-token-2'
const BRANCH_ID = '22222222-2222-4222-8222-222222222222'

interface SeenRequest {
  path: string
  authorization: string | null
  body: string
}

interface BackendOptions {
  /** Status the refresh endpoint answers with; 200 issues NEW_ACCESS and NEW_REFRESH. */
  refreshStatus?: number
  /** Called just before an API request is rejected with 401. */
  onUnauthorized?: () => void
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Fake backend: only NEW_ACCESS is accepted, and the refresh endpoint rotates OLD_REFRESH. */
function stubBackend({ refreshStatus = 200, onUnauthorized }: BackendOptions = {}) {
  const state = { refreshCalls: 0, requests: [] as SeenRequest[] }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      const { pathname } = new URL(request.url)
      const body = request.method === 'GET' ? '' : await request.text()

      if (pathname === '/api/v1/auth/refresh') {
        state.refreshCalls += 1
        // Stay in flight long enough for the other 401s to arrive and wait on it.
        await new Promise((resolve) => setTimeout(resolve, 20))
        if (refreshStatus !== 200) return json({ detail: 'Refresh failed' }, refreshStatus)
        if (JSON.parse(body).refresh_token !== OLD_REFRESH) {
          return json({ detail: 'Invalid or expired refresh token.' }, 401)
        }
        return json({
          access_token: NEW_ACCESS,
          refresh_token: NEW_REFRESH,
          token_type: 'bearer',
          expires_in: 3600,
        })
      }

      const authorization = request.headers.get('Authorization')
      state.requests.push({ path: pathname, authorization, body })
      if (authorization === `Bearer ${NEW_ACCESS}`) return json({ ok: true })
      onUnauthorized?.()
      return json({ detail: 'Could not validate authentication credentials.' }, 401)
    })
  )

  return state
}

beforeEach(() => {
  useAuthStore.getState().setTokens(OLD_ACCESS, OLD_REFRESH)
})

afterEach(() => {
  vi.unstubAllGlobals()
  queryClient.clear()
  window.history.pushState({}, '', '/')
})

describe('apiFetch auth middleware', () => {
  it('refreshes once for concurrent 401s and retries every request', async () => {
    const backend = stubBackend()

    const results = await Promise.all([
      apiFetch.GET('/api/v1/auth/me'),
      apiFetch.GET('/api/v1/auth/my-branches'),
      apiFetch.GET('/api/v1/auth/me'),
    ])

    expect(backend.refreshCalls).toBe(1)
    expect(results.map((result) => result.response.status)).toEqual([200, 200, 200])
    const retries = backend.requests.filter((r) => r.authorization === `Bearer ${NEW_ACCESS}`)
    expect(retries).toHaveLength(3)
    expect(localStorage.getItem('emenu_access_token')).toBe(NEW_ACCESS)
    expect(localStorage.getItem('emenu_refresh_token')).toBe(NEW_REFRESH)
    expect(useAuthStore.getState().token).toBe(NEW_ACCESS)
  })

  it('replays the original request body after refreshing', async () => {
    const backend = stubBackend()

    const { response } = await apiFetch.POST('/api/v1/auth/switch-branch', {
      body: { branch_id: BRANCH_ID },
    })

    expect(response.status).toBe(200)
    const attempts = backend.requests.filter((r) => r.path === '/api/v1/auth/switch-branch')
    expect(attempts).toHaveLength(2)
    expect(attempts[1].authorization).toBe(`Bearer ${NEW_ACCESS}`)
    expect(JSON.parse(attempts[1].body)).toEqual({ branch_id: BRANCH_ID })
  })

  it('signs out once when the refresh token is rejected', async () => {
    const backend = stubBackend({ refreshStatus: 401 })
    localStorage.setItem('emenu_business_id', 'business-1')
    localStorage.setItem('emenu_theme', 'dark')
    queryClient.setQueryData(['staff'], ['cached'])

    const results = await Promise.all([
      apiFetch.GET('/api/v1/auth/me'),
      apiFetch.GET('/api/v1/auth/me'),
    ])

    expect(backend.refreshCalls).toBe(1)
    expect(results.map((result) => result.response.status)).toEqual([401, 401])
    expect(localStorage.getItem('emenu_access_token')).toBeNull()
    expect(localStorage.getItem('emenu_refresh_token')).toBeNull()
    expect(localStorage.getItem('emenu_business_id')).toBeNull()
    expect(localStorage.getItem('emenu_theme')).toBe('dark')
    expect(queryClient.getQueryData(['staff'])).toBeUndefined()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('keeps the session when the refresh endpoint is unavailable', async () => {
    stubBackend({ refreshStatus: 503 })

    const { response } = await apiFetch.GET('/api/v1/auth/me')

    expect(response.status).toBe(401)
    expect(localStorage.getItem('emenu_access_token')).toBe(OLD_ACCESS)
    expect(localStorage.getItem('emenu_refresh_token')).toBe(OLD_REFRESH)
  })

  it('reuses a token that another tab already refreshed', async () => {
    const backend = stubBackend({
      onUnauthorized: () => localStorage.setItem('emenu_access_token', NEW_ACCESS),
    })

    const { response } = await apiFetch.GET('/api/v1/auth/me')

    expect(response.status).toBe(200)
    expect(backend.refreshCalls).toBe(0)
  })

  it('does not refresh when a login attempt is rejected', async () => {
    const backend = stubBackend()

    const { response } = await apiFetch.POST('/api/v1/auth/login', {
      body: { identifier: 'owner@example.com', password: 'wrong-password' },
    })

    expect(response.status).toBe(401)
    expect(backend.refreshCalls).toBe(0)
    expect(localStorage.getItem('emenu_refresh_token')).toBe(OLD_REFRESH)
  })

  it('leaves guest QR pages alone', async () => {
    window.history.pushState({}, '', '/t/table-token')
    const backend = stubBackend()

    const { response } = await apiFetch.GET('/api/v1/auth/me')

    expect(response.status).toBe(401)
    expect(backend.refreshCalls).toBe(0)
    expect(localStorage.getItem('emenu_access_token')).toBe(OLD_ACCESS)
  })
})

describe('logout', () => {
  it('revokes the session on the server, then clears cache, auth state, and tenant keys', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        calls.push(`${new URL(request.url).pathname} ${await request.text()}`)
        return new Response(null, { status: 204 })
      })
    )
    localStorage.setItem('emenu_tenant_id', 'org-1')
    localStorage.setItem('emenu_branch_id', 'branch-1')
    localStorage.setItem('emenu_business_name_en', 'Bistro')
    localStorage.setItem('emenu_language', 'km')
    queryClient.setQueryData(['staff'], ['cached'])

    await logout()

    expect(calls).toEqual([`/api/v1/auth/logout {"refresh_token":"${OLD_REFRESH}"}`])
    expect(queryClient.getQueryData(['staff'])).toBeUndefined()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().refreshToken).toBeNull()
    for (const key of [
      'emenu_access_token',
      'emenu_refresh_token',
      'emenu_tenant_id',
      'emenu_branch_id',
      'emenu_business_name_en',
    ]) {
      expect(localStorage.getItem(key)).toBeNull()
    }
    expect(localStorage.getItem('emenu_language')).toBe('km')
  })

  it('still clears local state when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    await logout()

    expect(localStorage.getItem('emenu_access_token')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
