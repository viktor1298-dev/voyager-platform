'use client'

import { Activity, GanttChartSquare, Info, LayoutList, MessageSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs } from '@/components/expandable'
import { EventsTimeline } from '@/components/events/EventsTimeline'
import { ResourcePageScaffold } from '@/components/resource'
import { severityColor } from '@/lib/status-utils'
import { useClusterResources, useConnectionState } from '@/hooks/useResources'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

interface EventData {
  type: string
  kind: string
  reason: string
  message: string
  namespace: string
  involvedObject: string | { kind?: string; name?: string; namespace?: string } | null
  count: number | null
  lastTimestamp: string | null
  timestamp: string | null
}

function involvedObjectText(obj: EventData['involvedObject']): string {
  if (!obj) return '—'
  if (typeof obj === 'string') return obj
  return [obj.kind, obj.name].filter(Boolean).join('/') || '—'
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
        {involvedObjectText(event.involvedObject)}
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
          <span className="text-[var(--color-accent)]">
            {involvedObjectText(event.involvedObject)}
          </span>
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

type ViewMode = 'cards' | 'timeline'

export default function EventsPage() {
  usePageTitle('Cluster Events')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  // Raw shape from resource mapper (SSE snapshot/watch)
  interface RawEvent {
    id: string
    namespace: string | null
    kind: string
    reason: string | null
    message: string | null
    source: string | null
    involvedObject: { kind?: string; name?: string; namespace?: string } | null
    timestamp: string | null
    count?: number | null
    name?: string
  }

  const liveEventsRaw = useClusterResources<RawEvent>(resolvedId, 'events')
  const connectionState = useConnectionState(resolvedId)
  const effectiveIsLive = connectionState === 'connected' || connectionState === 'reconnecting'

  const events: EventData[] = useMemo(() => {
    return liveEventsRaw.map((e) => ({
      type: e.kind ?? 'Normal',
      kind: e.kind ?? 'Normal',
      reason: e.reason ?? '—',
      message: e.message ?? '—',
      namespace: e.namespace ?? '—',
      involvedObject: e.involvedObject,
      count: e.count ?? null,
      lastTimestamp: e.timestamp,
      timestamp: e.timestamp,
    }))
  }, [liveEventsRaw])

  const isLoading = liveEventsRaw.length === 0 && connectionState === 'initializing'
  const liveEvents = liveEventsRaw
  const isAutoRefreshing = effectiveIsLive

  return (
    <div className="space-y-3">
      {/* Header: Live indicator + View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isAutoRefreshing ? 'bg-[var(--color-status-active)] animate-pulse' : 'bg-[var(--color-text-dim)]'}`}
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {isAutoRefreshing ? 'Live \u2014 auto-refreshing every 10s' : 'Events'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--color-text-dim)]">
            {events.length} events
          </span>

          {/* View mode toggle */}
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.03]'
              }`}
            >
              <GanttChartSquare className="h-3 w-3" />
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors border-l border-[var(--color-border)] ${
                viewMode === 'cards'
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.03]'
              }`}
            >
              <LayoutList className="h-3 w-3" />
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Timeline view */}
      {viewMode === 'timeline' && <EventsTimeline events={events} />}

      {/* Cards view (existing) */}
      {viewMode === 'cards' && (
        <ResourcePageScaffold<EventData>
          title="Events"
          icon={<Activity className="h-10 w-10 text-[var(--color-text-dim)]" />}
          queryResult={{
            data: events,
            isLoading,
            error: null,
          }}
          getNamespace={(event) => event.namespace || 'cluster'}
          getKey={(event, idx) =>
            `${event.namespace}-${event.reason}-${event.lastTimestamp}-${involvedObjectText(event.involvedObject)}-${idx}`
          }
          filterFn={(event, q) =>
            event.reason.toLowerCase().includes(q) ||
            event.message.toLowerCase().includes(q) ||
            involvedObjectText(event.involvedObject).toLowerCase().includes(q) ||
            event.type.toLowerCase().includes(q)
          }
          renderSummary={(event) => <EventSummary event={event} />}
          renderDetail={(event) => <EventExpandedDetail event={event} />}
          searchPlaceholder="Search events..."
          emptyMessage="No events recorded yet"
          emptyDescription="Kubernetes events appear here when something notable happens in your cluster."
        />
      )}
    </div>
  )
}
