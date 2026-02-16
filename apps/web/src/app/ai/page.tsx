'use client'

import { BrainCircuit, Lightbulb, Stethoscope } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { AiChat } from '@/components/ai/AiChat'
import { type Recommendation, RecommendationsPanel } from '@/components/ai/RecommendationsPanel'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'

const clusters = ['production-eu-1', 'staging-us-2', 'dev-sandbox-1']

const recommendationsByCluster: Record<string, Recommendation[]> = {
  'production-eu-1': [
    {
      id: 'p1',
      title: 'Scale worker deployment',
      description:
        'CPU saturation reached 87% for 15 minutes. Increase worker replicas from 3 → 4.',
      severity: 'critical',
    },
    {
      id: 'p2',
      title: 'Review readiness probe timeout',
      description:
        'Readiness failures spiked after the last deployment. Timeout of 1s appears too strict.',
      severity: 'warning',
    },
    {
      id: 'p3',
      title: 'Consolidate noisy events',
      description:
        'Image pull warning events can be aggregated to reduce alert fatigue in dashboards.',
      severity: 'info',
    },
  ],
  'staging-us-2': [
    {
      id: 's1',
      title: 'Enable autoscaling policy',
      description:
        'Traffic burst windows suggest that HPA would improve resilience during validation tests.',
      severity: 'warning',
    },
    {
      id: 's2',
      title: 'Pin base image tags',
      description:
        'Floating image tags were detected in 2 services. Use immutable tags to avoid drift.',
      severity: 'info',
    },
  ],
  'dev-sandbox-1': [
    {
      id: 'd1',
      title: 'Clean up failed jobs',
      description: '11 failed jobs older than 7 days are still retained. Remove stale resources.',
      severity: 'info',
    },
  ],
}

const quickActions = [
  { key: 'analyze', label: 'Analyze Health', prompt: 'Analyze health and top risk factors' },
  {
    key: 'recommend',
    label: 'Show Recommendations',
    prompt: 'Show recommendations prioritized by impact',
  },
  {
    key: 'events',
    label: 'Explain Events',
    prompt: 'Explain recent warning events and likely causes',
  },
] as const

export default function AiAssistantPage() {
  const [selectedCluster, setSelectedCluster] = useState(clusters[0])
  const [quickPrompt, setQuickPrompt] = useState<{ id: string; text: string } | null>(null)

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Breadcrumbs />
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
              <label htmlFor="cluster-selector" className="text-xs text-[var(--color-text-dim)]">
                Cluster
              </label>
              <select
                id="cluster-selector"
                value={selectedCluster}
                onChange={(event) => setSelectedCluster(event.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
              >
                {clusters.map((cluster) => (
                  <option key={cluster} value={cluster}>
                    {cluster}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <header className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 sm:p-5">
            <h1 className="text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">
              AI Assistant
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Smart cluster analysis with conversational insights, recommendations, and event
              reasoning.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {quickActions.map((action) => {
                const icon =
                  action.key === 'analyze' ? (
                    <Stethoscope className="h-4 w-4" />
                  ) : action.key === 'recommend' ? (
                    <Lightbulb className="h-4 w-4" />
                  ) : (
                    <BrainCircuit className="h-4 w-4" />
                  )

                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => {
                      setQuickPrompt({ id: `${action.key}-${Date.now()}`, text: action.prompt })
                      toast.success(`${action.label} queued`)
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.04]"
                  >
                    {icon}
                    {action.label}
                  </button>
                )
              })}
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <AiChat selectedCluster={selectedCluster} quickPrompt={quickPrompt} />
            <RecommendationsPanel
              initialItems={
                recommendationsByCluster[selectedCluster] ??
                recommendationsByCluster['production-eu-1']
              }
            />
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  )
}
