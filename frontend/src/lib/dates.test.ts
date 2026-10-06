import { describe, expect, it } from 'vitest'
import { todayRangeInPhnomPenh } from './dates'

describe('todayRangeInPhnomPenh', () => {
  it('starts at midnight in Cambodia, not at UTC midnight', () => {
    // 2026-10-06 09:30 in Phnom Penh is 02:30 UTC.
    const now = new Date('2026-10-06T02:30:00Z')
    expect(todayRangeInPhnomPenh(now)).toEqual({
      start: '2026-10-05T17:00:00.000Z',
      end: '2026-10-06T02:30:00.000Z',
    })
  })

  it('rolls over to the next day after 17:00 UTC', () => {
    // 2026-10-06 18:00 UTC is already 01:00 on 2026-10-07 in Phnom Penh.
    const now = new Date('2026-10-06T18:00:00Z')
    expect(todayRangeInPhnomPenh(now).start).toBe('2026-10-06T17:00:00.000Z')
  })
})
