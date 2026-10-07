import { useEffect, useState } from 'react'

/**
 * Current time in epoch milliseconds, refreshed every `intervalMs` while `enabled`.
 * Drives the live "waiting for mm:ss" timers without each card owning an interval.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs, enabled])

  return now
}
