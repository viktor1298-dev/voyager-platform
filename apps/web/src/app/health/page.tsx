'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { HeartPulse, RefreshCw, Clock, Zap, ChevronLeft } from 'lucide-react'
import { useState, useCallback } from 'react'

const STATUS_COLORS: Record<string, string> = {
  healthy: 'var(--color-status-active)',
  degraded: 'var(--color-status-warning)',
  critical: 'var(--color-status-error)',
  unknown: 'var(--color-text-dim)',
}

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  unknown: 'Unknown',
}

function timeAgo(ts: string | Date | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function HealthPage() {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  const [checkingClusterId, setCheckingClusterId] = useState<string | null>(null)

  const statusQuery = trpc.health.status.useQuery(undefined, {
    refetchInterval: 60_000,
  })

  const historyQuery = trpc.health.history.useQuery(
    { clusterId: selectedClusterId ?? '' },
    { enabled: !!selectedClusterId, refetchInterval: 60_000 },
  )

  const utils = trpc.useUtils()

  const handleCheck = useCallback(
    async (clusterId: string) => {
      setCheckingClusterId(clusterId)
      try {
        await utils.health.check.fetch({ clusterId })
        utils.health.status.invalidate()
        utils.health.history.invalidate({ clusterId })
      } finally {
        setCheckingClusterId(null)
      }
    },
    [utils],
  )

  const statuses = statusQuery.data ?? []
  const selectedCluster = statuses.find((s) => s.clusterId === selectedClusterId)

  return (
    <AppLayout>
      <Breadcrumbs />
      <div className="flex items-center gap-3 mb-6 mt-2">
        <HeartPulse className="h-5 w-5 text-[var(--color-accent)]" />
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Cluster Health
        </h1>
      </div>

      {selectedClusterId && selectedCluster ? (
        <HealthDetail
          cluster={selectedCluster}
          history={historyQuery.data ?? []}
          isLoading={historyQuery.isLoading}
          onBack={() => setSelectedClusterId(null)}
          onCheck={() => handleCheck(selectedClusterId)}
          isChecking={checkingClusterId !== null}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {statusQuery.isLoading ? (
            <>
              <Shimmer className="h-32 rounded-xl" />
              <Shimmer className="h-32 rounded-xl" />
              <Shimmer className="h-32 rounded-xl" />
            </>
          ) : statuses.length === 0 ? (
            <p className="text-[var(--color-text-muted)] col-span-full">
              No clusters found. Add clusters to monitor their health.
            </p>
          ) : (
            statuses.map((s) => (
              <HealthCard
                key={s.clusterId}
                cluster={s}
                onClick={() => setSelectedClusterId(s.clusterId)}
                onCheck={() => handleCheck(s.clusterId)}
                isChecking={checkingClusterId === s.clusterId}
              />
            ))
          )}
        </div>
      )}
    </AppLayout>
  )
}

function HealthCard({
  cluster,
  onClick,
  onCheck,
  isChecking,
}: {
  cluster: { clusterId: string; clusterName: string; provider: string; status: string; checkedAt: Date | string | null; responseTimeMs: number | null }
  onClick: () => void
  onCheck: () => void
  isChecking: boolean
}) {
  const color = STATUS_COLORS[cluster.status] ?? STATUS_COLORS.unknown
  const label = STATUS_LABELS[cluster.status] ?? 'Unknown'

  return (
    <div
      className="relative rounded-xl p-4 border border-[var(--color-border)] hover:border-[var(--color-border-hover)] cursor-pointer transition-all duration-200"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
      }}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      role="button"
      tabIndex={0}
    >
      {/* Status accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ backgroundColor: color, opacity: 0.7 }}
      />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full animate-pulse-slow"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-bold text-[var(--color-text-primary)]">
            {cluster.clusterName}
          </span>
        </div>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--color-border)]"
          style={{ color }}
        >
          {label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)] font-mono mb-3">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(cluster.checkedAt)}
        </span>
        {cluster.responseTimeMs !== null && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {cluster.responseTimeMs}ms
          </span>
        )}
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-accent)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
        disabled={isChecking}
        onClick={(e) => {
          e.stopPropagation()
          onCheck()
        }}
      >
        <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
        {isChecking ? 'Checking...' : 'Check Now'}
      </button>
    </div>
  )
}

function HealthDetail({
  cluster,
  history,
  isLoading,
  onBack,
  onCheck,
  isChecking,
}: {
  cluster: { clusterId: string; clusterName: string; status: string; checkedAt: Date | string | null; responseTimeMs: number | null }
  history: Array<{ id: string; status: string; checkedAt: Date | string; responseTimeMs: number | null; details?: Record<string, unknown> | null }>
  isLoading: boolean
  onBack: () => void
  onCheck: () => void
  isChecking: boolean
}) {
  const color = STATUS_COLORS[cluster.status] ?? STATUS_COLORS.unknown

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] mb-4 cursor-pointer transition-colors"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" />
        Back to overview
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full animate-pulse-slow"
            style={{ backgroundColor: color }}
          />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {cluster.clusterName}
          </h2>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-md border border-[var(--color-border)]"
            style={{ color }}
          >
            {STATUS_LABELS[cluster.status] ?? 'Unknown'}
          </span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors cursor-pointer"
          disabled={isChecking}
          onClick={onCheck}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Check Now'}
        </button>
      </div>

      {/* Health History Timeline */}
      <h3 className="text-sm font-bold text-[var(--color-text-secondary)] mb-3">
        Health History
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          <Shimmer className="h-12 rounded-lg" />
          <Shimmer className="h-12 rounded-lg" />
          <Shimmer className="h-12 rounded-lg" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-[var(--color-text-muted)] text-sm">
          No health checks recorded yet. Click &quot;Check Now&quot; to run the first check.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Mini chart - response time bars */}
          <div className="flex items-end gap-0.5 h-16 mb-4 px-1">
            {[...history].reverse().map((entry) => {
              const maxMs = Math.max(...history.map((h) => h.responseTimeMs ?? 0), 1)
              const heightPct = ((entry.responseTimeMs ?? 0) / maxMs) * 100
              const entryColor = STATUS_COLORS[entry.status] ?? STATUS_COLORS.unknown
              return (
                <div
                  key={entry.id}
                  className="flex-1 min-w-[3px] max-w-[12px] rounded-t transition-all"
                  style={{
                    height: `${Math.max(heightPct, 4)}%`,
                    backgroundColor: entryColor,
                    opacity: 0.7,
                  }}
                  title={`${entry.status} — ${entry.responseTimeMs ?? 0}ms — ${new Date(entry.checkedAt).toLocaleString()}`}
                />
              )
            })}
          </div>

          {/* List */}
          {history.map((entry) => {
            const entryColor = STATUS_COLORS[entry.status] ?? STATUS_COLORS.unknown
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: entryColor }}
                />
                <span className="text-xs font-medium text-[var(--color-text-primary)] w-16">
                  {STATUS_LABELS[entry.status] ?? 'Unknown'}
                </span>
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                  {entry.responseTimeMs ?? 0}ms
                </span>
                <span className="flex-1" />
                <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
                  {new Date(entry.checkedAt).toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
