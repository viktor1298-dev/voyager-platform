export function DashboardSkeleton() {
  return (
    <div className="space-y-5 px-1">
      {/* KPI strip skeleton */}
      <div className="flex items-center gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
        ))}
      </div>
      {/* Filter chips skeleton */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-16 animate-pulse rounded-lg bg-[var(--color-bg-secondary)]"
          />
        ))}
      </div>
      {/* Env header skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-bg-secondary)]" />
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
      </div>
      {/* Card skeletons */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]"
          />
        ))}
      </div>
    </div>
  )
}
