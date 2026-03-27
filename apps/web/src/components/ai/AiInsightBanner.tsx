'use client'

import { X, Sparkles, AlertTriangle } from 'lucide-react'
import { create } from 'zustand'
import { trpc } from '@/lib/trpc'

// Session-only Zustand store for banner dismissal
interface AiInsightBannerStore {
  dismissedSessionIds: Set<string>
  dismiss: (id: string) => void
}

const useAiInsightBannerStore = create<AiInsightBannerStore>((set) => ({
  dismissedSessionIds: new Set(),
  dismiss: (id) =>
    set((state) => ({
      dismissedSessionIds: new Set([...state.dismissedSessionIds, id]),
    })),
}))

interface AiInsightBannerProps {
  criticalAnomalyCount?: number
  criticalAlertCount?: number
  clusterId?: string
}

export function AiInsightBanner({
  criticalAnomalyCount = 0,
  criticalAlertCount = 0,
  clusterId,
}: AiInsightBannerProps) {
  const { dismissedSessionIds, dismiss } = useAiInsightBannerStore()

  const insightsQuery = trpc.ai.proactiveInsights.useQuery(
    { clusterId, criticalAnomalyCount, criticalAlertCount },
    {
      staleTime: 60_000,
      retry: false,
    },
  )

  const insights = insightsQuery.data
  const bannerId = `ai-insight-${clusterId ?? 'dashboard'}`

  if (!insights?.hasInsights || dismissedSessionIds.has(bannerId)) {
    return null
  }

  const isWarning = insights.severity === 'warning'
  const isCritical = insights.severity === 'critical'

  return (
    <div
      className="relative rounded-xl p-px mb-4"
      style={{
        background: isCritical
          ? 'var(--gradient-ai-critical, linear-gradient(135deg, rgb(168 85 247 / 0.6), rgb(239 68 68 / 0.6)))'
          : isWarning
            ? 'var(--gradient-ai-warning, linear-gradient(135deg, rgb(168 85 247 / 0.5), rgb(245 158 11 / 0.5)))'
            : 'var(--gradient-ai-info, linear-gradient(135deg, rgb(168 85 247 / 0.4), rgb(20 184 166 / 0.4)))',
      }}
    >
      <div className="rounded-[11px] bg-[var(--color-bg-card)] px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {isCritical || isWarning ? (
            <AlertTriangle className="h-4 w-4 text-purple-400" />
          ) : (
            <Sparkles className="h-4 w-4 text-purple-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-purple-400">AI Insight</span>
            {isCritical && (
              <span className="text-xs uppercase tracking-wide font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                Critical
              </span>
            )}
            {isWarning && (
              <span className="text-xs uppercase tracking-wide font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                Warning
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-primary)] font-medium mb-1.5">
            {insights.summary}
          </p>
          <ul className="space-y-1">
            {insights.insights.map((insight, i) => (
              <li key={i} className="text-xs text-[var(--color-text-secondary)]">
                • {insight.message}
                {insight.action && (
                  <span className="text-[var(--color-text-muted)]"> — {insight.action}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => dismiss(bannerId)}
          className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors mt-0.5"
          aria-label="Dismiss AI insight banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
