import { describe, expect, it } from 'vitest'
import { ApiError, getApiErrorMessage, getApiErrorStatus, unwrap } from './api-error'

const response = (status: number) => new Response(null, { status })

describe('unwrap', () => {
  it('returns data for a successful result', () => {
    expect(unwrap({ data: { id: 1 }, response: response(200) })).toEqual({ id: 1 })
  })

  it('throws an ApiError carrying the status and FastAPI detail', () => {
    const run = () => unwrap({ error: { detail: 'Email already in use' }, response: response(409) })

    expect(run).toThrow(ApiError)
    try {
      run()
    } catch (err) {
      expect(getApiErrorStatus(err)).toBe(409)
      expect((err as ApiError).detail).toBe('Email already in use')
      expect((err as ApiError).message).toBe('Email already in use')
    }
  })

  it('throws when the response is not ok even without an error body', () => {
    expect(() => unwrap({ response: response(500) })).toThrow('Request failed with status 500')
  })
})

describe('getApiErrorMessage', () => {
  it('uses a string detail', () => {
    expect(getApiErrorMessage(new ApiError(400, { detail: 'Bad code' }), 'fallback')).toBe('Bad code')
  })

  it('uses the first message of a validation error list', () => {
    const err = new ApiError(422, { detail: [{ loc: ['body', 'code'], msg: 'Field required' }] })
    expect(getApiErrorMessage(err, 'fallback')).toBe('Field required')
  })

  it('accepts a raw FastAPI error body', () => {
    expect(getApiErrorMessage({ detail: 'Not found' }, 'fallback')).toBe('Not found')
  })

  it('falls back when nothing usable is present', () => {
    expect(getApiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
    expect(getApiErrorMessage(new ApiError(500, null), 'fallback')).toBe('fallback')
  })

  it('reports no status for non-API errors', () => {
    expect(getApiErrorStatus(new Error('boom'))).toBeUndefined()
  })
})
