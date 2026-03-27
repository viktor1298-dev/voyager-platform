'use client'

import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { useDashboardRefreshInterval } from '@/components/dashboard/DashboardRefreshContext'

export function AlertFeedWidget() {
  const intervalMs = useDashboardRefreshInterval()
  const alertsQuery = trpc.alerts.list.useQuery(undefined, {
    refetchInterval: Math.min(30000, intervalMs),
  })
  const alerts = (alertsQuery.data ?? []).slice(0, 10)

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2">
          Alert Feed
        </h3>
        <Link href="/alerts" className="text-xs text-[var(--color-accent)] hover:underline">
          View all →
        </Link>
      </div>
      <div className="flex-1 overflow-auto space-y-1.5">
        {alertsQuery.isLoading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton-shimmer h-8 rounded-lg" />
            ))}
          </div>
        )}
        {alertsQuery.isError && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-muted)]">
            <p className="text-sm">Failed to load data</p>
            <button
              onClick={() => alertsQuery.refetch()}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {!alertsQuery.isLoading && !alertsQuery.isError && alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-dim)]">
            <CheckCircle className="h-6 w-6 text-emerald-500/50" />
            <span className="text-xs">No active alerts</span>
          </div>
        )}
        {alerts.map((alert) => {
          const Icon = alert.enabled ? AlertTriangle : Info
          const color = alert.enabled ? 'text-amber-400' : 'text-blue-400'
          return (
            <div
              key={alert.id}
              className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-[var(--color-border)]/40 hover:bg-white/[0.02] transition-colors"
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                  {alert.name}
                </p>
                <p className="text-xs text-[var(--color-text-dim)] truncate">
                  {alert.metric} {alert.operator} {alert.threshold}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
