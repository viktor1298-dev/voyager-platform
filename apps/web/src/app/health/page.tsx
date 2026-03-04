'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { TableSkeleton } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { normalizeLiveHealthStatus } from '@/lib/cluster-status'
import { Activity, CheckCircle2, Clock, HeartPulse, ServerCrash, Wifi, WifiOff } from 'lucide-react'
import { timeAgo } from '@/lib/time-utils'

const COMPONENT_NAMES = ['API Server', 'etcd', 'Scheduler', 'Controller Manager'] as const

export default function HealthPage() {
  const healthQuery = trpc.health.status.useQuery({}, { refetchInterval: 30_000 })

  const healthData = healthQuery.data ?? []
  const isLoading = healthQuery.isLoading
  const allHealthy = healthData.length > 0 && healthData.every((c) => c.status === 'healthy')
  const avgLatency = healthData.length > 0
    ? Math.round(healthData.reduce((sum, c) => sum + (c.responseTimeMs ?? 0), 0) / healthData.length)
    : null

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6 mt-2 flex items-center gap-3">
          <HeartPulse className="h-5 w-5 text-[var(--color-accent)]" />
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            System Health
          </h1>
        </div>

        {/* API Status Banner */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {allHealthy ? (
                <CheckCircle2 className="h-6 w-6 text-[var(--color-status-active)]" />
              ) : isLoading ? (
                <Activity className="h-6 w-6 text-[var(--color-text-dim)] animate-pulse" />
              ) : (
                <ServerCrash className="h-6 w-6 text-[var(--color-status-error)]" />
              )}
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                  {isLoading ? 'Checking...' : allHealthy ? 'All Systems Operational' : 'System Issues Detected'}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {healthData.length} cluster{healthData.length !== 1 ? 's' : ''} monitored
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
                <span className="text-xs font-mono text-[var(--color-text-secondary)]">
                  {avgLatency != null ? `${avgLatency}ms` : '—'}
                </span>
              </div>
              <span className="text-[10px] text-[var(--color-text-dim)]">Avg API Latency</span>
            </div>
          </div>
        </div>

        {/* Per-Cluster Component Health Matrix */}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Cluster Component Health</h3>

        {isLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : healthData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
            <WifiOff className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No clusters registered</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">Add a cluster to start monitoring health.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden mb-6">
            {/* Header */}
            <div className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-white/[0.02]">
              <span className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase col-span-2">Cluster</span>
              {COMPONENT_NAMES.map((name) => (
                <span key={name} className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase text-center">{name}</span>
              ))}
            </div>
            {/* Rows */}
            {healthData.map((entry) => {
              const health = normalizeLiveHealthStatus(entry.status)
              const isHealthy = health === 'healthy'
              return (
                <div key={entry.clusterId} className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                  <div className="col-span-2 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${isHealthy ? 'bg-[var(--color-status-active)]' : health === 'degraded' ? 'bg-[var(--color-status-warning)]' : 'bg-[var(--color-status-error)]'}`} />
                    <span className="text-sm text-[var(--color-text-primary)] font-medium truncate">{entry.clusterName}</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono ml-auto">{entry.responseTimeMs != null ? `${entry.responseTimeMs}ms` : ''}</span>
                  </div>
                  {COMPONENT_NAMES.map((comp) => (
                    <div key={comp} className="flex justify-center">
                      {isHealthy ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-status-active)]" />
                      ) : health === 'degraded' ? (
                        <Clock className="h-4 w-4 text-[var(--color-status-warning)]" />
                      ) : (
                        <ServerCrash className="h-4 w-4 text-[var(--color-status-error)]" />
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Sync Status */}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Sync Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {healthData.map((entry) => {
            const checkedRecently = entry.checkedAt && (Date.now() - new Date(entry.checkedAt as string).getTime()) < 600_000
            return (
              <div key={entry.clusterId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{entry.clusterName}</span>
                  {checkedRecently ? (
                    <Wifi className="h-4 w-4 text-[var(--color-status-active)]" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-[var(--color-status-error)]" />
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {entry.checkedAt ? `Last check: ${timeAgo(entry.checkedAt as string)}` : 'Never checked'}
                </p>
              </div>
            )
          })}
        </div>

        {/* Uptime History (placeholder) */}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Uptime History (24h)</h3>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 mb-6">
          <div className="flex gap-0.5">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="flex-1 h-6 rounded-sm bg-[var(--color-status-active)]/80 hover:opacity-80 transition-opacity" title={`${23 - i}h ago — operational`} />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-[var(--color-text-dim)] font-mono">
            <span>24h ago</span>
            <span>Now</span>
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  )
}
