'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { TableSkeleton } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { normalizeLiveHealthStatus } from '@/lib/cluster-status'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HeartPulse,
  Info,
  ServerCrash,
  Wifi,
  WifiOff,
} from 'lucide-react'

const COMPONENT_NAMES = ['API Server', 'etcd', 'Scheduler', 'Controller Mgr'] as const

// ── Latency Thresholds (ms) ──
const LATENCY_GOOD = 200
const LATENCY_WARN = 600
const LATENCY_MAX_DISPLAY = 2000

// ── Sync Freshness Threshold (ms) ──
const SYNC_FRESH_THRESHOLD_MS = 600_000 // 10 minutes

// ── Display Limits ──
const MAX_RECENT_EVENTS = 15

/** Shape of a Kubernetes-style event from the events.list router */
interface KubeEvent {
  id?: string | number
  kind: string
  reason?: string
  message?: string
  namespace?: string
  timestamp?: string | Date
}

function UptimeBars({ history }: { history: Array<{ status: string; checkedAt: string | Date }> }) {
  // Build 24 hourly slots (index 0 = oldest)
  const now = Date.now()
  const HOURS = 24
  const slots: ('healthy' | 'degraded' | 'error' | 'none')[] = Array(HOURS).fill('none')

  for (const entry of history) {
    const hoursAgo = Math.floor((now - new Date(entry.checkedAt).getTime()) / 3_600_000)
    if (hoursAgo >= 0 && hoursAgo < HOURS) {
      const idx = HOURS - 1 - hoursAgo
      const norm = normalizeLiveHealthStatus(entry.status)
      // worst-wins per slot
      const mapped: 'healthy' | 'degraded' | 'error' | 'none' =
        norm === 'healthy' ? 'healthy' : norm === 'degraded' ? 'degraded' : norm === 'error' ? 'error' : 'none'
      if (slots[idx] === 'none' || mapped === 'error' || (mapped === 'degraded' && slots[idx] === 'healthy')) {
        slots[idx] = mapped
      }
    }
  }

  const colorClass = (s: (typeof slots)[0]) => {
    if (s === 'healthy') return 'bg-[var(--color-status-active)]'
    if (s === 'degraded') return 'bg-[var(--color-status-warning)]'
    if (s === 'error') return 'bg-[var(--color-status-error)]'
    return 'bg-[var(--color-border)]'
  }

  return (
    <div className="flex gap-0.5">
      {slots.map((s, i) => (
        <div
          key={i}
          className={`flex-1 h-6 rounded-sm ${colorClass(s)} hover:opacity-70 transition-opacity cursor-default`}
          title={`${HOURS - i}h ago — ${s === 'none' ? 'no data' : s}`}
        />
      ))}
    </div>
  )
}

