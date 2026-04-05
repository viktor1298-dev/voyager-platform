'use client'

import { Box, CircleCheck, Clock, GitFork, Play, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs } from '@/components/expandable'
import { RelatedPodsList, ResourcePageScaffold } from '@/components/resource'
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
import { LiveTimeAgo } from '@/components/shared/LiveTimeAgo'
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
import { useRequestResourceTypes } from '@/hooks/useRequestResourceTypes'
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
  createdAt: string | null
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
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
        <ResourceStatusBadge status={job.status} size="sm" />
      </div>
      {job.duration && (
        <span className="text-[11px] font-mono text-[var(--color-text-secondary)] shrink-0">
          {job.duration}
        </span>
      )}
      <span className="ml-auto text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        <LiveTimeAgo date={job.createdAt} />
      </span>
    </div>
  )
}

function JobExpandedDetail({ job, clusterId }: { job: JobData; clusterId: string }) {
  const tabs = [
    {
      id: 'pods',
      label: 'Pods',
      icon: <Box className="h-3.5 w-3.5" />,
      content: <RelatedPodsList clusterId={clusterId} matchLabels={{ 'job-name': job.name }} />,
    },
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
    {
      id: 'relations',
      label: 'Relations',
      icon: <GitFork className="h-3.5 w-3.5" />,
      content: (
        <RelationsTab clusterId={clusterId} kind="Job" namespace={job.namespace} name={job.name} />
      ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="jobs"
          resourceName={job.name}
          namespace={job.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="jobs"
          resourceName={job.name}
          namespace={job.namespace}
        />
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
  useRequestResourceTypes(resolvedId, ['jobs'] as const)

  const jobs = useClusterResources<JobData>(resolvedId, 'jobs')
  const snapshotsReady = useSnapshotsReady(resolvedId, 'jobs')
  const isLoading = jobs.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<JobData>
      title="Jobs"
      icon={<Play className="h-5 w-5 text-[var(--color-text-muted)]" />}
      queryResult={{ data: jobs, isLoading, error: null }}
      getNamespace={(job) => job.namespace}
      getKey={(job) => `${job.namespace}/${job.name}`}
      filterFn={(job, q) =>
        job.name.toLowerCase().includes(q) ||
        job.namespace.toLowerCase().includes(q) ||
        job.status.toLowerCase().includes(q)
      }
      renderSummary={(job) => <JobSummary job={job} />}
      renderDetail={(job) => <JobExpandedDetail job={job} clusterId={resolvedId} />}
      searchPlaceholder="Search jobs..."
    />
  )
}
