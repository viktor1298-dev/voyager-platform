/**
 * DA2-B3-004: Cluster detail loading skeleton.
 * Matches the shape of the cluster detail page (header + tab bar + content).
 */
export default function ClusterDetailLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Cluster header skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg skeleton-shimmer" />
        <div className="space-y-2 flex-1">
          <div className="h-6 w-48 rounded skeleton-shimmer" />
          <div className="h-4 w-72 rounded skeleton-shimmer" />
        </div>
        <div className="h-8 w-24 rounded-lg skeleton-shimmer" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] pb-px">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 rounded-t-md skeleton-shimmer" style={{ width: `${70 + i * 8}px` }} />
        ))}
      </div>

      {/* Metrics row skeleton */}
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--color-border)] p-4 space-y-2"
            style={{ background: 'var(--color-bg-card)' }}
          >
            <div className="h-3 w-20 rounded skeleton-shimmer" />
            <div className="h-7 w-16 rounded skeleton-shimmer" />
            <div className="h-2 w-full rounded-full skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Content area skeleton */}
      <div
        className="rounded-xl border border-[var(--color-border)] p-5 space-y-4"
        style={{ background: 'var(--color-bg-card)' }}
      >
        {/* Table header */}
        <div className="flex items-center gap-4 pb-3 border-b border-[var(--color-border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 rounded skeleton-shimmer" style={{ width: `${80 + i * 20}px` }} />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 rounded skeleton-shimmer" style={{ width: `${60 + j * 20}px` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
