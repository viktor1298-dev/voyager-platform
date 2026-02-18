'use client'

import { BrainCircuit, Lightbulb, Lock, Settings, Stethoscope } from 'lucide-react'
import Link from 'next/link'
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

  const [hasByokKey, setHasByokKey] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getAiKeySettings().then((settings) => {
      if (cancelled) return
      setHasByokKey(Boolean(settings?.hasKey || settings?.maskedKey))
    })

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
      const fallbackClusterId = String(clustersQuery.data[0].id)
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
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
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
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  🟢 FREE Tier Analytics
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Health score, snapshot insights, and recommendations are always available.
                </p>
              </div>

              {hasByokKey ? (
                <AiChat
                  key={selectedCluster?.id ?? 'no-cluster'}
                  selectedClusterId={selectedCluster?.id ?? null}
                  selectedClusterName={selectedCluster?.name ?? null}
                />
              ) : (
                <div className="rounded-2xl border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-status-warning)]">
                    <Lock className="h-4 w-4" />🔵 AI Chat Locked (BYOK)
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Add your API key in Settings to unlock AI Chat.
                  </p>
                  <Link
                    href="/settings"
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04]"
                  >
                    <Settings className="h-4 w-4" />
                    Open Settings
                  </Link>
                </div>
              )}
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
