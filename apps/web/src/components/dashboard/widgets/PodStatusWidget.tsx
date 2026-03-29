'use client'

import { useClusterContext } from '@/stores/cluster-context'
import { trpc } from '@/lib/trpc'
export function PodStatusWidget() {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    {
      enabled: Boolean(activeClusterId),
    },
  )

  const liveData = liveQuery.data
  const runningPods = liveData?.runningPods ?? 0
  const totalPods = liveData?.totalPods ?? 0
  const pendingPods = totalPods - runningPods

  const podPct = totalPods > 0 ? Math.round((runningPods / totalPods) * 100) : 0

  return (
    <div className="h-full p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2 mb-3">
        Pod Status
      </h3>
      {!activeClusterId ? (
        <p className="text-xs text-[var(--color-text-dim)]">No cluster selected</p>
      ) : liveQuery.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton-shimmer h-8 rounded-lg" />
          ))}
        </div>
      ) : liveQuery.isError ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-muted)]">
          <p className="text-sm">Failed to load data</p>
          <button
            onClick={() => liveQuery.refetch()}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Running', value: runningPods, color: 'text-[var(--color-status-healthy)]' },
              { label: 'Pending', value: pendingPods, color: 'text-amber-400' },
              { label: 'Total', value: totalPods, color: 'text-[var(--color-text-primary)]' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1 p-2 rounded-lg border border-[var(--color-border)]/40 bg-white/[0.02]"
              >
                <span className={`text-xl font-bold font-mono tabular-nums ${color}`}>{value}</span>
                <span className="text-xs text-[var(--color-text-dim)]">{label}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--color-text-dim)]">Pod health</span>
              <span className="text-xs font-mono text-[var(--color-status-healthy)]">
                {podPct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-track)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${podPct}%`,
                  backgroundColor:
                    podPct > 90
                      ? 'var(--color-status-healthy)'
                      : podPct > 70
                        ? 'var(--color-status-warning)'
                        : 'var(--color-status-error)',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
