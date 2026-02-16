'use client'

import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { MOCK_ANOMALIES } from '@/lib/anomalies'

export function AnomalyWidget() {
  const open = MOCK_ANOMALIES.filter((a) => a.status === 'open')
  const critical = open.filter((a) => a.severity === 'critical').length
  const warning = open.filter((a) => a.severity === 'warning').length
  const info = open.filter((a) => a.severity === 'info').length
  const total = open.length

  return (
    <Link href="/anomalies" className="block">
      <div className="rounded-2xl border border-[var(--glass-border)] p-4 hover:border-[var(--glass-border-hover)] transition-colors bg-[var(--glass-bg)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider font-mono text-[var(--color-text-dim)]">
            ⚠️ Anomalies
          </h3>
          <span className="text-lg font-bold text-[var(--color-text-primary)]">{total}</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-red-300">
            <span className="inline-flex items-center gap-1">
              <AlertOctagon className="h-3.5 w-3.5" />
              Critical
            </span>
            <span className="font-semibold tabular-nums">{critical}</span>
          </div>
          <div className="flex items-center justify-between text-amber-300">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warning
            </span>
            <span className="font-semibold tabular-nums">{warning}</span>
          </div>
          <div className="flex items-center justify-between text-sky-300">
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
