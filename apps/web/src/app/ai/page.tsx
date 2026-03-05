'use client'

import { BrainCircuit, Lightbulb, Stethoscope } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { AiChat } from '@/components/ai/AiChat'
import { type Recommendation, RecommendationsPanel } from '@/components/ai/RecommendationsPanel'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getAiKeySettings } from '@/lib/ai-keys-client'
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

  const trpcUtils = trpc.useUtils()

  const [byokState, setByokState] = useState<'checking' | 'locked' | 'unlocked'>('checking')
  const hasByokKey = byokState === 'unlocked'

  useEffect(() => {
    let cancelled = false

    const resolveByokState = async () => {
      setByokState('checking')
      try {
        const settings = await getAiKeySettings()
        if (cancelled) return

        if (!settings?.hasKey || !settings.provider) {
          setByokState('locked')
          return
        }

        // Key exists in DB — unlock immediately (don't require connection test)
        setByokState('unlocked')
      } catch {
        if (!cancelled) setByokState('locked')
      }
    }

    void resolveByokState()

    return () => {
      cancelled = true
    }
  }, [])

  const clustersQuery = trpc.clusters.list.useQuery()

  const selectedCluster =
    clustersQuery.data?.find((cluster) => String(cluster.id) === selectedClusterId) ?? null

  useEffect(() => {
    if (!clustersQuery.data || clustersQuery.data.length === 0) return

    const selectedExists = selectedClusterId
      ? clustersQuery.data.some((cluster) => String(cluster.id) === selectedClusterId)
      : false

    if (!selectedExists) {
      const healthyCluster = clustersQuery.data.find((c) => c.healthStatus === 'healthy') ?? clustersQuery.data[0]
      const fallbackClusterId = String(healthyCluster.id)
      if (fallbackClusterId !== selectedClusterId) {
        setSelectedClusterId(fallbackClusterId)
      }
    }
  }, [clustersQuery.data, selectedClusterId, setSelectedClusterId])

  const analysisQuery = trpc.ai.analyze.useQuery(
    { clusterId: selectedClusterId ?? '' },
    {
      enabled: Boolean(selectedClusterId),
      refetchOnWindowFocus: false,
    },
  )

  const recommendations: Recommendation[] = useMemo(
    () =>
      analysisQuery.data?.recommendations.map((recommendation, index) => ({
        id: `${recommendation.severity}-${recommendation.title}-${index}`,
        title: recommendation.title,
        description: recommendation.description,
        action: recommendation.action,
        severity: recommendation.severity,
      })) ?? [],
    [analysisQuery.data?.recommendations],
  )

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
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
              >
                {clustersQuery.data?.map((cluster) => (
                  <option key={cluster.id} value={String(cluster.id)}>
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
              Read-only cluster intelligence: health score, recommendations, and event reasoning.
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
                    disabled={!selectedClusterId || !hasByokKey}
                    onClick={() => {
                      if (!hasByokKey) {
                        toast.warning('Add your API key in Settings to unlock AI Chat')
                        return
                      }
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
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-status-error)]/40 bg-[var(--color-status-error)]/10 p-4 text-sm text-[var(--color-status-error)]">
              <span>Failed to load AI assistant data. Please retry.</span>
              <button
                type="button"
                onClick={() => {
                  void Promise.all([
                    clustersQuery.refetch(),
                    selectedClusterId
                      ? trpcUtils.ai.analyze.invalidate({ clusterId: selectedClusterId })
                      : Promise.resolve(),
                  ])
                }}
                className="rounded-lg border border-[var(--color-status-error)]/40 px-2 py-1 text-xs hover:bg-[var(--color-status-error)]/10"
              >
                Retry
              </button>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <section className="space-y-3">
              {/* Cluster context banner */}
              {selectedCluster && (
                <div className="rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center">
                      <BrainCircuit className="h-5 w-5 text-[var(--color-accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Analyzing: {selectedCluster.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {analysisQuery.data ? `Health score: ${analysisQuery.data.score}/100` : 'Health score, insights, and recommendations available'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <AiChat
                key={selectedCluster?.id ?? 'no-cluster'}
                selectedClusterId={selectedCluster?.id ?? null}
                selectedClusterName={selectedCluster?.name ?? null}
                locked={!hasByokKey}
                lockMessage={
                  byokState === 'checking'
                    ? 'Verifying saved BYOK key status...'
                    : 'Add a valid saved API key in Settings to unlock AI Chat'
                }
              />

              {/* Lock state is rendered directly in AiChat */}
            </section>

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
