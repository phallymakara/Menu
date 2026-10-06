/** Cambodia (Asia/Phnom_Penh) is UTC+7 all year; it has no daylight saving time. */
const PHNOM_PENH_UTC_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * The current business day in Cambodia, from local midnight until `now`, as UTC
 * ISO timestamps that the analytics API accepts as start_date and end_date.
 */
export function todayRangeInPhnomPenh(now: Date = new Date()): { start: string; end: string } {
  const local = new Date(now.getTime() + PHNOM_PENH_UTC_OFFSET_MS)
  const localMidnightUtcMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    PHNOM_PENH_UTC_OFFSET_MS
  return { start: new Date(localMidnightUtcMs).toISOString(), end: now.toISOString() }
}
