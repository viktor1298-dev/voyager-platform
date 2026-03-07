'use client'

import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { AlertTriangle, Server } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface NodeMetricsTableProps {
  clusterId: string
  range: string
}

function getColorClass(percent: number | null | undefined): string {
  if (percent == null) return 'var(--color-text-dim)'
  if (percent > 85) return 'hsl(0,84%,60%)'
  if (percent > 65) return 'hsl(48,96%,53%)'
  return 'hsl(142,71%,45%)'
}

function PercentBar({ value }: { value: number | null | undefined }) {
  const color = getColorClass(value)
  const pct = Math.min(value ?? 0, 100)

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
  // MX-005: Wire up nodeTimeSeries when Dima adds it — optional/conditional
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeTimeSeriesQuery = (trpc.metrics as any).nodeTimeSeries?.useQuery?.(
    { clusterId, range },
    { staleTime: 30_000, retry: false },
  )

  const isLoading = nodeTimeSeriesQuery?.isLoading ?? false
  const error = nodeTimeSeriesQuery?.error ?? null
  const data: Array<{
    name: string
    cpuPercent: number | null
    memPercent: number | null
    cpuMillicores: number | null
    memMi: number | null
  }> = nodeTimeSeriesQuery?.data ?? []

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
        <div className="text-xs font-semibold text-[var(--color-text-primary)] mb-3">Per-Node Metrics</div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error || data.length === 0) {
    return null // Silently hide when route doesn't exist yet
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]/50 flex items-center gap-2">
        <Server className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Per-Node Metrics</span>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">({data.length} nodes)</span>
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
            {data.map((node) => (
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
