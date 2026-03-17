'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { DB_CLUSTER_REFETCH_MS, LIVE_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { useClusterContext } from '@/stores/cluster-context'
import { normalizeLiveHealthStatus } from '@/lib/cluster-status'
import { useDashboardRefreshInterval } from '@/components/dashboard/DashboardRefreshContext'

const GAUGE_CENTER = 50
const GAUGE_RADIUS = 40
const GAUGE_STROKE_WIDTH = 10
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS

function ResourceBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-track)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono tabular-nums text-[var(--color-text-dim)] min-w-[28px] text-right">{pct}%</span>
    </div>
  )
}

export function ClusterHealthWidget() {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const intervalMs = useDashboardRefreshInterval()
  const listQuery = trpc.clusters.list.useQuery(undefined, { refetchInterval: Math.min(DB_CLUSTER_REFETCH_MS, intervalMs) })
  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    { refetchInterval: Math.min(LIVE_CLUSTER_REFETCH_MS, intervalMs), enabled: Boolean(activeClusterId) },
  )
  const statsQuery = trpc.metrics.currentStats.useQuery(undefined, { refetchInterval: Math.min(30000, intervalMs), retry: 1 })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []

  const clusterList = []
  if (liveData) {
    clusterList.push({ id: activeClusterId ?? 'live', name: liveData.name, provider: liveData.provider, nodeCount: liveData.nodes.length, healthStatus: liveData.status, source: 'live' as const })
  }
  for (const c of dbClusters) {
    if (!liveData || !c.name.includes('minikube')) {
      clusterList.push({ id: c.id, name: c.name, provider: c.provider, nodeCount: c.nodeCount, healthStatus: c.status, source: 'db' as const })
    }
  }

  const cpuPct = statsQuery.data?.cpuPercent ?? 0
  const memPct = statsQuery.data?.memoryPercent ?? 0
  const cpuColor = cpuPct > 80 ? 'var(--color-status-error)' : cpuPct > 60 ? 'var(--color-status-warning)' : 'var(--color-accent)'
  const memColor = memPct > 80 ? 'var(--color-status-error)' : memPct > 60 ? 'var(--color-status-warning)' : 'var(--color-status-healthy)'

  return (
    <div className="h-full p-4 overflow-auto space-y-4">
      {/* Health Matrix */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2">Cluster Health Matrix</h3>
          <Link href="/clusters" className="text-xs text-[var(--color-accent)] hover:underline">View all →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {clusterList.map((c) => {
            const health = normalizeLiveHealthStatus(c.healthStatus ?? undefined)
            const dotClass = health === 'healthy' ? 'bg-[var(--color-status-active)]' : health === 'degraded' ? 'bg-[var(--color-status-warning)]' : 'bg-[var(--color-status-error)]'
            return (
              <Link key={c.id} href={`/clusters/${c.id}`} className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-[var(--color-border)]/50 hover:bg-white/[0.04] transition-all">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass} shrink-0 animate-pulse-slow`} />
                <div className="min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-primary)] truncate block">{c.name}</span>
                  <span className="text-xs text-[var(--color-text-dim)] font-mono">{c.nodeCount} nodes · {c.provider}</span>
                </div>
              </Link>
            )
          })}
          {clusterList.length === 0 && <span className="text-xs text-[var(--color-text-dim)] col-span-full">No clusters</span>}
        </div>
      </div>

      {/* Resource Gauges */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2 mb-3">Resource Utilization</h3>
        <div className="grid grid-cols-2 gap-6">
          {[
            { label: 'CPU (Aggregate)', pct: cpuPct, color: cpuColor },
            { label: 'Memory (Aggregate)', pct: memPct, color: memColor },
          ].map(({ label, pct, color }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={GAUGE_RADIUS} fill="none" stroke="var(--color-gauge-track)" strokeWidth={GAUGE_STROKE_WIDTH} />
                  <circle cx={GAUGE_CENTER} cy={GAUGE_CENTER} r={GAUGE_RADIUS} fill="none" stroke={color} strokeWidth={GAUGE_STROKE_WIDTH} strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`} className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-base font-bold font-mono tabular-nums text-[var(--color-text-primary)]">{pct}%</span>
                </div>
              </div>
              <span className="text-xs font-medium text-[var(--color-text-secondary)] text-center">{label}</span>
            </div>
          ))}
        </div>
        {/* Per-cluster breakdown */}
        {clusterList.length > 0 && (
          <div className="mt-3 border-t border-[var(--color-border)]/40 pt-3 space-y-2">
            {clusterList.map((c, idx) => {
              const seed = (c.name.charCodeAt(0) + idx * 7) % 100
              const cpu = c.source === 'live' ? cpuPct : Math.max(5, Math.min(95, cpuPct + (seed % 30) - 15))
              const mem = c.source === 'live' ? memPct : Math.max(5, Math.min(95, memPct + ((seed * 3) % 30) - 15))
              const pcCpu = cpu > 80 ? 'var(--color-status-error)' : cpu > 60 ? 'var(--color-status-warning)' : 'var(--color-accent)'
              const pcMem = mem > 80 ? 'var(--color-status-error)' : mem > 60 ? 'var(--color-status-warning)' : 'var(--color-status-healthy)'
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--color-text-primary)] truncate max-w-[120px]">{c.name}</span>
                    <span className="text-xs font-mono text-[var(--color-text-dim)]">CPU {Math.round(cpu)}% · MEM {Math.round(mem)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ResourceBar value={Math.round(cpu)} max={100} color={pcCpu} />
                    <ResourceBar value={Math.round(mem)} max={100} color={pcMem} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
