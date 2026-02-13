'use client'

import { SYNC_INTERVAL_MS } from '@/config/constants'
import { trpc } from '@/lib/trpc'
import { useEffect, useState } from 'react'

const MAX_CLUSTERS = 20

export function TopBar() {
  const clusters = trpc.clusters.list.useQuery()
  const clusterList = clusters.data ?? []

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 backdrop-blur-lg">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-indigo-600 flex items-center justify-center text-white text-base shadow-lg shadow-indigo-500/20">
          🚀
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)] bg-clip-text text-transparent tracking-tight">
            Voyager
          </span>
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono tracking-wider">
            PLATFORM
          </span>
        </div>
      </div>

      {/* Center: Quick stats */}
      <div className="flex gap-6 items-center">
        <TotalPodsStat clusterIds={clusterList.map((c) => c.id)} loading={clusters.isLoading} />
        <Stat label="CPU Usage" value="—" color="var(--color-text-muted)" />
        <AlertsStat clusterIds={clusterList.map((c) => c.id)} loading={clusters.isLoading} />
      </div>

      {/* Right: Connection status */}
      <ConnectionStatus dataUpdatedAt={clusters.dataUpdatedAt} />
    </header>
  )
}

function ConnectionStatus({ dataUpdatedAt }: { dataUpdatedAt?: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const secondsAgo = dataUpdatedAt ? Math.floor((now - dataUpdatedAt) / 1000) : 0
  const label = secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-white/[0.02]">
      <span className="h-2 w-2 rounded-full bg-[var(--color-status-active)] animate-pulse" />
      <span className="text-[11px] text-[var(--color-text-primary)] font-mono font-medium">
        Connected
      </span>
      <span className="text-[10px] text-[var(--color-text-dim)]">·</span>
      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">Synced {label}</span>
    </div>
  )
}

/**
 * Calls a fixed number of hooks (MAX_CLUSTERS) unconditionally to satisfy
 * React's rules of hooks. Unused slots are disabled via `enabled: false`.
 */
function TotalPodsStat({ clusterIds, loading }: { clusterIds: string[]; loading: boolean }) {
  const queries = Array.from({ length: MAX_CLUSTERS }, (_, i) => {
    const clusterId = clusterIds[i] ?? 'unused'
    return trpc.nodes.list.useQuery({ clusterId }, { enabled: i < clusterIds.length })
  })

  const active = queries.slice(0, clusterIds.length)
  const anyLoading = loading || active.some((r) => r.isLoading)
  const totalPods = active.reduce((sum, r) => {
    const nodes = r.data ?? []
    return sum + nodes.reduce((s, n) => s + (n.podsCount ?? 0), 0)
  }, 0)

  return (
    <Stat
      label="Total Pods"
      value={anyLoading ? '…' : String(totalPods)}
      color="var(--color-accent)"
    />
  )
}

function AlertsStat({ clusterIds, loading }: { clusterIds: string[]; loading: boolean }) {
  const queries = Array.from({ length: MAX_CLUSTERS }, (_, i) => {
    const clusterId = clusterIds[i] ?? 'unused'
    return trpc.events.stats.useQuery({ clusterId }, { enabled: i < clusterIds.length })
  })

  const active = queries.slice(0, clusterIds.length)
  const anyLoading = loading || active.some((r) => r.isLoading)
  const total = active.reduce((sum, r) => sum + (r.data?.Warning ?? 0), 0)

  return (
    <Stat
      label="Alerts"
      value={anyLoading ? '…' : String(total)}
      color={total > 0 ? 'var(--color-status-warning)' : 'var(--color-text-muted)'}
    />
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider mt-0.5 font-mono">
        {label}
      </div>
    </div>
  )
}
