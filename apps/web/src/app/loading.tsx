/**
 * DA2-B3-004: Root-level loading skeleton for page transitions.
 * Shown by Next.js App Router during navigation between route segments.
 */
export default function RootLoading() {
  return (
    <div className="flex h-screen w-full" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Sidebar skeleton */}
      <aside className="hidden md:flex w-56 flex-col gap-4 border-r border-[var(--color-border)] p-4">
        {/* Logo area */}
        <div className="h-8 w-32 rounded-md skeleton-shimmer" />
        {/* Nav items */}
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 rounded skeleton-shimmer" />
              <div className="h-4 rounded skeleton-shimmer" style={{ width: `${60 + Math.random() * 40}%` }} />
            </div>
          ))}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar skeleton */}
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
          <div className="h-5 w-48 rounded skeleton-shimmer" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full skeleton-shimmer" />
            <div className="h-8 w-8 rounded-full skeleton-shimmer" />
          </div>
        </header>

        {/* Content skeleton */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Page title */}
          <div className="mb-6 space-y-2">
            <div className="h-7 w-64 rounded skeleton-shimmer" />
            <div className="h-4 w-96 rounded skeleton-shimmer" />
          </div>

          {/* Card grid skeleton */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--color-border)] p-5 space-y-3"
                style={{ background: 'var(--color-bg-card)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="h-5 w-28 rounded skeleton-shimmer" />
                  <div className="h-5 w-5 rounded-full skeleton-shimmer" />
                </div>
                <div className="h-4 w-full rounded skeleton-shimmer" />
                <div className="h-4 w-3/4 rounded skeleton-shimmer" />
                <div className="h-8 w-24 rounded-lg skeleton-shimmer mt-2" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
