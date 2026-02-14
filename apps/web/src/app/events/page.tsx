'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Calendar, Shield } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface KubeEvent {
  type: string
  reason: string
  message: string
  namespace: string
  object: string
  count: number
  lastSeen: string
}

type EventFilter = 'all' | 'Normal' | 'Warning'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function TypeBadge({ type }: { type: string }) {
  const isWarning = type === 'Warning'
  return isWarning ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)] border border-[var(--color-status-warning)]/20">
      <AlertTriangle className="h-2.5 w-2.5" />Warn
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-status-active)]/10 text-[var(--color-status-active)] border border-[var(--color-status-active)]/20">
      <Shield className="h-2.5 w-2.5" />OK
    </span>
  )
}

export default function EventsPage() {
  const [filter, setFilter] = useState<EventFilter>('all')

  const eventsQuery = trpc.clusters.liveEvents.useQuery(undefined, { refetchInterval: 30000 })
  const events: KubeEvent[] = (eventsQuery.data as KubeEvent[] | undefined) ?? []

  useEffect(() => {
    const onRefresh = () => eventsQuery.refetch()
    document.addEventListener('voyager:refresh', onRefresh)
    return () => document.removeEventListener('voyager:refresh', onRefresh)
  }, [eventsQuery])

  const filtered = useMemo(() => {
    let result = [...events]
    if (filter !== 'all') result = result.filter((e) => e.type === filter)
    result.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    return result
  }, [events, filter])

  const counts = useMemo(() => ({
    all: events.length,
    Normal: events.filter((e) => e.type === 'Normal').length,
    Warning: events.filter((e) => e.type === 'Warning').length,
  }), [events])

  const columns = useMemo<ColumnDef<KubeEvent, unknown>[]>(() => [
    {
      id: 'time',
      header: 'Time',
      accessorFn: (row) => row.lastSeen,
      cell: ({ row }) => <span className="text-[var(--color-text-muted)] font-mono tabular-nums text-xs">{timeAgo(row.original.lastSeen)}</span>,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => <TypeBadge type={row.original.type} />,
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => <span className="text-[var(--color-text-secondary)] font-medium text-xs">{row.original.reason}</span>,
    },
    {
      accessorKey: 'object',
      header: 'Object',
      cell: ({ row }) => <span className="text-[var(--color-text-muted)] font-mono text-[11px] truncate max-w-[140px] block" title={row.original.object}>{row.original.object}</span>,
    },
    {
      accessorKey: 'namespace',
      header: 'Namespace',
      cell: ({ row }) => <span className="text-[var(--color-accent)] font-mono text-[11px]">{row.original.namespace}</span>,
    },
    {
      accessorKey: 'message',
      header: 'Message',
      cell: ({ row }) => <span className="text-[var(--color-text-muted)] text-xs truncate max-w-[300px] block" title={row.original.message}>{row.original.message}</span>,
    },
    {
      accessorKey: 'count',
      header: 'Count',
      cell: ({ row }) => <span className="text-[var(--color-text-dim)] font-mono tabular-nums text-xs text-right block">{row.original.count}</span>,
    },
  ], [])

  const filterBar = (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]">
      {(['all', 'Normal', 'Warning'] as EventFilter[]).map((f) => {
        const isActive = filter === f
        return (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all duration-200 cursor-pointer select-none ${
              isActive
                ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04]'
            }`}
          >
            {f === 'Warning' && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-status-warning)]" />}
            {f === 'Normal' && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-status-active)]" />}
            <span>{f === 'all' ? 'All' : f}</span>
            <span className={`tabular-nums ${isActive ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-dim)]'}`}>{counts[f]}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <AppLayout>
      <PageTransition>
      <Breadcrumbs />
      {eventsQuery.error && <QueryError message={eventsQuery.error.message} onRetry={() => eventsQuery.refetch()} />}
      <div className="mb-6">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Events</h1>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">{events.length} events · auto-refresh 30s</p>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchable
        searchPlaceholder="Search events..."
        toolbar={filterBar}
        loading={eventsQuery.isLoading}
        emptyIcon={<Calendar className="h-8 w-8" />}
        emptyTitle="No events found"
        mobileCard={(event) => {
          const isWarning = event.type === 'Warning'
          return (
            <div className={`p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-card)] relative ${isWarning ? 'bg-[var(--color-status-warning)]/[0.03]' : ''}`}>
              {isWarning && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-status-warning)]/60 rounded-l-lg" />}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <TypeBadge type={event.type} />
                  <span className="text-[var(--color-text-secondary)] font-medium text-xs">{event.reason}</span>
                </div>
                <span className="text-[var(--color-text-dim)] font-mono text-[10px] tabular-nums shrink-0">{timeAgo(event.lastSeen)}</span>
              </div>
              <p className="text-[var(--color-text-muted)] text-xs leading-relaxed line-clamp-2">{event.message}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                <span className="text-[var(--color-text-muted)] font-mono truncate">{event.object}</span>
                <span className="text-[var(--color-accent)] font-mono">{event.namespace}</span>
                {event.count > 1 && <span className="text-[var(--color-text-dim)] font-mono">×{event.count}</span>}
              </div>
            </div>
          )
        }}
      />
          </PageTransition>
    </AppLayout>
  )
}
