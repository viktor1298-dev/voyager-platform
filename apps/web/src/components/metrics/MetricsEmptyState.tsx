'use client'

import { Activity } from 'lucide-react'

interface MetricsEmptyStateProps {
  message?: string
}

export function MetricsEmptyState({ message = 'Collecting metrics data...' }: MetricsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-[hsl(262,83%,58%)]/10 animate-ping [animation-duration:2s]" />
        <div className="relative flex items-center justify-center h-14 w-14 rounded-full bg-[hsl(262,83%,58%)]/15 border border-[hsl(262,83%,58%)]/30">
          <Activity className="h-6 w-6 text-[hsl(262,83%,58%)]" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{message}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Metrics will appear as data is collected from the cluster
        </p>
      </div>
    </div>
  )
}
