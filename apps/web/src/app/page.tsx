'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { ClusterCard } from '@/components/dashboard/ClusterCard'
import { DashboardFilterChips } from '@/components/dashboard/DashboardFilterChips'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'
import { EnvironmentGroup } from '@/components/dashboard/EnvironmentGroup'
import { KpiStrip } from '@/components/dashboard/KpiStrip'
import { getClusterEnvironment, getClusterTags, type ClusterEnvironment } from '@/lib/cluster-meta'
import { DB_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { trpc } from '@/lib/trpc'
import { useClusterContext } from '@/stores/cluster-context'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'

interface ClusterCardData {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  runningPods: number
  totalPods: number
  source: 'live' | 'db'
  environment: ClusterEnvironment
  tags: string[]
}

type HealthGroup = 'healthy' | 'degraded' | 'critical'
const ENV_ORDER: ClusterEnvironment[] = ['prod', 'staging', 'dev']

function getHealthGroup(status: string | null | undefined): HealthGroup {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') return 'healthy'
  if (s === 'warning' || s === 'degraded') return 'degraded'
  return 'critical'
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  usePageTitle('Dashboard')

  // --- Filters ---
  const [envFilter, setEnvFilter] = useState<'all' | ClusterEnvironment>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')

  useEffect(() => {
    const env = searchParams.get('environment')
    if (env === 'prod' || env === 'staging' || env === 'dev' || env === 'all') setEnvFilter(env)
    else if (!env) setEnvFilter('all')
  }, [searchParams])

  const changeEnvFilter = useCallback(
    (env: 'all' | ClusterEnvironment) => {
      const next = new URLSearchParams(searchParams.toString())
      if (env === 'all') next.delete('environment')
      else next.set('environment', env)
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
      setEnvFilter(env)
    },
    [searchParams, router, pathname],
  )

  // --- Data fetching ---
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    { enabled: Boolean(activeClusterId) },
  )
  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: DB_CLUSTER_REFETCH_MS,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  // --- Merge live + DB clusters ---
  const clusterList = useMemo<ClusterCardData[]>(() => {
    const list: ClusterCardData[] = []
    if (liveData) {
      list.push({
        id: activeClusterId ?? 'live',
        name: liveData.name,
        provider: liveData.provider,
        version: liveData.version,
        status: liveData.status,
        nodeCount: liveData.nodes.length,
        runningPods: liveData.runningPods ?? 0,
        totalPods: liveData.totalPods ?? 0,
        source: 'live',
        environment: getClusterEnvironment(liveData.name, liveData.provider),
        tags: getClusterTags({ name: liveData.name, provider: liveData.provider, source: 'live' }),
      })
    }
    for (const c of dbClusters) {
      if (liveData && (c.name === liveData.name || c.name === 'minikube-dev')) continue
      list.push({
        id: c.id,
        name: c.name,
        provider: typeof c.provider === 'string' ? c.provider : 'unknown',
        version: typeof c.version === 'string' ? c.version : null,
        status: typeof c.status === 'string' ? c.status : null,
        nodeCount: c.nodeCount,
        runningPods: 0, // DB-only clusters don't have live pod counts
        totalPods: 0,
        source: 'db',
        environment: getClusterEnvironment(c.name, c.provider),
        tags: getClusterTags({ name: c.name, provider: c.provider, source: 'db' }),
      })
    }
    return list
  }, [liveData, dbClusters, activeClusterId])

  // --- Aggregates ---
  const totalNodes = useMemo(
    () => clusterList.reduce((sum, c) => sum + c.nodeCount, 0),
    [clusterList],
  )
  const runningPods = liveData?.runningPods ?? 0
  const totalPods = liveData?.totalPods ?? 0
  const warningEvents = liveData?.events.filter((e) => e.type === 'Warning').length ?? 0

  const healthCounts = useMemo(() => {
    const counts = { healthy: 0, degraded: 0, critical: 0 }
    for (const c of clusterList) counts[getHealthGroup(c.status)]++
    return counts
  }, [clusterList])

  const envCounts = useMemo(
    () => ({
      all: clusterList.length,
      prod: clusterList.filter((c) => c.environment === 'prod').length,
      staging: clusterList.filter((c) => c.environment === 'staging').length,
      dev: clusterList.filter((c) => c.environment === 'dev').length,
    }),
    [clusterList],
  )

  // --- Derived filter options ---
  const statusOptions = useMemo(
    () => [...new Set(clusterList.map((c) => (c.status ?? 'unknown').toLowerCase()))].sort(),
    [clusterList],
  )
  const providerOptions = useMemo(
    () => [...new Set(clusterList.map((c) => c.provider))].sort(),
    [clusterList],
  )

  // --- Filter ---
  const visibleClusters = useMemo(() => {
    return clusterList.filter((c) => {
      if (envFilter !== 'all' && c.environment !== envFilter) return false
      if (statusFilter !== 'all' && (c.status ?? 'unknown').toLowerCase() !== statusFilter)
        return false
      if (providerFilter !== 'all' && c.provider !== providerFilter) return false
      return true
    })
  }, [clusterList, envFilter, statusFilter, providerFilter])

  const groupedByEnv = useMemo(() => {
    const groups: Record<ClusterEnvironment, ClusterCardData[]> = { prod: [], staging: [], dev: [] }
    for (const c of visibleClusters) groups[c.environment].push(c)
    return groups
  }, [visibleClusters])

  if (isLoading) {
    return (
      <AppLayout>
        <PageTransition>
          <DashboardSkeleton />
        </PageTransition>
      </AppLayout>
    )
  }

  let cardIndex = 0

  return (
    <AppLayout>
      <PageTransition>
        <KpiStrip
          clusterCount={clusterList.length}
          totalNodes={totalNodes}
          runningPods={runningPods}
          totalPods={totalPods}
          warningEvents={warningEvents}
          healthCounts={healthCounts}
          isLoading={false}
        />

        <DashboardFilterChips
          activeEnv={envFilter}
          onEnvChange={changeEnvFilter}
          envCounts={envCounts}
          statusOptions={statusOptions}
          providerOptions={providerOptions}
          activeStatus={statusFilter}
          activeProvider={providerFilter}
          onStatusChange={setStatusFilter}
          onProviderChange={setProviderFilter}
        />

        <AnimatePresence mode="popLayout">
          {ENV_ORDER.map((env) => {
            const clusters = groupedByEnv[env]
            return (
              <EnvironmentGroup key={env} environment={env} clusterCount={clusters.length}>
                <div className="grid gap-2.5 px-1 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                  {clusters.map((cluster) => (
                    <ClusterCard key={cluster.id} index={cardIndex++} {...cluster} />
                  ))}
                </div>
              </EnvironmentGroup>
            )
          })}
        </AnimatePresence>
      </PageTransition>
    </AppLayout>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <DashboardSkeleton />
        </AppLayout>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
