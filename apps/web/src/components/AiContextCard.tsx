'use client'

import { Bot, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

interface AiContextCardProps {
  clusterName: string
  clusterId: string
  healthStatus: 'error' | 'degraded'
}

export function AiContextCard({ clusterName, clusterId, healthStatus }: AiContextCardProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const isError = healthStatus === 'error'
  const borderColor = isError ? 'border-red-500/30' : 'border-yellow-500/30'
  const bgColor = isError ? 'bg-red-500/[0.05]' : 'bg-yellow-500/[0.05]'
  const statusText = isError ? 'errors' : 'degraded performance'

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 mb-6 flex items-start gap-3`}>
      <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text-primary)] font-medium">
          This cluster has {statusText}.{' '}
          <Link
            href={`/ai?context=cluster&clusterId=${clusterId}&clusterName=${encodeURIComponent(clusterName)}`}
            className="text-[var(--color-accent)] hover:underline"
          >
            Ask AI for diagnosis?
          </Link>
        </p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          AI can analyze events, logs, and resource usage to suggest fixes.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-white/[0.06] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors shrink-0"
        aria-label="Dismiss suggestion"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
