'use client'

import { timeAgo } from '@/lib/time-utils'
import { useTimeAgoTick } from './TimeAgoProvider'

/**
 * Self-updating relative time label — re-renders every second via a shared
 * global interval (TimeAgoProvider) instead of per-instance setInterval.
 *
 * With 200+ instances, one interval + one batched React commit replaces
 * 200 independent microtasks/second.
 */
export function LiveTimeAgo({ date }: { date: string | Date | null | undefined }) {
  useTimeAgoTick() // subscribe to 1s global tick
  return <>{date ? timeAgo(date) : '—'}</>
}
