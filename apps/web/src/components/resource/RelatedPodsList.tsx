'use client'

import { Box } from 'lucide-react'
import { useMemo } from 'react'
import { useClusterResources } from '@/hooks/useResources'
import { RelatedResourceLink } from './RelatedResourceLink'

interface PodItem {
  name: string
  namespace: string
  status: string
  labels: Record<string, string>
}

interface RelatedPodsListProps {
  clusterId: string
  matchLabels: Record<string, string>
  title?: string
}

function statusDot(status: string): string {
  if (status === 'Running' || status === 'Succeeded') return 'bg-[var(--color-status-active)]'
  if (status === 'Pending') return 'bg-[var(--color-status-warning)]'
  return 'bg-[var(--color-status-error)]'
}

/**
 * Reusable list of pods matching label selectors.
 * Reads pods from Zustand store (SSE-fed via useResourceSSE in cluster layout).
 * Each pod links to the Pods tab with highlight query param.
 */
export function RelatedPodsList({
  clusterId,
  matchLabels,
  title = 'Related Pods',
}: RelatedPodsListProps) {
  const pods = useClusterResources<PodItem>(clusterId, 'pods')

  const matchingPods = useMemo(() => {
    if (Object.keys(matchLabels).length === 0) return []
    return pods.filter((pod) =>
      Object.entries(matchLabels).every(([key, value]) => pod.labels?.[key] === value),
    )
  }, [pods, matchLabels])

  if (matchingPods.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-[11px] text-[var(--color-text-muted)]">
        <Box className="h-3.5 w-3.5" />
        <span>No matching pods found</span>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
        {title} ({matchingPods.length})
      </p>
      {matchingPods.map((pod) => (
        <div key={`${pod.namespace}/${pod.name}`} className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(pod.status)}`} />
          <RelatedResourceLink
            tab="pods"
            resourceKey={`${pod.namespace}/${pod.name}`}
            label={pod.name}
          />
          <span
            className="text-[10px] font-mono px-1 py-0.5 rounded shrink-0"
            style={{
              color:
                pod.status === 'Running' || pod.status === 'Succeeded'
                  ? 'var(--color-status-active)'
                  : pod.status === 'Pending'
                    ? 'var(--color-status-warning)'
                    : 'var(--color-status-error)',
              background: `color-mix(in srgb, ${
                pod.status === 'Running' || pod.status === 'Succeeded'
                  ? 'var(--color-status-active)'
                  : pod.status === 'Pending'
                    ? 'var(--color-status-warning)'
                    : 'var(--color-status-error)'
              } 12%, transparent)`,
            }}
          >
            {pod.status}
          </span>
        </div>
      ))}
    </div>
  )
}