export default function HealthPage() {
  usePageTitle('System Health')

  const healthQuery = trpc.health.status.useQuery({}, { refetchInterval: 30_000 })
  const eventsQuery = trpc.events.list.useQuery(
    { limit: 20 },
    { refetchInterval: 60_000 },
  )

  const healthData = healthQuery.data ?? []
  const isLoading = healthQuery.isLoading
  const allHealthy = healthData.length > 0 && healthData.every((c) => c.status === 'healthy')
  const avgLatency =
    healthData.length > 0
      ? Math.round(healthData.reduce((sum, c) => sum + (c.responseTimeMs ?? 0), 0) / healthData.length)
      : null

  // Build pseudo-history from current status for uptime bars
  const historyMap: Record<string, Array<{ status: string; checkedAt: string | Date }>> = {}
  for (const entry of healthData) {
    if (entry.checkedAt) {
      historyMap[entry.clusterId] = [{ status: entry.status, checkedAt: entry.checkedAt as string }]
    }
  }

  const recentEvents = ((eventsQuery.data ?? []) as KubeEvent[]).filter(
    (e) => e.kind === 'Warning' || e.kind === 'Normal',
  )
  const warningEvents = recentEvents.filter((e) => e.kind === 'Warning')
  const normalEvents = recentEvents.filter((e) => e.kind === 'Normal')

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

        {/* ── Section 1: API Status Banner ── */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
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
                  {isLoading
                    ? 'Checking systems…'
                    : allHealthy
                      ? 'All Systems Operational'
                      : 'System Issues Detected'}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {healthData.length} cluster{healthData.length !== 1 ? 's' : ''} monitored · auto-refresh 30s
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="flex items-center gap-1.5 justify-end">
                  <Activity className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
                  <span className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                    {avgLatency != null ? `${avgLatency}ms` : '—'}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-text-dim)]">Avg API Latency</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 justify-end">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-status-warning)]" />
                  <span className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                    {warningEvents.length}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-text-dim)]">Warnings (recent)</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 justify-end">
                  <Info className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
                  <span className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                    {normalEvents.length}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-text-dim)]">Events (recent)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Per-Cluster Component Health Matrix ── */}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">
          Cluster Component Health
        </h3>

        {isLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : healthData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)] mb-6">
            <WifiOff className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No clusters registered</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">Add a cluster to start monitoring health.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-x-auto mb-6">
            {/* Header */}
            <div className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-white/[0.02] min-w-[600px]">
              <span className="text-xs font-bold text-[var(--color-text-dim)] uppercase col-span-2">Cluster</span>
              {COMPONENT_NAMES.map((name) => (
                <span key={name} className="text-xs font-bold text-[var(--color-text-dim)] uppercase text-center">
                  {name}
                </span>
              ))}
            </div>
            {/* Rows */}
            {healthData.map((entry) => {
              const health = normalizeLiveHealthStatus(entry.status)
              const isHealthy = health === 'healthy'
              const isDegraded = health === 'degraded'
              return (
                <div
                  key={entry.clusterId}
                  className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-white/[0.02] min-w-[600px]"
                >
                  <div className="col-span-2 flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        isHealthy
                          ? 'bg-[var(--color-status-active)]'
                          : isDegraded
                            ? 'bg-[var(--color-status-warning)]'
                            : 'bg-[var(--color-status-error)]'
                      }`}
                    />
                    <span className="text-sm text-[var(--color-text-primary)] font-medium truncate">
                      {entry.clusterName}
                    </span>
                    <span className="text-xs text-[var(--color-text-dim)] font-mono ml-auto">
                      {entry.responseTimeMs != null ? `${entry.responseTimeMs}ms` : ''}
                    </span>
                  </div>
                  {COMPONENT_NAMES.map((comp) => (
                    <div key={comp} className="flex justify-center items-center">
                      {isHealthy ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-status-active)]" />
                      ) : isDegraded ? (
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

        {/* ── Section 3: API Latency ── */}
        {healthData.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">API Latency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {healthData.map((entry) => {
                const ms = entry.responseTimeMs ?? 0
                const pct = Math.min(100, (ms / LATENCY_MAX_DISPLAY) * 100)
                const barColor =
                  ms < LATENCY_GOOD
                    ? 'bg-[var(--color-status-active)]'
                    : ms < LATENCY_WARN
                      ? 'bg-[var(--color-status-warning)]'
                      : 'bg-[var(--color-status-error)]'
                return (
                  <div
                    key={entry.clusterId}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {entry.clusterName}
                      </span>
                      <span className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                        {ms}ms
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-[var(--color-text-dim)] mt-1">
                      {ms < LATENCY_GOOD ? 'Excellent' : ms < LATENCY_WARN ? 'Moderate' : 'Slow'} response
                    </p>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Section 4: Sync Status ── */}
        {healthData.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">Sync Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {healthData.map((entry) => {
                const checkedRecently =
                  entry.checkedAt &&
                  Date.now() - new Date(entry.checkedAt as string).getTime() < SYNC_FRESH_THRESHOLD_MS
                return (
                  <div
                    key={entry.clusterId}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {entry.clusterName}
                      </span>
                      {checkedRecently ? (
                        <Wifi className="h-4 w-4 text-[var(--color-status-active)] shrink-0" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-[var(--color-status-error)] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {entry.checkedAt
                        ? `Last sync: ${timeAgo(entry.checkedAt as string)}`
                        : 'Never synced'}
                    </p>
                    <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                      Provider: {entry.provider}
                    </p>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Section 5: Uptime History (24h) ── */}
        {healthData.length > 0 && (
          <>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">
              Uptime History (24h)
            </h3>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] divide-y divide-[var(--color-border)] mb-6 overflow-hidden">
              {healthData.map((entry) => (
                <div key={entry.clusterId} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                      {entry.clusterName}
                    </span>
                    <span className="text-xs text-[var(--color-text-dim)] font-mono">
                      {normalizeLiveHealthStatus(entry.status).toUpperCase()}
                    </span>
                  </div>
                  <UptimeBars history={historyMap[entry.clusterId] ?? []} />
                  <div className="flex justify-between mt-1.5 text-xs text-[var(--color-text-dim)] font-mono">
                    <span>24h ago</span>
                    <span>Now</span>
                  </div>
                </div>
              ))}
              {/* Legend */}
              <div className="px-4 py-2 flex items-center gap-4">
                {[
                  { color: 'bg-[var(--color-status-active)]', label: 'Healthy' },
                  { color: 'bg-[var(--color-status-warning)]', label: 'Degraded' },
                  { color: 'bg-[var(--color-status-error)]', label: 'Error' },
                  { color: 'bg-[var(--color-border)]', label: 'No data' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                    <span className="text-xs text-[var(--color-text-dim)]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Section 6: Recent Incidents Timeline ── */}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-3">
          Recent Incidents
        </h3>
        {eventsQuery.isLoading ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 mb-6">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="h-4 w-4 rounded-full bg-[var(--color-border)] animate-pulse shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-[var(--color-border)] animate-pulse rounded w-3/4" />
                    <div className="h-2 bg-[var(--color-border)] animate-pulse rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)] mb-6">
            <CheckCircle2 className="h-7 w-7 mb-2 text-[var(--color-status-active)] opacity-70" />
            <p className="text-sm">No recent incidents</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">All clear!</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] divide-y divide-[var(--color-border)] mb-6 overflow-hidden">
            {recentEvents.slice(0, MAX_RECENT_EVENTS).map((event, idx) => {
              const isWarning = event.kind === 'Warning'
              return (
                <div key={String(event.id ?? idx)} className="flex gap-3 px-4 py-3 hover:bg-white/[0.02]">
                  {/* Timeline dot */}
                  <div className="relative flex flex-col items-center pt-0.5">
                    {isWarning ? (
                      <AlertTriangle className="h-4 w-4 text-[var(--color-status-warning)] shrink-0" />
                    ) : (
                      <Info className="h-4 w-4 text-[var(--color-text-dim)] shrink-0" />
                    )}
                    {idx < recentEvents.slice(0, MAX_RECENT_EVENTS).length - 1 && (
                      <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${
                          isWarning
                            ? 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'
                            : 'bg-[var(--color-border)] text-[var(--color-text-dim)]'
                        }`}
                      >
                        {event.kind}
                      </span>
                      {event.reason && (
                        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                          {event.reason}
                        </span>
                      )}
                      <span className="text-xs text-[var(--color-text-dim)] ml-auto">
                        {event.timestamp ? timeAgo(event.timestamp as string) : '—'}
                      </span>
                    </div>
                    {event.message && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                        {event.message}
                      </p>
                    )}
                    {event.namespace && (
                      <p className="text-xs text-[var(--color-text-dim)] mt-0.5 font-mono">
                        ns: {event.namespace}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageTransition>
    </AppLayout>
  )
}
