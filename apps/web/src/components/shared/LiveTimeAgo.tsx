'use client'

import { useEffect, useState } from 'react'
import { timeAgo } from '@/lib/time-utils'

/**
 * Self-updating relative time label — re-renders every second so age
 * labels stay fresh independently of the parent component's render cycle.
 *
 * This replaces inline `timeAgo(date)` calls in SSE-driven resource pages
 * where the parent only re-renders on actual K8s watch events. Without
 * this, age labels freeze between events and only update on the 5s tick.
 *
 * Each instance runs its own 1-second interval. With ~40 pods on screen
 * the cost is ~40 tiny text-span re-renders per second — negligible.
 */
export function LiveTimeAgo({ date }: { date: string | Date | null | undefined }) {
  const [, tick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => tick((t) => t + 1), 1_000)
    return () => clearInterval(timer)
  }, [])

  return <>{date ? timeAgo(date) : '—'}</>
}
