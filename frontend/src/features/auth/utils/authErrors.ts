import { ApiError } from '@/lib/api-error'
import { getTranslation } from '@/locales'

/** Map a failed login into a bilingual, user-facing message. */
export function getLoginErrorMessage(err: unknown, isKm: boolean): string {
  if (err instanceof ApiError && err.status === 429) {
    return getTranslation(isKm ? 'km' : 'en', 'auth.tooManyAttempts')
  }

  if (err instanceof ApiError && err.status >= 500) {
    return isKm
      ? 'ប្រព័ន្ធមានបញ្ហាបច្ចេកទេសបណ្តោះអាសន្ន។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។'
      : 'Server is temporarily unavailable. Please try again later.'
  }

  const detail = err instanceof ApiError ? err.detail : undefined

  if (typeof detail === 'string') {
    if (detail.includes('Invalid email, phone number, or password')) {
      return isKm
        ? 'អ៊ីមែល លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ'
        : 'Invalid email, phone number, or password.'
    }
    if (detail.includes('not active')) {
      return isKm ? 'គណនីនេះត្រូវបានផ្អាកដំណើរការ' : 'This account is not active.'
    }
    return detail
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const msg: unknown = (detail[0] as { msg?: unknown } | undefined)?.msg
    if (typeof msg === 'string') return msg
    return isKm ? 'ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ' : 'Invalid input format.'
  }

  return isKm
    ? 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ'
    : 'Invalid email or password. Please try again.'
}
