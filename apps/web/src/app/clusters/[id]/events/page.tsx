'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Activity } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DataTable } from '@/components/DataTable'
import { severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

const REFETCH_INTERVAL = 10000

interface EventRow {
  id: string
  type: string
  reason: string
  message: string
  namespace: string
  timestamp: string | null
}

function asText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  return fallback
}

const eventColumns: ColumnDef<EventRow, unknown>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ getValue }) => {
      const ts = getValue<string | null>()
      return (
        <span className="text-[var(--color-text-dim)] font-mono text-xs whitespace-nowrap">
          {ts ? timeAgo(ts) : '—'}
        </span>
      )
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => {
      const type = getValue<string>()
      return (
        <span
          className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: severityColor(type),
            background: `color-mix(in srgb, ${severityColor(type)} 15%, transparent)`,
          }}
        >
          {type}
        </span>
      )
    },
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-primary)] text-[13px] font-medium whitespace-nowrap">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'namespace',
    header: 'Namespace',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] font-mono text-xs">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'message',
    header: 'Message',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] text-xs max-w-[400px] truncate block">
        {getValue<string>()}
      </span>
    ),
  },
]

export default function EventsPage() {
  usePageTitle('Cluster Events')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: resolvedId },
    { enabled: isLive, refetchInterval: REFETCH_INTERVAL, retry: false, staleTime: 30000 },
  )
  const liveFailed = isLive && liveQuery.isError
  const effectiveIsLive = isLive && !liveFailed

  const dbEvents = trpc.events.list.useQuery(
    { clusterId: resolvedId, limit: 50 },
    { enabled: !effectiveIsLive, refetchInterval: REFETCH_INTERVAL },
  )

  const liveData = liveQuery.data

  const events: EventRow[] = effectiveIsLive
    ? (liveData?.events ?? []).map((e, i: number) => ({
        id: `event-live-${i}`,
        type: asText(e.type, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message),
        namespace: asText(e.namespace),
        timestamp: e.lastTimestamp ? String(e.lastTimestamp) : null,
      }))
    : (dbEvents.data ?? []).map((e) => ({
        id: String(e.id),
        type: asText(e.type, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message),
        namespace: asText(e.namespace),
        timestamp: e.createdAt
          ? e.createdAt instanceof Date
            ? e.createdAt.toISOString()
            : String(e.createdAt)
          : null,
      }))

  const isAutoRefreshing = effectiveIsLive ? liveQuery.isFetching : dbEvents.isFetching

  return (
    <div className="space-y-3">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isAutoRefreshing ? 'bg-[var(--color-status-active)] animate-pulse' : 'bg-[var(--color-text-dim)]'}`}
            aria-label={isAutoRefreshing ? 'Auto-refreshing' : 'Idle'}
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {isAutoRefreshing ? 'Live — auto-refreshing every 10s' : 'Events'}
          </span>
        </div>
        <span className="text-xs font-mono text-[var(--color-text-dim)]">{events.length} events</span>
      </div>

      <DataTable
        data={events}
        columns={eventColumns}
        loading={effectiveIsLive ? liveQuery.isLoading : dbEvents.isLoading}
        emptyIcon={<Activity className="h-10 w-10" />}
        emptyTitle="No events recorded yet"
        emptyDescription="Kubernetes events appear here when something notable happens in your cluster — like pod scheduling, container crashes, scaling operations, or configuration changes. Events are typically retained for 1 hour by default."
        searchable
        paginated
        pageSize={25}
        searchPlaceholder="Search events…"
      mobileCard={(event) => {
        const isWarning = event.type === 'Warning'
        return (
          <div className={`p-3 rounded-xl border border-[var(--color-border)] ${isWarning ? 'bg-[var(--color-status-warning)]/[0.04]' : 'bg-[var(--color-bg-card)]'}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{ color: severityColor(event.type), background: `color-mix(in srgb, ${severityColor(event.type)} 15%, transparent)` }}
                >
                  {event.type}
                </span>
                <span className="text-[var(--color-text-primary)] text-xs font-medium">{event.reason}</span>
              </div>
              <span className="text-[var(--color-text-dim)] font-mono text-xs shrink-0">{event.timestamp ? timeAgo(event.timestamp) : '—'}</span>
            </div>
            <p className="text-[var(--color-text-muted)] text-xs line-clamp-2">{event.message}</p>
          </div>
        )
      }}
      />
    </div>
  )
}
