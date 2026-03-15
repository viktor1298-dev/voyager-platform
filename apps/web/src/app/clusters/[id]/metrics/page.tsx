'use client'

import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { MetricsTimeSeriesPanel } from '@/components/metrics/MetricsTimeSeriesPanel'
import { trpc } from '@/lib/trpc'

export default function MetricsPage() {
  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: resolvedId },
    { enabled: isLive, refetchInterval: 60000, retry: false, staleTime: 30000 },
  )
  const effectiveIsLive = isLive && !liveQuery.isError

  return <MetricsTimeSeriesPanel clusterId={resolvedId} isLive={effectiveIsLive} />
}
