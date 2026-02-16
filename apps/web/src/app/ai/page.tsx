'use client'

import { BrainCircuit, Lightbulb, Stethoscope } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { AiChat } from '@/components/ai/AiChat'
import { type Recommendation, RecommendationsPanel } from '@/components/ai/RecommendationsPanel'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trpc } from '@/lib/trpc'
import { useAiAssistantStore } from '@/stores/ai-assistant'

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
  const selectedClusterId = useAiAssistantStore((state) => state.selectedClusterId)
  const setSelectedClusterId = useAiAssistantStore((state) => state.setSelectedClusterId)
  const queueQuickPrompt = useAiAssistantStore((state) => state.queueQuickPrompt)

  const clustersQuery = trpc.clusters.list.useQuery()

  const selectedCluster =
    clustersQuery.data?.find((cluster) => cluster.id === selectedClusterId) ?? null

  useEffect(() => {
    if (!clustersQuery.data || clustersQuery.data.length === 0) return

    if (
      !selectedClusterId ||
      !clustersQuery.data.some((cluster) => cluster.id === selectedClusterId)
    ) {
      setSelectedClusterId(clustersQuery.data[0].id)
    }
  }, [clustersQuery.data, selectedClusterId, setSelectedClusterId])

  const analysisQuery = trpc.ai.analyze.useQuery(
    { clusterId: selectedClusterId ?? '' },
    {
      enabled: Boolean(selectedClusterId),
      refetchOnWindowFocus: false,
    },
  )

  const recommendations: Recommendation[] =
    analysisQuery.data?.recommendations.map((recommendation, index) => ({
      id: `${recommendation.severity}-${recommendation.title}-${index}`,
      title: recommendation.title,
      description: recommendation.description,
      action: recommendation.action,
      severity: recommendation.severity,
    })) ?? []

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
                value={selectedClusterId ?? ''}
                onChange={(event) => setSelectedClusterId(event.target.value)}
                disabled={!clustersQuery.data || clustersQuery.data.length === 0}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
              >
                {clustersQuery.data?.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.name}
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

            {analysisQuery.data && selectedCluster && (
              <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                Live health score for {selectedCluster.name}: {analysisQuery.data.score}/100
              </p>
            )}

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
                    disabled={!selectedClusterId}
                    onClick={() => {
                      queueQuickPrompt({ id: `${action.key}-${Date.now()}`, text: action.prompt })
                      toast.success(`${action.label} queued`)
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.04] disabled:opacity-60"
                  >
                    {icon}
                    {action.label}
                  </button>
                )
              })}
            </div>
          </header>

          {(clustersQuery.isLoading || analysisQuery.isLoading) && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 text-sm text-[var(--color-text-dim)]">
              Loading AI assistant data...
            </div>
          )}

          {(clustersQuery.error || analysisQuery.error) && (
            <div className="rounded-2xl border border-[var(--color-status-error)]/40 bg-[var(--color-status-error)]/10 p-4 text-sm text-[var(--color-status-error)]">
              Failed to load AI assistant data. Please retry.
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <AiChat
              key={selectedCluster?.id ?? 'no-cluster'}
              selectedClusterId={selectedCluster?.id ?? null}
              selectedClusterName={selectedCluster?.name ?? null}
            />
            <RecommendationsPanel
              key={selectedCluster?.id ?? 'no-cluster'}
              clusterId={selectedCluster?.id ?? null}
              initialItems={recommendations}
            />
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  )
}
