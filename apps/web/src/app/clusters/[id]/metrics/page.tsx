'use client'

import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { MetricsTimeSeriesPanel } from '@/components/metrics/MetricsTimeSeriesPanel'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function MetricsPage() {
  usePageTitle('Cluster Metrics')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: resolvedId },
    { enabled: isLive, retry: false, staleTime: 30000 },
  )
  const effectiveIsLive = isLive && !liveQuery.isError

  return <MetricsTimeSeriesPanel clusterId={resolvedId} isLive={effectiveIsLive} />
}
