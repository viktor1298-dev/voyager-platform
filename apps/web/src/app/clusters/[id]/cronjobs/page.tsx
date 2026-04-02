'use client'

import { Clock, GitFork, List, Play, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs } from '@/components/expandable'
import { RelatedResourceLink, ResourcePageScaffold } from '@/components/resource'
import { RelationsTab } from '@/components/resource/RelationsTab'
import dynamic from 'next/dynamic'
const ResourceDiff = dynamic(
  () => import('@/components/resource/ResourceDiff').then((m) => ({ default: m.ResourceDiff })),
  { ssr: false },
)
const YamlViewer = dynamic(
  () => import('@/components/resource/YamlViewer').then((m) => ({ default: m.YamlViewer })),
  { ssr: false },
)
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
import { trpc } from '@/lib/trpc'
import { LiveTimeAgo } from '@/components/shared/LiveTimeAgo'
import { usePageTitle } from '@/hooks/usePageTitle'

interface CronJobData {
  name: string
  namespace: string
  schedule: string
  suspend: boolean
  lastScheduleTime: string | null
  lastSuccessfulTime: string | null
  age: string
  timezone: string | null
  concurrencyPolicy: string
  startingDeadlineSeconds: number | null
  successfulJobsHistoryLimit: number
  failedJobsHistoryLimit: number
  activeJobs: number
}

function CronJobSummary({ cj }: { cj: CronJobData }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-mono font-semibold text-[13px] text-[var(--color-text-primary)] truncate">
        {cj.name}
      </span>
      <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-accent)] shrink-0">
        {cj.schedule}
      </span>
      {cj.suspend && <ResourceStatusBadge status="Suspended" size="sm" />}
      {cj.activeJobs > 0 && <ResourceStatusBadge status="Running" size="sm" />}
      <span className="text-[11px] font-mono text-[var(--color-text-secondary)] shrink-0">
        <LiveTimeAgo date={cj.lastScheduleTime} />
      </span>
      <span className="ml-auto text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        {cj.age}
      </span>
    </div>
  )
}

function CronJobExpandedDetail({ cj, clusterId }: { cj: CronJobData; clusterId: string }) {
  const tabs = [
    {
      id: 'jobs',
      label: 'Jobs',
      icon: <Play className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Active Jobs</span>
            <span className="text-[var(--color-text-primary)]">{cj.activeJobs}</span>
            <span className="text-[var(--color-text-muted)]">Last Scheduled</span>
            <span className="text-[var(--color-text-primary)]">
              <LiveTimeAgo date={cj.lastScheduleTime} />
            </span>
            <span className="text-[var(--color-text-muted)]">Last Successful</span>
            <span className="text-[var(--color-text-primary)]">
              <LiveTimeAgo date={cj.lastSuccessfulTime} />
            </span>
          </div>
          <div className="pt-2 border-t border-[var(--color-border)]/30">
            <RelatedResourceLink
              tab="jobs"
              resourceKey={`${cj.namespace}/${cj.name}`}
              label={`View jobs from ${cj.name}`}
              icon={<Play className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'schedule',
      label: 'Schedule',
      icon: <Clock className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Cron Expression</span>
          <span className="text-[var(--color-accent)] font-bold">{cj.schedule}</span>
          <span className="text-[var(--color-text-muted)]">Timezone</span>
          <span className="text-[var(--color-text-primary)]">{cj.timezone ?? 'UTC (default)'}</span>
          <span className="text-[var(--color-text-muted)]">Concurrency</span>
          <span className="text-[var(--color-text-primary)]">{cj.concurrencyPolicy}</span>
          <span className="text-[var(--color-text-muted)]">Starting Deadline</span>
          <span className="text-[var(--color-text-primary)]">
            {cj.startingDeadlineSeconds ? `${cj.startingDeadlineSeconds}s` : '---'}
          </span>
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Suspend</span>
          <span className={cj.suspend ? 'text-red-400' : 'text-emerald-400'}>
            {cj.suspend ? 'Yes' : 'No'}
          </span>
          <span className="text-[var(--color-text-muted)]">Success History Limit</span>
          <span className="text-[var(--color-text-primary)]">{cj.successfulJobsHistoryLimit}</span>
          <span className="text-[var(--color-text-muted)]">Failed History Limit</span>
          <span className="text-[var(--color-text-primary)]">{cj.failedJobsHistoryLimit}</span>
        </div>
      ),
    },
    {
      id: 'relations',
      label: 'Relations',
      icon: <GitFork className="h-3.5 w-3.5" />,
      content: (
        <RelationsTab
          clusterId={clusterId}
          kind="CronJob"
          namespace={cj.namespace}
          name={cj.name}
        />
      ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="cronjobs"
          resourceName={cj.name}
          namespace={cj.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="cronjobs"
          resourceName={cj.name}
          namespace={cj.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`cj-${cj.namespace}-${cj.name}`} tabs={tabs} />
}

export default function CronJobsPage() {
  usePageTitle('CronJobs')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const cronjobs = useClusterResources<CronJobData>(resolvedId, 'cronjobs')
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = cronjobs.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<CronJobData>
      title="CronJobs"
      icon={<Clock className="h-5 w-5 text-[var(--color-text-muted)]" />}
      queryResult={{ data: cronjobs, isLoading, error: null }}
      getNamespace={(cj) => cj.namespace}
      getKey={(cj) => `${cj.namespace}/${cj.name}`}
      filterFn={(cj, q) =>
        cj.name.toLowerCase().includes(q) ||
        cj.namespace.toLowerCase().includes(q) ||
        cj.schedule.toLowerCase().includes(q)
      }
      renderSummary={(cj) => <CronJobSummary cj={cj} />}
      renderDetail={(cj) => <CronJobExpandedDetail cj={cj} clusterId={resolvedId} />}
      searchPlaceholder="Search cronjobs..."
    />
  )
}
