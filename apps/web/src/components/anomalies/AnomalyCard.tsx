'use client'

import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import type { Anomaly } from '@/lib/anomalies'
import { getRelativeTime } from '@/lib/anomalies'

interface AnomalyCardProps {
  anomaly: Anomaly
  onAcknowledge?: (id: string) => void
  onResolve?: (id: string) => void
}

const SEVERITY_META = {
  critical: {
    icon: AlertOctagon,
    badgeClass: 'bg-red-50 text-red-600 border-red-300 dark:bg-red-500/20 dark:text-red-200 dark:border-red-500/30',
    dotClass: 'bg-red-500 dark:bg-red-400',
  },
  warning: {
    icon: AlertTriangle,
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/30',
    dotClass: 'bg-amber-500 dark:bg-amber-400',
  },
  info: {
    icon: Info,
    badgeClass: 'bg-sky-50 text-sky-600 border-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-500/30',
    dotClass: 'bg-sky-500 dark:bg-sky-400',
  },
} as const

const STATUS_STYLE: Record<Anomaly['status'], string> = {
  open: 'text-red-500 dark:text-red-300',
  acknowledged: 'text-amber-600 dark:text-amber-300',
  resolved: 'text-emerald-600 dark:text-emerald-300',
}

export function AnomalyCard({ anomaly, onAcknowledge, onResolve }: AnomalyCardProps) {
  const severityMeta = SEVERITY_META[anomaly.severity]
  const SeverityIcon = severityMeta.icon

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <SeverityIcon className="h-3.5 w-3.5 shrink-0" />
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityMeta.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${severityMeta.dotClass}`} />
              {anomaly.severity}
            </span>
            <span className="text-[10px] text-[var(--color-text-dim)]">
              {getRelativeTime(anomaly.detectedAt)}
            </span>
          </div>
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
            {anomaly.title}
          </h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-1">
            {anomaly.description}
          </p>
        </div>

        <span
          className={`text-[10px] uppercase tracking-wide font-semibold shrink-0 ${STATUS_STYLE[anomaly.status]}`}
        >
          {anomaly.status}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <Link
          href={`/clusters/${anomaly.clusterId}`}
          className="text-[var(--color-accent)] hover:underline truncate"
        >
          {anomaly.cluster}
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onAcknowledge?.(anomaly.id)
            }}
            disabled={anomaly.status !== 'open'}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5 inline mr-1" />
            Acknowledge
          </button>
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onResolve?.(anomaly.id)
            }}
            disabled={anomaly.status === 'resolved'}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
            Resolve
          </button>
        </div>
      </div>
    </div>
  )
}
