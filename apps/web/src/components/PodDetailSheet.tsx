'use client'

import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import { PodLogStream } from '@/components/PodLogStream'
import { timeAgo } from '@/lib/time-utils'

interface PodInfo {
  name: string
  namespace: string
  status: string
  createdAt: string | null
  nodeName: string | null
  cpuMillis: number | null
  memoryMi: number | null
  cpuPercent: number | null
  memoryPercent: number | null
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]/50 last:border-b-0">
      <span className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider">{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)] font-medium">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'Running' ? 'var(--color-status-active)' : status === 'Pending' ? 'var(--color-status-warning)' : 'var(--color-status-error)'
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span style={{ color }} className="text-[13px] font-semibold">{status}</span>
    </span>
  )
}

export function PodDetailSheet({
  pod,
  open,
  onOpenChange,
  events,
}: {
  pod: PodInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  events?: Array<{ reason?: string | null; message?: string | null; timestamp?: string; type?: string | null }>
}) {
  if (!pod) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md" onClose={() => onOpenChange(false)}>
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{pod.name}</SheetTitle>
          <p className="text-sm text-[var(--color-text-muted)]">Pod details</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basic Info */}
          <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
            <InfoRow label="Status" value={<StatusBadge status={pod.status} />} />
            <InfoRow label="Namespace" value={<span className="font-mono text-[12px]">{pod.namespace}</span>} />
            <InfoRow label="Node" value={<span className="font-mono text-[12px]">{pod.nodeName ?? '—'}</span>} />
            <InfoRow label="Age" value={pod.createdAt ? timeAgo(pod.createdAt) : '—'} />
          </div>

          {/* Resource Usage */}
          {(pod.cpuMillis != null || pod.memoryMi != null) && (
            <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
              <h4 className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mb-3">Resource Usage</h4>
              {pod.cpuMillis != null && (
                <div className="mb-3">
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-[var(--color-text-muted)]">CPU</span>
                    <span className="text-[var(--color-text-primary)] font-mono">{pod.cpuMillis}m{pod.cpuPercent != null ? ` (${pod.cpuPercent.toFixed(0)}%)` : ''}</span>
                  </div>
                  {pod.cpuPercent != null && <Progress value={Math.min(pod.cpuPercent, 100)} className="h-1.5" />}
                </div>
              )}
              {pod.memoryMi != null && (
                <div>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-[var(--color-text-muted)]">Memory</span>
                    <span className="text-[var(--color-text-primary)] font-mono">{pod.memoryMi}Mi{pod.memoryPercent != null ? ` (${pod.memoryPercent.toFixed(0)}%)` : ''}</span>
                  </div>
                  {pod.memoryPercent != null && <Progress value={Math.min(pod.memoryPercent, 100)} className="h-1.5" />}
                </div>
              )}
            </div>
          )}

          {/* Recent Events */}
          {events && events.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
              <h4 className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mb-3">Recent Events</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {events.slice(0, 10).map((evt, i) => (
                  <div key={i} className="text-[12px] border-b border-[var(--color-border)]/30 pb-2 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <span className={evt.type === 'Warning' ? 'text-[var(--color-status-warning)] font-semibold' : 'text-[var(--color-text-secondary)]'}>
                        {evt.reason ?? 'Event'}
                      </span>
                      {evt.timestamp && <span className="text-[10px] text-[var(--color-text-dim)] font-mono">{timeAgo(evt.timestamp)}</span>}
                    </div>
                    {evt.message && <p className="text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{evt.message}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Log Stream */}
          <PodLogStream podName={pod.name} namespace={pod.namespace} />

          {/* View Logs Button */}
          <Link
            href={`/logs?pod=${encodeURIComponent(pod.name)}&namespace=${encodeURIComponent(pod.namespace)}`}
            className="flex items-center justify-center w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            View Logs
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
