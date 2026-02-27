'use client'

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { filterOpenAnomalies, getAnomalySeverityCounts, MOCK_ANOMALIES } from '@/lib/anomalies'

export function AnomalyWidget() {
  const openAnomalies = filterOpenAnomalies(MOCK_ANOMALIES)
  const { total, critical, warning, info } = getAnomalySeverityCounts(openAnomalies)

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
