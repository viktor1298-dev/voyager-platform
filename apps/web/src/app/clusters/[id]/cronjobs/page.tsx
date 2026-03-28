'use client'

import { Clock, List, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, ExpandableTableRow } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
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
            {cj.startingDeadlineSeconds ? `${cj.startingDeadlineSeconds}s` : '—'}
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
            {cj.lastScheduleTime ? timeAgo(cj.lastScheduleTime) : '—'}
          </span>
          <span className="text-[var(--color-text-muted)]">Last Successful</span>
          <span className="text-[var(--color-text-primary)]">
            {cj.lastSuccessfulTime ? timeAgo(cj.lastSuccessfulTime) : '—'}
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
  const cronJobs = (query.data ?? []) as CronJobData[]

  if (!hasCredentials)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
      </div>
    )
  if (query.isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  if (cronJobs.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No CronJobs found</p>
      </div>
    )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Namespace</th>
            <th className="text-left px-3 py-2.5">Schedule</th>
            <th className="text-left px-3 py-2.5">Suspend</th>
            <th className="text-left px-3 py-2.5">Last Schedule</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {cronJobs.map((cj) => (
            <ExpandableTableRow
              key={`${cj.namespace}/${cj.name}`}
              columnCount={6}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {cj.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {cj.namespace}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-accent)]">
                    {cj.schedule}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${cj.suspend ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}
                    >
                      {cj.suspend ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {cj.lastScheduleTime ? timeAgo(cj.lastScheduleTime) : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {cj.age}
                  </td>
                </>
              }
              detail={<CronJobExpandedDetail cj={cj} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
