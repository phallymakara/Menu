/**
 * Error helpers for the typed openapi-fetch client.
 *
 * openapi-fetch resolves (never rejects) with `{ data, error, response }`.
 * `unwrap` turns a failed result into a thrown `ApiError` that keeps the HTTP
 * status, so callers can branch on 401/409 and show FastAPI `detail` messages.
 */

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, body: unknown) {
    const detail = isRecord(body) && 'detail' in body ? body.detail : body
    super(detailToMessage(detail) ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Return `data` from an openapi-fetch result, or throw an `ApiError`. */
export function unwrap<T>(result: FetchResult<T>): T {
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(result.response.status, result.error)
  }
  return result.data as T
}

/** HTTP status of a failed request, if known. */
export function getApiErrorStatus(err: unknown): number | undefined {
  return err instanceof ApiError ? err.status : undefined
}

/**
 * Human-readable message from an `ApiError`, a raw FastAPI error body
 * (`{ detail }`), or an `Error`. Falls back to `fallback` when nothing usable exists.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return detailToMessage(err.detail) ?? fallback
  if (isRecord(err) && 'detail' in err) return detailToMessage(err.detail) ?? fallback
  return fallback
}

function detailToMessage(detail: unknown): string | undefined {
  if (typeof detail === 'string' && detail.trim()) return detail
  // FastAPI 422 validation errors: [{ loc, msg, type }, ...]
  if (Array.isArray(detail) && detail.length > 0) {
    const first: unknown = detail[0]
    if (isRecord(first) && typeof first.msg === 'string') return first.msg
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
