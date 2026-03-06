'use client'

import { useCallback, useEffect, useState } from 'react'

export const REFRESH_INTERVALS = [
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
  { label: '15m', value: 900_000 },
  { label: '30m', value: 1_800_000 },
  { label: '1h', value: 3_600_000 },
] as const

export type RefreshIntervalMs = (typeof REFRESH_INTERVALS)[number]['value']

const STORAGE_KEY = 'voyager-refresh-interval'
const DEFAULT_INTERVAL: RefreshIntervalMs = 300_000 // 5 minutes

function readFromStorage(): RefreshIntervalMs {
  if (typeof window === 'undefined') return DEFAULT_INTERVAL
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_INTERVAL
    const parsed = Number(raw)
    const valid = REFRESH_INTERVALS.find((r) => r.value === parsed)
    return valid ? (parsed as RefreshIntervalMs) : DEFAULT_INTERVAL
  } catch {
    return DEFAULT_INTERVAL
  }
}

/**
 * Hook to read/write the dashboard auto-refresh interval.
 * Persists to localStorage under key `voyager-refresh-interval`.
 * Defaults to 5 minutes on first use.
 */
export function useRefreshInterval() {
  const [intervalMs, setIntervalMs] = useState<RefreshIntervalMs>(DEFAULT_INTERVAL)

  // Hydrate from localStorage once mounted (avoid SSR mismatch)
  useEffect(() => {
    setIntervalMs(readFromStorage())
  }, [])

  const setAndPersist = useCallback((next: RefreshIntervalMs) => {
    setIntervalMs(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Ignore write errors (private browsing, quota, etc.)
    }
  }, [])

  return { intervalMs, setIntervalMs: setAndPersist }
}
