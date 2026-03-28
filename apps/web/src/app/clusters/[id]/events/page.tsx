'use client'

import { Activity, Info, MessageSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
import { severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

const REFETCH_INTERVAL = 10000

interface EventData {
  type: string
  reason: string
  message: string
  namespace: string
  involvedObject: string
  count: number | null
  lastTimestamp: string | null
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

function EventSummary({ event }: { event: EventData }) {
  const color = severityColor(event.type)

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span
        className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {event.type}
      </span>
      <span className="text-[13px] font-medium text-[var(--color-text-primary)] shrink-0">
        {event.reason}
      </span>
      <span className="flex-1 min-w-0 text-xs text-[var(--color-text-muted)] truncate">
        {event.message}
      </span>
      <span className="text-xs font-mono text-[var(--color-accent)] shrink-0 hidden sm:inline">
        {event.involvedObject}
      </span>
      {event.count != null && event.count > 1 && (
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)] shrink-0">
          x{event.count}
        </span>
      )}
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        {event.lastTimestamp ? timeAgo(event.lastTimestamp) : '—'}
      </span>
    </div>
  )
}

function EventExpandedDetail({ event }: { event: EventData }) {
  const tabs = [
    {
      id: 'message',
      label: 'Message',
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      content: (
        <p className="text-[11px] text-[var(--color-text-secondary)] whitespace-pre-wrap break-all font-mono">
          {event.message}
        </p>
      ),
    },
    {
      id: 'details',
      label: 'Details',
      icon: <Info className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Type</span>
          <span className="font-bold" style={{ color: severityColor(event.type) }}>
            {event.type}
          </span>
          <span className="text-[var(--color-text-muted)]">Reason</span>
          <span className="text-[var(--color-text-primary)]">{event.reason}</span>
          <span className="text-[var(--color-text-muted)]">Object</span>
          <span className="text-[var(--color-accent)]">{event.involvedObject}</span>
          <span className="text-[var(--color-text-muted)]">Namespace</span>
          <span className="text-[var(--color-text-secondary)]">{event.namespace}</span>
          {event.count != null && (
            <>
              <span className="text-[var(--color-text-muted)]">Count</span>
              <span className="text-[var(--color-text-primary)]">{event.count}</span>
            </>
          )}
          <span className="text-[var(--color-text-muted)]">Last Seen</span>
          <span className="text-[var(--color-text-primary)]">
            {event.lastTimestamp ? timeAgo(event.lastTimestamp) : '—'}
          </span>
        </div>
      ),
    },
  ]

  return (
    <DetailTabs
      id={`event-${event.namespace}-${event.reason}-${event.lastTimestamp}`}
      tabs={tabs}
    />
  )
}

export default function EventsPage() {
  usePageTitle('Cluster Events')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )
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

  const events: EventData[] = useMemo(() => {
    if (effectiveIsLive) {
      return (liveQuery.data?.events ?? []).map((e) => ({
        type: asText(e.type, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message),
        namespace: asText(e.namespace),
        involvedObject: e.involvedObject,
        count: e.count ?? null,
        lastTimestamp: e.lastTimestamp ? String(e.lastTimestamp) : null,
      }))
    }
    return (dbEvents.data ?? []).map((e) => ({
      type: asText(e.type, 'Normal'),
      reason: asText(e.reason),
      message: asText(e.message),
      namespace: asText(e.namespace),
      involvedObject: '—',
      count: null,
      lastTimestamp: e.createdAt
        ? e.createdAt instanceof Date
          ? e.createdAt.toISOString()
          : String(e.createdAt)
        : null,
    }))
  }, [effectiveIsLive, liveQuery.data, dbEvents.data])

  const isLoading = effectiveIsLive ? liveQuery.isLoading : dbEvents.isLoading
  const isAutoRefreshing = effectiveIsLive ? liveQuery.isFetching : dbEvents.isFetching

  return (
    <div className="space-y-3">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isAutoRefreshing ? 'bg-[var(--color-status-active)] animate-pulse' : 'bg-[var(--color-text-dim)]'}`}
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {isAutoRefreshing ? 'Live — auto-refreshing every 10s' : 'Events'}
          </span>
        </div>
        <span className="text-xs font-mono text-[var(--color-text-dim)]">
          {events.length} events
        </span>
      </div>

      <ResourcePageScaffold<EventData>
        title="Events"
        icon={<Activity className="h-10 w-10 text-[var(--color-text-dim)]" />}
        queryResult={{
          data: events,
          isLoading,
          error: null,
        }}
        getNamespace={(event) => event.namespace || 'cluster'}
        getKey={(event) =>
          `${event.namespace}-${event.reason}-${event.lastTimestamp}-${event.involvedObject}`
        }
        filterFn={(event, q) =>
          event.reason.toLowerCase().includes(q) ||
          event.message.toLowerCase().includes(q) ||
          event.involvedObject.toLowerCase().includes(q) ||
          event.type.toLowerCase().includes(q)
        }
        renderSummary={(event) => <EventSummary event={event} />}
        renderDetail={(event) => <EventExpandedDetail event={event} />}
        searchPlaceholder="Search events..."
        emptyMessage="No events recorded yet"
        emptyDescription="Kubernetes events appear here when something notable happens in your cluster."
      />
    </div>
  )
}
