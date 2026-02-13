'use client'

import { AppLayout } from '@/components/AppLayout'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { AlertTriangle, Calendar, Search, Shield } from 'lucide-react'
import { useMemo, useState } from 'react'

type EventFilter = 'all' | 'Normal' | 'Warning'

interface KubeEvent {
  type: string
  reason: string
  message: string
  namespace: string
  involvedObject: string
  count: number
  lastTimestamp: string
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function EventsPage() {
  const [filter, setFilter] = useState<EventFilter>('all')
  const [search, setSearch] = useState('')

  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const data = liveQuery.data as Record<string, unknown> | undefined
  const events: KubeEvent[] = (data?.events as KubeEvent[] | undefined) ?? []
  const isLoading = liveQuery.isLoading

  const filtered = useMemo(() => {
    let result = [...events]
    if (filter !== 'all') result = result.filter((e) => e.type === filter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.reason.toLowerCase().includes(q) ||
          e.involvedObject.toLowerCase().includes(q) ||
          e.namespace.toLowerCase().includes(q),
      )
    }
    result.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    return result
  }, [events, filter, search])

  const counts = useMemo(
    () => ({
      all: events.length,
      Normal: events.filter((e) => e.type === 'Normal').length,
      Warning: events.filter((e) => e.type === 'Warning').length,
    }),
    [events],
  )

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Events
        </h1>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
          {events.length} events · auto-refresh 30s
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]">
          {(['all', 'Normal', 'Warning'] as EventFilter[]).map((f) => {
            const isActive = filter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`
                  flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium tracking-wide
                  transition-all duration-200 cursor-pointer select-none
                  ${isActive
                    ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04]'
                  }
                `}
              >
                {f === 'Warning' && (
                  <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-status-warning)]" />
                )}
                {f === 'Normal' && (
                  <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-status-active)]" />
                )}
                <span>{f === 'all' ? 'All' : f}</span>
                <span
                  className={`tabular-nums ${isActive ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-dim)]'}`}
                >
                  {counts[f]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-dim)]" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-[12px] bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex gap-4">
            <Shimmer className="h-3 w-16" />
            <Shimmer className="h-3 w-12" />
            <Shimmer className="h-3 w-20" />
            <Shimmer className="h-3 flex-1" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-[var(--color-border)]/30 flex gap-4">
              <Shimmer className="h-4 w-16" />
              <Shimmer className="h-4 w-16" />
              <Shimmer className="h-4 w-20" />
              <Shimmer className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-12 text-center">
          <Calendar className="h-8 w-8 text-[var(--color-text-dim)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-muted)]">No events found</p>
          <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
            {search ? 'Try adjusting your search query' : 'Events will appear here when available'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[80px_70px_100px_140px_100px_1fr_50px] gap-2 px-4 py-2.5 border-b border-[var(--color-border)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
            <span>Time</span>
            <span>Type</span>
            <span>Reason</span>
            <span>Object</span>
            <span>Namespace</span>
            <span>Message</span>
            <span className="text-right">Count</span>
          </div>

          {/* Rows */}
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            {filtered.map((event, i) => {
              const isWarning = event.type === 'Warning'
              return (
                <div
                  key={`${event.involvedObject}-${event.reason}-${event.lastTimestamp}-${i}`}
                  className={`
                    grid grid-cols-[80px_70px_100px_140px_100px_1fr_50px] gap-2 px-4 py-2.5 text-[12px] border-b border-[var(--color-border)]/20
                    hover:bg-white/[0.02] transition-colors relative
                    ${isWarning ? 'bg-[var(--color-status-warning)]/[0.03]' : ''}
                  `}
                >
                  {/* Warning left accent */}
                  {isWarning && (
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-status-warning)]/60" />
                  )}

                  <span className="text-[var(--color-text-muted)] font-mono tabular-nums truncate">
                    {timeAgo(event.lastTimestamp)}
                  </span>

                  <span>
                    {isWarning ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)] border border-[var(--color-status-warning)]/20">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Warn
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-status-active)]/10 text-[var(--color-status-active)] border border-[var(--color-status-active)]/20">
                        <Shield className="h-2.5 w-2.5" />
                        OK
                      </span>
                    )}
                  </span>

                  <span className="text-[var(--color-text-secondary)] font-medium truncate">
                    {event.reason}
                  </span>

                  <span className="text-[var(--color-text-muted)] font-mono text-[11px] truncate" title={event.involvedObject}>
                    {event.involvedObject}
                  </span>

                  <span className="text-[var(--color-accent)] font-mono text-[11px] truncate">
                    {event.namespace}
                  </span>

                  <span className="text-[var(--color-text-muted)] truncate" title={event.message}>
                    {event.message}
                  </span>

                  <span className="text-[var(--color-text-dim)] font-mono tabular-nums text-right">
                    {event.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
