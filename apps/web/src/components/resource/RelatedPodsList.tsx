'use client'

import { Box } from 'lucide-react'
import { useMemo } from 'react'
import { useClusterResources } from '@/hooks/useResources'
import { RelatedResourceLink } from './RelatedResourceLink'
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'

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
          <RelatedResourceLink
            tab="pods"
            resourceKey={`${pod.namespace}/${pod.name}`}
            label={pod.name}
          />
          <ResourceStatusBadge status={pod.status} size="sm" />
        </div>
      ))}
    </div>
  )
}
