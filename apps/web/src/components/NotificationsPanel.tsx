'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { useNotificationsStore } from '@/stores/notifications'
import { Bell, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface KubeEvent {
  id: string
  clusterId: string
  namespace?: string | null
  kind: string
  reason?: string | null
  message?: string | null
  source?: string | null
  involvedObject?: unknown
  timestamp: string
  createdAt?: string
  clusterName?: string | null
  cluster?: string | null
}

interface GroupedNotification {
  key: string
  message: string
  reason: string
  count: number
  latestTimestamp: string
  clusterName: string
  severity: 'critical' | 'warning' | 'info'
}

function relativeTime(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function getSeverity(event: KubeEvent): 'critical' | 'warning' | 'info' {
  const reason = (event.reason ?? '').toLowerCase()
  const message = (event.message ?? '').toLowerCase()
  if (
    reason.includes('error') ||
    reason.includes('failed') ||
    reason.includes('crash') ||
    reason.includes('oom') ||
    message.includes('crashloop')
  )
    return 'critical'
  if (event.kind === 'Warning') return 'warning'
  return 'info'
}

function getSeverityBorderColor(severity: 'critical' | 'warning' | 'info'): string {
  if (severity === 'critical') return '#ef4444'
  if (severity === 'warning') return '#f59e0b'
  return '#3b82f6'
}

function getSourceName(event: KubeEvent): string {
  // Try to get pod/service name from involvedObject
  const obj = event.involvedObject as Record<string, unknown> | null | undefined
  if (obj && typeof obj === 'object') {
    const name = obj.name as string | undefined
    if (name) return name
  }
  return event.source ?? event.clusterName ?? event.cluster ?? 'unknown'
}

function groupNotifications(events: KubeEvent[]): GroupedNotification[] {
  const map = new Map<string, GroupedNotification>()
  for (const event of events) {
    const key = `${event.reason ?? ''}|${event.message ?? ''}|${event.clusterId}`
    const severity = getSeverity(event)
    const existing = map.get(key)
    if (existing) {
      existing.count++
      if (new Date(event.timestamp) > new Date(existing.latestTimestamp)) {
        existing.latestTimestamp = event.timestamp
      }
    } else {
      map.set(key, {
        key,
        message: event.message ?? event.reason ?? '',
        reason: event.reason ?? '',
        count: 1,
        latestTimestamp: event.timestamp,
        clusterName: getSourceName(event),
        severity,
      })
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime(),
  )
}

type CategoryFilter = 'all' | 'alerts' | 'events' | 'system'

export function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const { lastReadAt: lastReadTimestamp, setLastRead } = useNotificationsStore()
  const panelRef = useRef<HTMLDivElement>(null)

  const eventsQuery = trpc.events.list.useQuery({ limit: 50 }, { refetchInterval: 30000 })

  const allEvents = (eventsQuery.data ?? []) as KubeEvent[]
  const alerts = allEvents.filter((e) => e.kind === 'Warning')
  const unreadCount = lastReadTimestamp
    ? alerts.filter((e) => new Date(e.timestamp) > new Date(lastReadTimestamp)).length
    : alerts.length

  // Category filtering
  const filteredEvents =
    category === 'all'
      ? alerts
      : category === 'alerts'
        ? allEvents.filter(
            (e) =>
              e.kind === 'Warning' &&
              ((e.reason ?? '').toLowerCase().includes('error') ||
                (e.reason ?? '').toLowerCase().includes('failed') ||
                (e.reason ?? '').toLowerCase().includes('crash')),
          )
        : category === 'events'
          ? allEvents.filter((e) => e.kind !== 'Warning')
          : allEvents.filter(
              (e) =>
                (e.source ?? '').toLowerCase().includes('system') ||
                (e.reason ?? '').toLowerCase().includes('node'),
            )

  const grouped = groupNotifications(
    filteredEvents.length > 0 ? filteredEvents : category === 'all' ? alerts : filteredEvents,
  )

  const handleMarkAllRead = () => {
    setLastRead()
    // Close panel to visually confirm badge dismissed
    setOpen(false)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center h-11 w-11 rounded-xl border border-[var(--color-border)] hover:bg-white/[0.04] transition-colors"
      >
        <Bell className="h-4 w-4 text-[var(--color-text-muted)]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold leading-none">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80 max-h-[420px] overflow-y-auto rounded-xl border shadow-2xl z-50"
          style={{
            background: 'var(--elevated)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Notifications
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-[var(--color-accent)] hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] -mr-2"
              >
                <X className="h-4 w-4 text-[var(--color-text-dim)]" />
              </button>
            </div>
          </div>

          {/* Category filter tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--glass-border)]">
            {(['all', 'alerts', 'events', 'system'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-2 min-h-[44px] rounded text-xs font-medium capitalize transition-colors ${category === cat ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]'}`}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {grouped.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--color-text-dim)] text-xs">
              No alerts
            </div>
          ) : (
            <div className="py-1">
              {grouped.slice(0, 10).map((notif) => (
                <div
                  key={notif.key}
                  className="flex items-start gap-0 hover:bg-white/[0.04] transition-colors"
                  style={{
                    borderLeft: `3px solid ${getSeverityBorderColor(notif.severity)}`,
                  }}
                >
                  <div className="flex items-start gap-3 px-4 py-2.5 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)] truncate">
                          {notif.clusterName}
                        </span>
                        <span className="text-xs text-[var(--color-text-dim)] font-mono whitespace-nowrap">
                          {relativeTime(notif.latestTimestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-snug line-clamp-2">
                        {notif.count > 1
                          ? `${notif.message || notif.reason} (×${notif.count})`
                          : notif.message || notif.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-[var(--glass-border)] px-4 py-2.5">
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              className="text-xs text-[var(--color-accent)] hover:underline font-medium"
            >
              View all alerts →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
