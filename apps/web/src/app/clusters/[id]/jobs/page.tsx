'use client'

import { CircleCheck, Clock, Play, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface JobData {
  name: string
  namespace: string
  status: string
  completions: string
  succeeded: number
  failed: number
  active: number
  parallelism: number
  completionsTotal: number
  backoffLimit: number
  activeDeadlineSeconds: number | null
  ttlSecondsAfterFinished: number | null
  startTime: string | null
  completionTime: string | null
  duration: string | null
  age: string
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function statusColor(s: string) {
  if (s === 'Complete') return 'var(--color-status-active)'
  if (s === 'Failed') return 'var(--color-status-error)'
  if (s === 'Running') return 'var(--color-status-warning)'
  return 'var(--color-text-dim)'
}

function JobSummary({ job }: { job: JobData }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-mono font-semibold text-[13px] text-[var(--color-text-primary)] truncate">
        {job.name}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-text-secondary)]">
          {job.completions}
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{
            color: statusColor(job.status),
            background: `color-mix(in srgb, ${statusColor(job.status)} 15%, transparent)`,
          }}
        >
          {job.status}
        </span>
      </div>
      {job.duration && (
        <span className="text-[11px] font-mono text-[var(--color-text-secondary)] shrink-0">
          {job.duration}
        </span>
      )}
      <span className="ml-auto text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        {job.age}
      </span>
    </div>
  )
}

function JobExpandedDetail({ job }: { job: JobData }) {
  const tabs = [
    {
      id: 'status',
      label: 'Status',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Start Time</span>
          <span className="text-[var(--color-text-primary)]">{job.startTime ?? '---'}</span>
          <span className="text-[var(--color-text-muted)]">Completion</span>
          <span className="text-[var(--color-text-primary)]">{job.completionTime ?? '---'}</span>
          <span className="text-[var(--color-text-muted)]">Duration</span>
          <span className="text-[var(--color-text-primary)]">{job.duration ?? '---'}</span>
          <span className="text-[var(--color-text-muted)]">Succeeded</span>
          <span className="text-emerald-400">{job.succeeded}</span>
          <span className="text-[var(--color-text-muted)]">Failed</span>
          <span className="text-red-400">{job.failed}</span>
          <span className="text-[var(--color-text-muted)]">Active</span>
          <span className="text-[var(--color-text-primary)]">{job.active}</span>
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Parallelism</span>
          <span className="text-[var(--color-text-primary)]">{job.parallelism}</span>
          <span className="text-[var(--color-text-muted)]">Completions</span>
          <span className="text-[var(--color-text-primary)]">{job.completionsTotal}</span>
          <span className="text-[var(--color-text-muted)]">Backoff Limit</span>
          <span className="text-[var(--color-text-primary)]">{job.backoffLimit}</span>
          <span className="text-[var(--color-text-muted)]">Active Deadline</span>
          <span className="text-[var(--color-text-primary)]">
            {job.activeDeadlineSeconds ? `${job.activeDeadlineSeconds}s` : '---'}
          </span>
          <span className="text-[var(--color-text-muted)]">TTL After Finished</span>
          <span className="text-[var(--color-text-primary)]">
            {job.ttlSecondsAfterFinished ? `${job.ttlSecondsAfterFinished}s` : '---'}
          </span>
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <Clock className="h-3.5 w-3.5" />,
      content:
        job.conditions.length > 0 ? (
          <ConditionsList conditions={job.conditions} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No conditions reported.</p>
        ),
    },
  ]

  return <DetailTabs id={`job-${job.namespace}-${job.name}`} tabs={tabs} />
}

export default function JobsPage() {
  usePageTitle('Jobs')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.jobs.list.useQuery(
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
    <ResourcePageScaffold<JobData>
      title="Jobs"
      icon={<Play className="h-5 w-5 text-[var(--color-text-muted)]" />}
      queryResult={query}
      getNamespace={(job) => job.namespace}
      getKey={(job) => `${job.namespace}/${job.name}`}
      filterFn={(job, q) =>
        job.name.toLowerCase().includes(q) ||
        job.namespace.toLowerCase().includes(q) ||
        job.status.toLowerCase().includes(q)
      }
      renderSummary={(job) => <JobSummary job={job} />}
      renderDetail={(job) => <JobExpandedDetail job={job} />}
      searchPlaceholder="Search jobs..."
    />
  )
}
