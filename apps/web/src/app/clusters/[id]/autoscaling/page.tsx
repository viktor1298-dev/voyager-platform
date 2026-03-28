'use client'

import {
  BarChart3,
  Box,
  CircleCheck,
  Cpu,
  ExternalLink,
  Globe,
  HardDrive,
  HelpCircle,
  Image,
  Layers,
  Server,
  Settings,
  Shield,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import {
  ConditionsList,
  DetailGrid,
  DetailRow,
  DetailTabs,
  ExpandableCard,
  ResourceBar,
  TagPills,
} from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import type { KarpenterEC2NodeClass, KarpenterNodeClaim, KarpenterNodePool } from '@voyager/types'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse K8s CPU resource string to millicores */
function parseCpuMillicores(value: string): number {
  if (value.endsWith('m')) return Number.parseInt(value, 10) || 0
  const cores = Number.parseFloat(value)
  return Number.isNaN(cores) ? 0 : Math.round(cores * 1000)
}

/** Parse K8s memory resource string to MiB */
function parseMemoryMi(value: string): number {
  if (value.endsWith('Mi')) return Number.parseInt(value, 10) || 0
  if (value.endsWith('Gi')) return (Number.parseFloat(value) || 0) * 1024
  if (value.endsWith('Ki')) return Math.round((Number.parseInt(value, 10) || 0) / 1024)
  // Assume raw bytes
  const bytes = Number.parseInt(value, 10)
  return Number.isNaN(bytes) ? 0 : Math.round(bytes / 1048576)
}

/** Extract instance ID from providerID (e.g. "aws:///us-east-1a/i-0abc...") */
function parseInstanceId(providerID: string | null): string | null {
  if (!providerID) return null
  const parts = providerID.split('/')
  return parts[parts.length - 1] || null
}

/** Check if a condition list has a Ready=True condition */
function isReady(conditions: { type: string; status: string }[]): boolean {
  return conditions.some((c) => c.type === 'Ready' && c.status === 'True')
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6">
      <Icon className="h-4 w-4 text-[var(--color-accent)]" />
      <h2 className="text-[13px] font-bold text-[var(--color-text-primary)]">
        {title} <span className="font-normal text-[var(--color-text-muted)]">({count})</span>
      </h2>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string
  value: number | string
  unit?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 flex flex-col gap-1">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span className="text-2xl font-extrabold text-[var(--color-text-primary)] tabular-nums">
        {value}
        {unit && (
          <span className="text-sm font-normal text-[var(--color-text-muted)] ml-1">{unit}</span>
        )}
      </span>
    </div>
  )
}

function SectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono py-1">
      <span className="text-[var(--color-text-muted)] min-w-[120px]">{label}</span>
      <span className="text-[var(--color-text-primary)]">{value ?? '—'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NodePool expanded content
// ---------------------------------------------------------------------------

function NodePoolDetail({ pool }: { pool: KarpenterNodePool }) {
  const limitEntries = Object.entries(pool.limits)
  const resourceEntries = Object.entries(pool.status.resources)

  const tabs = [
    {
      id: 'resources',
      label: 'Resources',
      icon: <Box className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {limitEntries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Limits
              </p>
              <div className="space-y-1">
                {limitEntries.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    id={key}
                    meta={value}
                    icon={<HardDrive className="h-3.5 w-3.5" />}
                  />
                ))}
              </div>
            </div>
          )}
          {resourceEntries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Usage
              </p>
              <div className="space-y-2">
                {resourceEntries.map(([key, value]) => {
                  const limitVal = pool.limits[key]
                  if (!limitVal) {
                    return <DetailRow key={key} id={key} meta={value} />
                  }
                  const isCpu = key === 'cpu'
                  const used = isCpu ? parseCpuMillicores(value) : parseMemoryMi(value)
                  const total = isCpu ? parseCpuMillicores(limitVal) : parseMemoryMi(limitVal)
                  return (
                    <ResourceBar
                      key={key}
                      label={key}
                      used={used}
                      total={total}
                      unit={isCpu ? 'm' : 'Mi'}
                    />
                  )
                })}
              </div>
            </div>
          )}
          {limitEntries.length === 0 && resourceEntries.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No resource data available.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2">
          <KeyValueRow label="NodeClassRef" value={pool.nodeClassRef?.name ?? '—'} />
          <KeyValueRow label="Consolidation" value={pool.disruption?.consolidationPolicy ?? '—'} />
          <KeyValueRow label="Consolidate After" value={pool.disruption?.consolidateAfter ?? '—'} />
          <KeyValueRow
            label="Replicas"
            value={pool.replicas != null ? String(pool.replicas) : '—'}
          />
          {pool.disruption?.budgets && pool.disruption.budgets.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Budgets ({pool.disruption.budgets.length})
              </p>
              <div className="space-y-1">
                {pool.disruption.budgets.map((budget, i) => (
                  <div
                    key={i}
                    className="text-[11px] font-mono text-[var(--color-text-secondary)] px-2 py-1 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-lg"
                  >
                    {Object.entries(budget as Record<string, unknown>)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: <ConditionsList conditions={pool.status.conditions} />,
    },
  ]

  return <DetailTabs id={`np-${pool.name}`} tabs={tabs} />
}

// ---------------------------------------------------------------------------
// NodeClaim expanded content
// ---------------------------------------------------------------------------

function NodeClaimDetail({ claim }: { claim: KarpenterNodeClaim }) {
  const cpuReq = parseCpuMillicores(claim.resources.requests.cpu ?? '0')
  const cpuAlloc = parseCpuMillicores(claim.resources.allocatable.cpu ?? '0')
  const memReq = parseMemoryMi(claim.resources.requests.memory ?? '0')
  const memAlloc = parseMemoryMi(claim.resources.allocatable.memory ?? '0')
  const podsReq = Number.parseInt(claim.resources.requests.pods ?? '0', 10) || 0
  const podsAlloc = Number.parseInt(claim.resources.allocatable.pods ?? '0', 10) || 0

  const requirementTags: Record<string, string> = {}
  for (const req of claim.requirements) {
    requirementTags[req.key] = `${req.operator}: ${req.values.join(', ')}`
  }

  const tabs = [
    {
      id: 'resources',
      label: 'Resources',
      icon: <Box className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {cpuAlloc > 0 && <ResourceBar label="CPU" used={cpuReq} total={cpuAlloc} unit="m" />}
          {memAlloc > 0 && <ResourceBar label="Memory" used={memReq} total={memAlloc} unit="Mi" />}
          {podsAlloc > 0 && <ResourceBar label="Pods" used={podsReq} total={podsAlloc} />}
          {cpuAlloc === 0 && memAlloc === 0 && podsAlloc === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No resource data available.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2">
          <KeyValueRow label="NodePool" value={claim.nodePoolName ?? '—'} />
          <KeyValueRow label="Instance ID" value={parseInstanceId(claim.providerID) ?? '—'} />
          <KeyValueRow label="AMI ID" value={claim.imageID ?? '—'} />
          <KeyValueRow label="Expire After" value={claim.expireAfter ?? '—'} />
          {Object.keys(requirementTags).length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Requirements
              </p>
              <TagPills tags={requirementTags} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: <ConditionsList conditions={claim.conditions} />,
    },
  ]

  return <DetailTabs id={`nc-${claim.name}`} tabs={tabs} />
}

// ---------------------------------------------------------------------------
// EC2NodeClass expanded content
// ---------------------------------------------------------------------------

function EC2NodeClassDetail({ cls }: { cls: KarpenterEC2NodeClass }) {
  const tabs = [
    {
      id: 'resources',
      label: 'Resources',
      icon: <Box className="h-3.5 w-3.5" />,
      content: (
        <DetailGrid>
          {cls.status.amis.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                AMIs ({cls.status.amis.length})
              </p>
              <div className="space-y-1">
                {cls.status.amis.map((ami) => (
                  <DetailRow
                    key={ami.id}
                    icon={<Image className="h-3.5 w-3.5" />}
                    id={ami.id}
                    meta={ami.name ?? undefined}
                  />
                ))}
              </div>
            </div>
          )}
          {cls.status.subnets.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Subnets ({cls.status.subnets.length})
              </p>
              <div className="space-y-1">
                {cls.status.subnets.map((subnet) => (
                  <DetailRow
                    key={subnet.id}
                    icon={<Globe className="h-3.5 w-3.5" />}
                    id={subnet.id}
                    meta={subnet.zone ?? undefined}
                  />
                ))}
              </div>
            </div>
          )}
          {cls.status.securityGroups.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Security Groups ({cls.status.securityGroups.length})
              </p>
              <div className="space-y-1">
                {cls.status.securityGroups.map((sg) => (
                  <DetailRow
                    key={sg.id}
                    icon={<Shield className="h-3.5 w-3.5" />}
                    id={sg.id}
                    meta={sg.name ?? undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </DetailGrid>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <KeyValueRow label="Role" value={cls.role ?? '—'} />
          <KeyValueRow label="Instance Profile" value={cls.instanceProfile ?? '—'} />

          {cls.blockDeviceMappings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Block Device Mappings
              </p>
              <div className="space-y-1">
                {cls.blockDeviceMappings.map((bdm) => (
                  <div
                    key={bdm.deviceName}
                    className="text-[11px] font-mono text-[var(--color-text-secondary)] px-2 py-1.5 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-lg"
                  >
                    <span className="text-[var(--color-accent)]">{bdm.deviceName}</span>
                    {bdm.ebs.volumeSize && <span className="ml-2">{bdm.ebs.volumeSize}</span>}
                    {bdm.ebs.volumeType && (
                      <span className="ml-2 text-[var(--color-text-muted)]">
                        {bdm.ebs.volumeType}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {cls.metadataOptions && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Metadata Options
              </p>
              <div className="space-y-0.5">
                <KeyValueRow label="httpEndpoint" value={cls.metadataOptions.httpEndpoint ?? '—'} />
                <KeyValueRow label="httpTokens" value={cls.metadataOptions.httpTokens ?? '—'} />
                <KeyValueRow
                  label="hopLimit"
                  value={
                    cls.metadataOptions.httpPutResponseHopLimit != null
                      ? String(cls.metadataOptions.httpPutResponseHopLimit)
                      : '—'
                  }
                />
                <KeyValueRow label="ipv6" value={cls.metadataOptions.httpProtocolIPv6 ?? '—'} />
              </div>
            </div>
          )}

          {Object.keys(cls.tags).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Tags ({Object.keys(cls.tags).length})
              </p>
              <TagPills tags={cls.tags} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: <ConditionsList conditions={cls.status.conditions} />,
    },
  ]

  return <DetailTabs id={`ec2-${cls.name}`} tabs={tabs} />
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AutoscalingPage() {
  usePageTitle('Karpenter')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const nodePoolsQuery = trpc.karpenter.listNodePools.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false },
  )

  const nodeClaimsQuery = trpc.karpenter.listNodeClaims.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false, refetchInterval: 30000 },
  )

  const ec2ClassesQuery = trpc.karpenter.listEC2NodeClasses.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false },
  )

  const metricsQuery = trpc.karpenter.getMetrics.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false, refetchInterval: 30000 },
  )

  // ---- Loading state ----
  if (dbCluster.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  // ---- No credentials ----
  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view autoscaling configuration.
        </p>
      </div>
    )
  }

  // ---- No Karpenter installed ----
  const noKarpenter =
    !nodePoolsQuery.isLoading &&
    !ec2ClassesQuery.isLoading &&
    (nodePoolsQuery.isError || (nodePoolsQuery.data?.length ?? 0) === 0) &&
    (ec2ClassesQuery.isError || (ec2ClassesQuery.data?.length ?? 0) === 0)

  if (noKarpenter) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <HelpCircle className="h-8 w-8 text-[var(--color-text-dim)]" />
        </div>
        <p className="text-sm font-medium">No autoscaling configured</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-md text-center">
          Karpenter is not installed or has no NodePools configured for this cluster. Set up
          autoscaling to automatically provision and manage nodes based on workload demands.
        </p>
        <div className="flex items-center gap-3 mt-4">
          <a
            href="https://karpenter.sh/docs/getting-started/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Karpenter Setup Guide
          </a>
          <a
            href="https://karpenter.sh/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Documentation
          </a>
        </div>
      </div>
    )
  }

  // ---- Main content ----
  const metrics = metricsQuery.data
  const nodePools = nodePoolsQuery.data ?? []
  const nodeClaims = nodeClaimsQuery.data ?? []
  const ec2Classes = ec2ClassesQuery.data ?? []

  return (
    <div className="space-y-2">
      {/* Docs link header */}
      <div className="flex items-center justify-end">
        <a
          href="https://karpenter.sh/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Karpenter Docs
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* ---- Metrics ---- */}
      {metrics && (
        <section>
          <SectionHeading icon={BarChart3} title="Metrics" count={3} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard label="Nodes Provisioned" value={metrics.nodesProvisioned} />
            <MetricCard label="Pending Pods" value={metrics.pendingPods} />
            <MetricCard
              label="Est. Hourly Cost"
              value={`$${metrics.estimatedHourlyCostUsd.toFixed(3)}`}
            />
          </div>
        </section>
      )}

      {/* ---- NodePools ---- */}
      <section>
        <SectionHeading icon={Layers} title="NodePools" count={nodePools.length} />
        {nodePoolsQuery.isLoading ? (
          <SectionSkeleton />
        ) : nodePools.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No NodePools found.</p>
        ) : (
          <div className="space-y-2">
            {nodePools.map((pool) => {
              const ready = isReady(pool.status.conditions)
              return (
                <ExpandableCard
                  key={pool.name}
                  summary={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${ready ? 'bg-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]'}`}
                      />
                      <span className="font-mono text-[13px] font-bold text-[var(--color-text-primary)]">
                        {pool.name}
                      </span>
                      {Object.entries(pool.limits).map(([k, v]) => (
                        <span
                          key={k}
                          className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
                        >
                          {k}: {v}
                        </span>
                      ))}
                      <span className="ml-auto text-xs font-mono text-[var(--color-text-muted)]">
                        {pool.status.nodes} nodes
                      </span>
                      {pool.nodeClassRef?.name && (
                        <span className="text-xs font-mono text-[var(--color-text-dim)]">
                          → {pool.nodeClassRef.name}
                        </span>
                      )}
                    </div>
                  }
                >
                  <NodePoolDetail pool={pool} />
                </ExpandableCard>
              )
            })}
          </div>
        )}
      </section>

      {/* ---- NodeClaims ---- */}
      <section>
        <SectionHeading icon={Cpu} title="NodeClaims" count={nodeClaims.length} />
        {nodeClaimsQuery.isLoading ? (
          <SectionSkeleton />
        ) : nodeClaims.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No NodeClaims found.</p>
        ) : (
          <div className="space-y-2">
            {nodeClaims.map((claim) => {
              const ready = isReady(claim.conditions)
              return (
                <ExpandableCard
                  key={claim.name}
                  summary={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${ready ? 'bg-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]'}`}
                      />
                      <span className="font-mono text-[13px] font-bold text-[var(--color-text-primary)]">
                        {claim.name}
                      </span>
                      {claim.capacityType && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${
                            claim.capacityType === 'spot'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {claim.capacityType}
                        </span>
                      )}
                      {claim.instanceType && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/15">
                          {claim.instanceType}
                        </span>
                      )}
                      <span className="ml-auto text-xs font-mono text-[var(--color-text-muted)]">
                        {claim.zone}
                      </span>
                      {claim.nodeName && (
                        <span className="text-xs font-mono text-[var(--color-text-dim)]">
                          {claim.nodeName.split('.')[0]}
                        </span>
                      )}
                    </div>
                  }
                >
                  <NodeClaimDetail claim={claim} />
                </ExpandableCard>
              )
            })}
          </div>
        )}
      </section>

      {/* ---- EC2 Node Classes ---- */}
      <section>
        <SectionHeading icon={Server} title="EC2 Node Classes" count={ec2Classes.length} />
        {ec2ClassesQuery.isLoading ? (
          <SectionSkeleton count={2} />
        ) : ec2Classes.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No EC2 Node Classes found.</p>
        ) : (
          <div className="space-y-2">
            {ec2Classes.map((cls) => {
              const ready = isReady(cls.status.conditions)
              return (
                <ExpandableCard
                  key={cls.name}
                  summary={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${ready ? 'bg-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]'}`}
                      />
                      <span className="font-mono text-[13px] font-bold text-[var(--color-text-primary)]">
                        {cls.name}
                      </span>
                      {cls.amiFamily && (
                        <span className="text-xs font-mono text-[var(--color-text-muted)]">
                          {cls.amiFamily}
                        </span>
                      )}
                      {cls.role && (
                        <span className="ml-auto text-xs font-mono text-[var(--color-text-dim)]">
                          role: {cls.role}
                        </span>
                      )}
                    </div>
                  }
                >
                  <EC2NodeClassDetail cls={cls} />
                </ExpandableCard>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
