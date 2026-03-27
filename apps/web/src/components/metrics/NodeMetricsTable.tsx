'use client'

import { trpc } from '@/lib/trpc'
import { Server } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { MetricsRange } from './TimeRangeSelector'

interface NodeMetricsTableProps {
  clusterId: string
  range: MetricsRange
}

function getColor(percent: number): string {
  if (percent < 1) return 'var(--color-text-dim)' // idle/no data
  if (percent > 85) return 'var(--color-threshold-critical)'
  if (percent > 65) return 'var(--color-threshold-warn)'
  return 'var(--color-threshold-normal)'
}

function PercentBar({ value }: { value: number | null | undefined }) {
  const v = value ?? 0
  const color = getColor(v)
  const pct = Math.min(v, 100)

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="relative h-1.5 flex-1 rounded-full bg-[var(--color-track)] overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-mono w-8 text-right shrink-0" style={{ color }}>
        {value != null ? `${value}%` : '—'}
      </span>
    </div>
  )
}

export function NodeMetricsTable({ clusterId, range }: NodeMetricsTableProps) {
  const refetchInterval = 30_000

  const {
    data: rawData,
    isLoading,
    error,
  } = trpc.metrics.nodeTimeSeries.useQuery(
    { clusterId, range },
    { refetchInterval, staleTime: 30_000, enabled: Boolean(clusterId) },
  )

  // Transform time-series arrays → latest value per node
  const nodes = (rawData ?? []).map((node) => ({
    name: node.nodeName,
    cpuPercent: node.cpuValues.length > 0 ? node.cpuValues[node.cpuValues.length - 1] : 0,
    memPercent: node.memValues.length > 0 ? node.memValues[node.memValues.length - 1] : 0,
    cpuMillicores: node.cpuMillis.length > 0 ? node.cpuMillis[node.cpuMillis.length - 1] : 0,
    memMi: node.memMi.length > 0 ? node.memMi[node.memMi.length - 1] : 0,
  }))

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
        <div className="text-xs font-semibold text-[var(--color-text-primary)] mb-3">
          Per-Node Metrics
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error || nodes.length === 0) {
    return null // Silently hide when no data
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]/50 flex items-center gap-2">
        <Server className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
          Per-Node Metrics
        </span>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
          ({nodes.length} nodes)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" aria-label="Per-node resource metrics">
          <thead>
            <tr className="border-b border-[var(--color-border)]/30 text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-2 font-medium">Node Name</th>
              <th className="text-left px-3 py-2 font-medium">CPU %</th>
              <th className="text-left px-3 py-2 font-medium">Memory %</th>
              <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">CPU (m)</th>
              <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Memory (Mi)</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.name}
                className="border-b border-[var(--color-border)]/20 last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-[var(--color-text-primary)] truncate max-w-[160px]">
                  {node.name}
                </td>
                <td className="px-3 py-2.5">
                  <PercentBar value={node.cpuPercent} />
                </td>
                <td className="px-3 py-2.5">
                  <PercentBar value={node.memPercent} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--color-text-muted)] hidden sm:table-cell">
                  {node.cpuMillicores != null ? `${node.cpuMillicores}m` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-muted)] hidden sm:table-cell">
                  {node.memMi != null ? `${node.memMi} Mi` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
