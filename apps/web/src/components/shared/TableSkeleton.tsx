'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

/**
 * TableSkeleton — shimmer placeholder for data tables.
 * Use while tRPC queries are loading.
 *
 * @example
 *   isLoading ? <TableSkeleton rows={5} columns={4} /> : <DataTable ... />
 */
export function TableSkeleton({ rows = 5, columns = 4, className }: TableSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border)] overflow-hidden',
        className,
      )}
      aria-busy="true"
      aria-label="Loading table data"
    >
      {/* Header row */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton
            key={`header-${i}`}
            className={cn('h-3 rounded', i === 0 ? 'flex-[2]' : 'flex-1')}
          />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }, (_, rowIdx) => (
        <div
          key={`row-${rowIdx}`}
          className={cn(
            'flex items-center gap-4 px-4 py-3',
            rowIdx < rows - 1 && 'border-b border-[var(--color-border)]/50',
          )}
        >
          {Array.from({ length: columns }, (_, colIdx) => (
            <Skeleton
              key={`cell-${rowIdx}-${colIdx}`}
              className={cn(
                'h-4 rounded',
                colIdx === 0 ? 'flex-[2]' : 'flex-1',
                // Vary widths for a more natural look
                colIdx % 3 === 2 && 'max-w-[60px]',
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
