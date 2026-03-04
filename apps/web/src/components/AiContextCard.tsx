'use client'

import { Bot, ChevronDown, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

interface AiContextCardProps {
  clusterName: string
  clusterId: string
  healthStatus: 'error' | 'degraded'
}

const MOCK_ANALYSIS: Record<string, string[]> = {
  error: [
    '**Root Cause:** Multiple pods in CrashLoopBackOff — likely OOMKilled due to memory limits.',
    '**Recommendation:** Increase memory limits in deployment spec from 128Mi to 256Mi.',
    '**Quick Fix:** `kubectl set resources deployment/api -c api --limits=memory=256Mi`',
    '**Monitor:** Watch pod restarts with `kubectl get pods -w` after applying fix.',
  ],
  degraded: [
    '**Observation:** CPU utilization at 87% on 2/3 nodes — approaching saturation.',
    '**Recommendation:** Consider enabling Horizontal Pod Autoscaler (HPA) for key workloads.',
    '**Quick Fix:** `kubectl autoscale deployment/api --min=2 --max=5 --cpu-percent=70`',
    '**Long-term:** Evaluate node pool sizing or add a new node group.',
  ],
}

export function AiContextCard({ clusterName, clusterId, healthStatus }: AiContextCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string[] | null>(null)

  if (dismissed) return null

  const isError = healthStatus === 'error'
  const borderColor = isError ? 'border-red-500/30' : 'border-yellow-500/30'
  const bgColor = isError ? 'bg-red-500/[0.05]' : 'bg-yellow-500/[0.05]'
  const statusText = isError ? 'errors' : 'degraded performance'

  const handleExpand = () => {
    if (!expanded && !analysis) {
      setExpanded(true)
      setAnalyzing(true)
      // Simulate AI analysis delay
      setTimeout(() => {
        setAnalysis(MOCK_ANALYSIS[healthStatus] ?? MOCK_ANALYSIS.error!)
        setAnalyzing(false)
      }, 1500)
    } else {
      setExpanded(!expanded)
    }
  }

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 mb-6`}>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-text-primary)] font-medium">
            This cluster has {statusText}.{' '}
            <button
              type="button"
              onClick={handleExpand}
              className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-1"
            >
              Analyze with AI?
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
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

      {/* Collapsible AI Analysis */}
      {expanded && (
        <div className="mt-3 ml-11 border-t border-[var(--color-border)]/30 pt-3">
          {analyzing ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent)]" />
              Analyzing cluster events and metrics…
            </div>
          ) : (
            <div className="space-y-2">
              {analysis?.map((line, i) => (
                <p
                  key={i}
                  className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed [&_strong]:text-[var(--color-text-primary)] [&_strong]:font-semibold [&_code]:text-[11px] [&_code]:font-mono [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded"
                  dangerouslySetInnerHTML={{
                    __html: line
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/`(.*?)`/g, '<code>$1</code>'),
                  }}
                />
              ))}
              <Link
                href={`/ai?context=cluster&clusterId=${clusterId}&clusterName=${encodeURIComponent(clusterName)}`}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-accent)] hover:underline mt-1"
              >
                <Bot className="h-3 w-3" />
                Continue in AI Chat →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
