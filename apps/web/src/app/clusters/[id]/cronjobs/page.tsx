'use client'

import { Clock, List, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
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
      {cj.suspend && (
        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 shrink-0">
          Suspended
        </span>
      )}
      {cj.activeJobs > 0 && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 shrink-0">
          {cj.activeJobs} active
        </span>
      )}
      <span className="text-[11px] font-mono text-[var(--color-text-secondary)] shrink-0">
        {cj.lastScheduleTime ? timeAgo(cj.lastScheduleTime) : '---'}
      </span>
      <span className="ml-auto text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        {cj.age}
      </span>
    </div>
  )
}

function CronJobExpandedDetail({ cj }: { cj: CronJobData }) {
  const tabs = [
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
      id: 'jobs',
      label: 'Jobs',
      icon: <List className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Active Jobs</span>
          <span className="text-[var(--color-text-primary)]">{cj.activeJobs}</span>
          <span className="text-[var(--color-text-muted)]">Last Scheduled</span>
          <span className="text-[var(--color-text-primary)]">
            {cj.lastScheduleTime ? timeAgo(cj.lastScheduleTime) : '---'}
          </span>
          <span className="text-[var(--color-text-muted)]">Last Successful</span>
          <span className="text-[var(--color-text-primary)]">
            {cj.lastSuccessfulTime ? timeAgo(cj.lastSuccessfulTime) : '---'}
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
  ]

  return <DetailTabs id={`cj-${cj.namespace}-${cj.name}`} tabs={tabs} />
}

export default function CronJobsPage() {
  usePageTitle('CronJobs')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.cronJobs.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
      </div>
    )
  }

  return (
    <ResourcePageScaffold<CronJobData>
      title="CronJobs"
      icon={<Clock className="h-5 w-5 text-[var(--color-text-muted)]" />}
      queryResult={query}
      getNamespace={(cj) => cj.namespace}
      getKey={(cj) => `${cj.namespace}/${cj.name}`}
      filterFn={(cj, q) =>
        cj.name.toLowerCase().includes(q) ||
        cj.namespace.toLowerCase().includes(q) ||
        cj.schedule.toLowerCase().includes(q)
      }
      renderSummary={(cj) => <CronJobSummary cj={cj} />}
      renderDetail={(cj) => <CronJobExpandedDetail cj={cj} />}
      searchPlaceholder="Search cronjobs..."
    />
  )
}
