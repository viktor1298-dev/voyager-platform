'use client'

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { filterOpenAnomalies, MOCK_ANOMALIES, type Anomaly, type AnomalySeverity } from '@/lib/anomalies'
import { trpc } from '@/lib/trpc'

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

const SEVERITY_COLORS: Record<AnomalySeverity, string> = {
  critical: '#f87171',
  warning: '#fbbf24',
  info: '#38bdf8',
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

/** Maximum anomalies shown in timeline */
const TIMELINE_MAX_ITEMS = 10

/** 24h distribution bar — shows density of anomalies across hours */
function TimelineDistributionBar({ anomalies }: { anomalies: Anomaly[] }) {
  const buckets = useMemo(() => {
    const now = Date.now()
    const hourMs = 60 * 60 * 1000
    // 24 one-hour buckets
    const b: Array<{ critical: number; warning: number; info: number }> = Array.from(
      { length: 24 },
      () => ({ critical: 0, warning: 0, info: 0 }),
    )
    for (const a of anomalies) {
      const hoursAgo = Math.floor((now - new Date(a.detectedAt).getTime()) / hourMs)
      if (hoursAgo >= 0 && hoursAgo < 24) {
        b[23 - hoursAgo][a.severity]++
      }
    }
    return b
  }, [anomalies])

  const maxCount = Math.max(1, ...buckets.map((b) => b.critical + b.warning + b.info))

  return (
    <div className="mb-3">
      <div className="flex items-end gap-px h-8">
        {buckets.map((b, i) => {
          const total = b.critical + b.warning + b.info
          const height = total > 0 ? Math.max(4, (total / maxCount) * 32) : 2
          // Color by highest severity in bucket
          const color = b.critical > 0
            ? SEVERITY_COLORS.critical
            : b.warning > 0
              ? SEVERITY_COLORS.warning
              : b.info > 0
                ? SEVERITY_COLORS.info
                : 'rgba(255,255,255,0.06)'
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all duration-300"
              style={{
                height: `${height}px`,
                backgroundColor: color,
                opacity: total > 0 ? 0.85 : 0.3,
              }}
              title={`${24 - i}h ago: ${total} event${total !== 1 ? 's' : ''}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-[var(--color-text-dim)] font-mono">-24h</span>
        <span className="text-[9px] text-[var(--color-text-dim)] font-mono">-12h</span>
        <span className="text-[9px] text-[var(--color-text-dim)] font-mono">now</span>
      </div>
    </div>
  )
}

/** Severity summary pills */
function SeveritySummary({ anomalies }: { anomalies: Anomaly[] }) {
  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 }
    for (const a of anomalies) c[a.severity]++
    return c
  }, [anomalies])

  return (
    <div className="flex items-center gap-2 mb-3">
      {(['critical', 'warning', 'info'] as const).map((sev) => (
        <span
          key={sev}
          className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{
            color: SEVERITY_COLORS[sev],
            background: `color-mix(in srgb, ${SEVERITY_COLORS[sev]} 10%, transparent)`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: SEVERITY_COLORS[sev] }}
          />
          {counts[sev]}
        </span>
      ))}
    </div>
  )
}

export function AnomalyTimeline() {
  // TODO: Replace mock fallback once backend anomalies.listAll is deployed
  const liveQuery = trpc.anomalies?.listAll?.useQuery?.(undefined, { refetchInterval: 60_000 })
  const USE_MOCK = !liveQuery?.data
  const source = USE_MOCK ? MOCK_ANOMALIES : (liveQuery?.data ?? [])
  const allAnomalies = useMemo(
    () =>
      [...source]
        .filter((a) => {
          // Only show last 24h
          const age = Date.now() - new Date(a.detectedAt).getTime()
          return age < 24 * 60 * 60 * 1000
        })
        .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()),
    [source],
  )
  const openAnomalies = useMemo(() => filterOpenAnomalies(allAnomalies), [allAnomalies])
  const displayAnomalies = openAnomalies.slice(0, TIMELINE_MAX_ITEMS)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
          Anomaly Timeline — 24h
        </h3>
        <Link
          href="/anomalies"
          className="text-[10px] font-medium text-[var(--color-accent)] hover:underline"
        >
          View all →
        </Link>
      </div>

      <SeveritySummary anomalies={allAnomalies} />
      <TimelineDistributionBar anomalies={allAnomalies} />

      {displayAnomalies.length === 0 ? (
        <span className="text-xs text-[var(--color-text-dim)]">No anomalies in the last 24h</span>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-border)]/60" />

          <div className="space-y-2.5">
            {displayAnomalies.map((a) => (
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
                      {a.type}
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
