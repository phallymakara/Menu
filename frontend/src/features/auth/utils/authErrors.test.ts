import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { getLoginErrorMessage } from './authErrors'

describe('getLoginErrorMessage', () => {
  it('translates invalid credentials', () => {
    const err = new ApiError(401, { detail: 'Invalid email, phone number, or password.' })
    expect(getLoginErrorMessage(err, false)).toBe('Invalid email, phone number, or password.')
    expect(getLoginErrorMessage(err, true)).toBe('អ៊ីមែល លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ')
  })

  it('asks the user to wait after too many attempts', () => {
    const err = new ApiError(429, { detail: 'Too many attempts. Please try again later.' })
    expect(getLoginErrorMessage(err, false)).toBe(
      'Too many attempts. Please wait a few minutes and try again.'
    )
    expect(getLoginErrorMessage(err, true)).toBe(
      'ការព្យាយាមច្រើនដងពេក។ សូមរង់ចាំប៉ុន្មាននាទី រួចព្យាយាមម្តងទៀត។'
    )
  })

  it('translates inactive accounts', () => {
    const err = new ApiError(403, { detail: 'User account is not active.' })
    expect(getLoginErrorMessage(err, false)).toBe('This account is not active.')
  })

  it('passes through other server messages and validation errors', () => {
    expect(getLoginErrorMessage(new ApiError(400, { detail: 'Locked' }), false)).toBe('Locked')
    expect(
      getLoginErrorMessage(new ApiError(422, { detail: [{ msg: 'Field required' }] }), false)
    ).toBe('Field required')
  })

  it('falls back to a generic message for network errors', () => {
    expect(getLoginErrorMessage(new TypeError('Failed to fetch'), false)).toBe(
      'Invalid email or password. Please try again.'
    )
  })
})
