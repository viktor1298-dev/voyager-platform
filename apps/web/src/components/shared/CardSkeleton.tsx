'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface CardSkeletonProps {
  count?: number
  className?: string
}

/**
 * CardSkeleton — shimmer placeholder for MetricCard / stat cards.
 * Use while tRPC queries are loading.
 *
 * @example
 *   isLoading ? <CardSkeleton count={4} /> : <div className="grid ..."><MetricCard .../></div>
 */
export function CardSkeleton({ count = 1, className }: CardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`card-skeleton-${i}`}
          className={cn(
            'relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4',
            className,
          )}
          aria-busy="true"
          aria-label="Loading card"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-2">
              {/* Label */}
              <Skeleton className="h-2.5 w-20 rounded" />
              {/* Value */}
              <Skeleton className="h-7 w-16 rounded" />
              {/* Description */}
              <Skeleton className="h-2 w-24 rounded" />
            </div>
            {/* Icon placeholder */}
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          </div>
          {/* Sparkline placeholder */}
          <div className="mt-3">
            <Skeleton className="h-8 w-20 rounded" />
          </div>
        </div>
      ))}
    </>
  )
}
