'use client'

import { AlertTriangle, ArrowDownUp, CheckCheck, Info, ShieldAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

export type RecommendationSeverity = 'critical' | 'warning' | 'info'

export type Recommendation = {
  id: string
  title: string
  description: string
  severity: RecommendationSeverity
}

const severityWeight: Record<RecommendationSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

const severityStyles: Record<
  RecommendationSeverity,
  { label: string; className: string; icon: React.ReactNode }
> = {
  critical: {
    label: 'Critical',
    className:
      'bg-[var(--color-status-error)]/15 text-[var(--color-status-error)] border-[var(--color-status-error)]/40',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
  },
  warning: {
    label: 'Warning',
    className:
      'bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)] border-[var(--color-status-warning)]/40',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  info: {
    label: 'Info',
    className:
      'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40',
    icon: <Info className="h-3.5 w-3.5" />,
  },
}

export function RecommendationsPanel({ initialItems }: { initialItems: Recommendation[] }) {
  const [items, setItems] = useState(initialItems)
  const [descending, setDescending] = useState(true)

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const order = descending ? -1 : 1
        return (severityWeight[a.severity] - severityWeight[b.severity]) * order
      }),
    [items, descending],
  )

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Recommendations
        </h2>
        <button
          type="button"
          onClick={() => setDescending((current) => !current)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-white/[0.04]"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          Sort: {descending ? 'High → Low' : 'Low → High'}
        </button>
      </div>

      <div className="space-y-3">
        {sortedItems.length === 0 && (
          <div className="rounded-xl border border-[var(--color-border)] border-dashed p-4 text-sm text-[var(--color-text-dim)]">
            No active recommendations 🎉
          </div>
        )}

        {sortedItems.map((item) => {
          const badge = severityStyles[item.severity]
          return (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {item.title}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                >
                  {badge.icon}
                  {badge.label}
                </span>
              </div>

              <p className="text-sm text-[var(--color-text-secondary)]">{item.description}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setItems((prev) => prev.filter((entry) => entry.id !== item.id))
                    toast.success('Recommendation dismissed')
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-white/[0.04]"
                >
                  <X className="h-3.5 w-3.5" />
                  Dismiss
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setItems((prev) => prev.filter((entry) => entry.id !== item.id))
                    toast.success('Marked as resolved')
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark Resolved
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
