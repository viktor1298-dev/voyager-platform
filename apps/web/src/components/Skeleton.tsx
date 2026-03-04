import { cn } from '@/lib/utils'

export function Shimmer({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('skeleton-shimmer', className)} {...props} />
}

export function SkeletonText({
  width = '4rem',
  height = '1.5rem',
}: { width?: string; height?: string }) {
  return <Shimmer style={{ width, height }} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <div className="flex items-center justify-between mb-3">
        <Shimmer className="h-2 w-16" />
        <Shimmer className="h-4 w-12 rounded-md" />
      </div>
      <Shimmer className="h-5 w-28 mb-3" />
      <div className="flex gap-3 pt-3 border-t border-white/[0.04]">
        <Shimmer className="h-8 flex-1" />
        <Shimmer className="h-8 flex-1" />
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex gap-4 py-3">
      <Shimmer className="h-4 flex-[2]" />
      <Shimmer className="h-4 flex-1" />
      <Shimmer className="h-4 flex-1" />
      <Shimmer className="h-4 flex-1" />
    </div>
  )
}

/** Reusable table skeleton with configurable row count and columns */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-[var(--color-border)]">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={`th-${i}`} className={`h-3 rounded ${i === 0 ? 'flex-[2]' : 'flex-1'}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`tr-${r}`} className="flex gap-4 px-4 py-3 border-b border-[var(--color-border)]/50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={`td-${r}-${c}`} className={`h-4 rounded ${c === 0 ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Card skeleton for dashboard/detail cards */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl p-4 border border-[var(--color-border)] bg-[var(--color-bg-card)] space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Shimmer className="h-3 w-20 rounded" />
        <Shimmer className="h-5 w-14 rounded-full" />
      </div>
      <Shimmer className="h-6 w-32 rounded" />
      <div className="flex gap-2">
        <Shimmer className="h-4 w-16 rounded" />
        <Shimmer className="h-4 w-16 rounded" />
      </div>
    </div>
  )
}
