'use client'

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { filterOpenAnomalies, getAnomalySeverityCounts, MOCK_ANOMALIES } from '@/lib/anomalies'

export function AnomalyWidget({ compact }: { compact?: boolean }) {
  const openAnomalies = filterOpenAnomalies(MOCK_ANOMALIES)
  const { total, critical, warning, info } = getAnomalySeverityCounts(openAnomalies)

  if (compact) {
    return (
      <Link href="/anomalies" className="block h-full">
        <div
          className="rounded-xl px-3 py-2.5 border border-[var(--color-border)] hover:border-[var(--color-border-hover)] w-full h-full flex items-center justify-between gap-2 transition-colors"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            minHeight: '64px',
          }}
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono">
              Anomalies
            </span>
            <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums">
              <span className="text-red-400/90 inline-flex items-center gap-0.5">
                <AlertOctagon className="h-3 w-3" />
                {critical}
              </span>
              <span className="text-amber-400/80 inline-flex items-center gap-0.5">
                <AlertTriangle className="h-3 w-3" />
                {warning}
              </span>
              <span className="text-sky-400/80 inline-flex items-center gap-0.5">
                <Info className="h-3 w-3" />
                {info}
              </span>
            </div>
          </div>
          <span className="text-xl font-extrabold text-[var(--color-text-primary)] shrink-0">{total}</span>
        </div>
      </Link>
    )
  }

  return (
    <Link href="/anomalies" className="block">
      <div className="rounded-2xl border border-[var(--glass-border)] p-4 hover:border-[var(--glass-border-hover)] transition-colors bg-[var(--glass-bg)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider font-mono text-[var(--color-text-muted)]">
            Anomalies
          </h3>
          <span className="text-lg font-bold text-[var(--color-text-primary)]">{total}</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-red-400/80">
            <span className="inline-flex items-center gap-1">
              <AlertOctagon className="h-3.5 w-3.5" />
              Critical
            </span>
            <span className="font-semibold tabular-nums">{critical}</span>
          </div>
          <div className="flex items-center justify-between text-amber-400/70">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warning
            </span>
            <span className="font-semibold tabular-nums">{warning}</span>
          </div>
          <div className="flex items-center justify-between text-sky-400/70">
            <span className="inline-flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              Info
            </span>
            <span className="font-semibold tabular-nums">{info}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
