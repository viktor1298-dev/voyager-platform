'use client'

import { useClusterContext } from '@/stores/cluster-context'
import { trpc } from '@/lib/trpc'
import { SparklineChart, generateMockTrend } from '@/components/charts/SparklineChart'
import { useDashboardRefreshInterval } from '@/components/dashboard/DashboardRefreshContext'

export function ResourceChartsWidget() {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const intervalMs = useDashboardRefreshInterval()
  const statsQuery = trpc.metrics.currentStats.useQuery(undefined, { refetchInterval: Math.min(30000, intervalMs), retry: 1 })

  const cpuPct = statsQuery.data?.cpuPercent ?? 0
  const memPct = statsQuery.data?.memoryPercent ?? 0

  const cpuTrend = generateMockTrend(cpuPct || 40)
  const memTrend = generateMockTrend(memPct || 60)

  return (
    <div className="h-full p-4 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2">Resource Charts</h3>
      {!activeClusterId && (
        <p className="text-xs text-[var(--color-text-dim)]">No cluster selected</p>
      )}
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">CPU Utilization</span>
            <span className="text-xs font-mono text-[var(--color-accent)]">{cpuPct}%</span>
          </div>
          <div className="h-16 rounded-lg overflow-hidden bg-white/[0.02] border border-[var(--color-border)]/40">
            <SparklineChart data={cpuTrend} color="var(--color-chart-cpu)" height={64} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Memory Utilization</span>
            <span className="text-xs font-mono text-[var(--color-status-healthy)]">{memPct}%</span>
          </div>
          <div className="h-16 rounded-lg overflow-hidden bg-white/[0.02] border border-[var(--color-border)]/40">
            <SparklineChart data={memTrend} color="var(--color-chart-mem)" height={64} />
          </div>
        </div>
      </div>
    </div>
  )
}
