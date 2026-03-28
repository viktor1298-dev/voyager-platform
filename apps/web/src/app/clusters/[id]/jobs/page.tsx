'use client'

import { usePageTitle } from '@/hooks/usePageTitle'

export default function JobsPage() {
  usePageTitle('Jobs')

  return (
    <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
      <p className="text-sm font-medium">Jobs</p>
      <p className="text-xs text-[var(--color-text-dim)] mt-1">Coming in a future update.</p>
    </div>
  )
}
