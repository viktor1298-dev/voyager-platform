'use client'

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { filterOpenAnomalies, MOCK_ANOMALIES, type Anomaly } from '@/lib/anomalies'

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <AlertOctagon className="h-3 w-3 text-red-400" />
    case 'warning':
      return <AlertTriangle className="h-3 w-3 text-amber-400" />
    default:
      return <Info className="h-3 w-3 text-sky-400" />
  }
}

function severityDotColor(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-400'
    case 'warning':
      return 'bg-amber-400'
    default:
      return 'bg-sky-400'
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AnomalyTimeline() {
  // Using mock data for now — will switch to trpc.anomalies.list once backend supports cross-cluster query
  const anomalies = filterOpenAnomalies(MOCK_ANOMALIES)
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, 8)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
          Anomaly Timeline
        </h3>
        <Link
          href="/anomalies"
          className="text-[10px] font-medium text-[var(--color-accent)] hover:underline"
        >
          View all →
        </Link>
      </div>

      {anomalies.length === 0 ? (
        <span className="text-xs text-[var(--color-text-dim)]">No anomalies in the last 24h</span>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-border)]/60" />

          <div className="space-y-2.5">
            {anomalies.map((a) => (
              <div key={a.id} className="flex items-start gap-3 relative">
                {/* Timeline dot */}
                <span
                  className={`h-[14px] w-[14px] rounded-full ${severityDotColor(a.severity)} shrink-0 z-10 ring-2 ring-[var(--color-bg-card)]`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {severityIcon(a.severity)}
                    <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                      {a.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {a.cluster}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)]">·</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {timeAgo(a.detectedAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
