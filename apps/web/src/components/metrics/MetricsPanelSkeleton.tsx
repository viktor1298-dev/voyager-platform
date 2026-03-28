'use client'

import { Skeleton } from '@/components/ui/skeleton'

interface MetricsPanelSkeletonProps {
  /** Chart area height in pixels (default: 240) */
  height?: number
}

export function MetricsPanelSkeleton({ height = 240 }: MetricsPanelSkeletonProps) {
  return (
    <div
      data-testid="metrics-panel-skeleton"
      className="rounded-xl border border-[var(--color-border)] p-3"
      style={{ background: 'var(--color-panel-bg)' }}
    >
      {/* Header row: title + current value */}
      <div className="mb-2 flex items-center justify-between px-1">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-4 w-12 rounded" />
      </div>

      {/* Chart area placeholder */}
      <Skeleton className="mt-2 w-full rounded-lg" style={{ height }} />

      {/* Legend row */}
      <div className="mt-2 flex items-center gap-3 px-1">
        <Skeleton className="h-2.5 w-16 rounded" />
        <Skeleton className="h-2.5 w-16 rounded" />
      </div>
    </div>
  )
}
