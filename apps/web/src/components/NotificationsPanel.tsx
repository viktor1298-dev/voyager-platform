'use client'

import { Bell, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useNotificationsStore } from '@/stores/notifications'

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

function relativeTime(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const { lastReadAt: lastReadTimestamp, setLastRead } = useNotificationsStore()
  const panelRef = useRef<HTMLDivElement>(null)

  const eventsQuery = trpc.events.list.useQuery({ limit: 50 }, { refetchInterval: 30000 })

  const alerts = ((eventsQuery.data ?? []) as KubeEvent[]).filter((e) => e.kind === 'Warning')
  const unreadCount = lastReadTimestamp
    ? alerts.filter((e) => new Date(e.timestamp) > new Date(lastReadTimestamp)).length
    : alerts.length

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
        className="relative flex items-center justify-center h-11 w-11 rounded-lg border border-[var(--color-border)] hover:bg-white/[0.04] transition-colors"
      >
        <Bell className="h-4 w-4 text-[var(--color-text-muted)]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 w-80 max-h-96 overflow-y-auto rounded-xl border shadow-2xl z-50"
          style={{
            background: 'rgba(15,23,42,0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Notifications
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLastRead()}
                  className="text-[10px] text-[var(--color-accent)] hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
              </button>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--color-text-dim)] text-xs">
              No alerts
            </div>
          ) : (
            <div className="py-1">
              {alerts.slice(0, 10).map((event, i: number) => (
                <div
                  key={event.id ?? i}
                  className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
                >
                  <span
                    className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        event.kind === 'Error'
                          ? 'var(--color-status-error, #ef4444)'
                          : 'var(--color-status-warning, #f59e0b)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] truncate">
                        {event.clusterName ?? event.cluster ?? 'unknown'}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-dim)] font-mono whitespace-nowrap">
                        {event.timestamp ? relativeTime(event.timestamp) : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug line-clamp-2">
                      {event.message ?? event.reason ?? ''}
                    </p>
                  </div>
                </div>
              ))}
              <div className="border-t border-white/10 px-4 py-2.5">
                <Link
                  href="/alerts"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-medium text-[var(--color-accent)] hover:underline"
                >
                  View all →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
