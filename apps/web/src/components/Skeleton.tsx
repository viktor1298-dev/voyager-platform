import { cn } from '@/lib/utils'

export function Shimmer({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('skeleton-shimmer', className)} {...props} />
}

export function SkeletonText({
  width = '4rem',
  height = '1.5rem',
}: {
  width?: string
  height?: string
}) {
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
