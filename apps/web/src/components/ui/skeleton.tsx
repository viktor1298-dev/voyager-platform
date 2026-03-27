import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      role="status"
      aria-label="Loading"
      className={cn('skeleton-shimmer rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
