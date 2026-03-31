'use client'

import {
  BarChart3,
  Box,
  CircleCheck,
  Database,
  HardDrive,
  RotateCw,
  Scaling,
  Trash2,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs } from '@/components/expandable'
import {
  ActionToolbar,
  DeleteConfirmDialog,
  RelatedPodsList,
  ResourceDiff,
  ResourcePageScaffold,
  RestartConfirmDialog,
  ScaleInput,
  YamlViewer,
} from '@/components/resource'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
import { trpc } from '@/lib/trpc'
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { usePageTitle } from '@/hooks/usePageTitle'

interface StatefulSetData {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  currentReplicas: number
  updatedReplicas: number
  image: string
  age: string
  volumeClaimTemplates: {
    name: string
    storageClass: string
    size: string
    accessModes: string[]
  }[]
  selector: Record<string, string>
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function StatefulSetSummary({ ss }: { ss: StatefulSetData }) {
  const allReady = ss.readyReplicas === ss.replicas && ss.replicas > 0
  const statusLabel = allReady ? 'Running' : ss.readyReplicas === 0 ? 'Pending' : 'Scaling'

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {ss.name}
      </span>
      <span
        className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
        style={{
          color: allReady ? 'var(--color-status-active)' : 'var(--color-status-warning)',
          background: `color-mix(in srgb, ${allReady ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 12%, transparent)`,
        }}
      >
        {ss.readyReplicas}/{ss.replicas}
      </span>
      <ResourceStatusBadge status={statusLabel} size="sm" />
      <span
        className="text-xs font-mono text-[var(--color-text-muted)] max-w-[180px] truncate shrink-0"
        title={ss.image}
      >
        {ss.image}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">{ss.age}</span>
    </div>
  )
}

function StatefulSetExpandedDetail({ ss, clusterId }: { ss: StatefulSetData; clusterId: string }) {
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scaleOpen, setScaleOpen] = useState(false)

  const utils = trpc.useUtils()
  const restartMutation = trpc.statefulSets.restart.useMutation({
    onSuccess: () => {
      toast.success(`StatefulSet ${ss.name} restarted`)
      utils.statefulSets.list.invalidate({ clusterId })
      setRestartDialogOpen(false)
    },
    onError: (err) => toast.error(`Restart failed: ${err.message}`),
  })
  const scaleMutation = trpc.statefulSets.scale.useMutation({
    onSuccess: (data) => {
      toast.success(`Scaled ${ss.name} to ${data.replicas} replicas`)
      utils.statefulSets.list.invalidate({ clusterId })
      setScaleOpen(false)
    },
    onError: (err) => toast.error(`Scale failed: ${err.message}`),
  })
  const deleteMutation = trpc.statefulSets.delete.useMutation({
    onSuccess: () => {
      toast.success(`StatefulSet ${ss.name} deleted`)
      utils.statefulSets.list.invalidate({ clusterId })
      setDeleteDialogOpen(false)
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  })

  const actions = (
    <>
      <ActionToolbar
        actions={[
          {
            id: 'restart',
            label: 'Restart',
            icon: RotateCw,
            variant: 'default',
            onClick: () => setRestartDialogOpen(true),
          },
          {
            id: 'scale',
            label: 'Scale',
            icon: Scaling,
            variant: 'default',
            onClick: () => setScaleOpen((prev) => !prev),
          },
          {
            id: 'delete',
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive',
            onClick: () => setDeleteDialogOpen(true),
          },
        ]}
      />
      <RestartConfirmDialog
        open={restartDialogOpen}
        onOpenChange={setRestartDialogOpen}
        resourceType="StatefulSet"
        resourceName={ss.name}
        podCount={ss.replicas}
        onConfirm={() =>
          restartMutation.mutate({
            name: ss.name,
            namespace: ss.namespace,
            clusterId,
          })
        }
        isRestarting={restartMutation.isPending}
      />
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        resourceType="StatefulSet"
        resourceName={ss.name}
        namespace={ss.namespace}
        onConfirm={() =>
          deleteMutation.mutate({
            name: ss.name,
            namespace: ss.namespace,
            clusterId,
          })
        }
        isDeleting={deleteMutation.isPending}
      />
    </>
  )

  const tabs = [
    {
      id: 'pods',
      label: 'Pods',
      icon: <Box className="h-3.5 w-3.5" />,
      content: <RelatedPodsList clusterId={clusterId} matchLabels={ss.selector} />,
    },
    {
      id: 'replicas',
      label: 'Replicas',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {scaleOpen && (
            <ScaleInput
              currentReplicas={ss.replicas}
              onScale={(n) =>
                scaleMutation.mutate({
                  name: ss.name,
                  namespace: ss.namespace,
                  clusterId,
                  replicas: n,
                })
              }
              isScaling={scaleMutation.isPending}
            />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ready', value: ss.readyReplicas, total: ss.replicas },
              { label: 'Current', value: ss.currentReplicas, total: ss.replicas },
              { label: 'Updated', value: ss.updatedReplicas, total: ss.replicas },
              { label: 'Desired', value: ss.replicas, total: null },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] p-3 text-center"
              >
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                  {item.label}
                </p>
                <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">
                  {item.value}
                  {item.total !== null && (
                    <span className="text-xs font-normal text-[var(--color-text-muted)]">
                      /{item.total}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'storage',
      label: 'Storage',
      icon: <HardDrive className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2">
          {ss.volumeClaimTemplates.length > 0 ? (
            ss.volumeClaimTemplates.map((vct) => (
              <div
                key={vct.name}
                className="rounded-lg border border-[var(--color-border)]/40 p-3 space-y-1"
              >
                <span className="text-[12px] font-bold font-mono text-[var(--color-text-primary)]">
                  {vct.name}
                </span>
                <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
                  <span className="text-[var(--color-text-muted)]">Storage Class</span>
                  <span className="text-[var(--color-text-secondary)]">{vct.storageClass}</span>
                  <span className="text-[var(--color-text-muted)]">Size</span>
                  <span className="text-[var(--color-accent)]">{vct.size}</span>
                  <span className="text-[var(--color-text-muted)]">Access Modes</span>
                  <span className="text-[var(--color-text-secondary)]">
                    {vct.accessModes.join(', ') || '--'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No volume claim templates defined.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content:
        ss.conditions.length > 0 ? (
          <ConditionsList conditions={ss.conditions} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No conditions reported.</p>
        ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="statefulsets"
          resourceName={ss.name}
          namespace={ss.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="statefulsets"
          resourceName={ss.name}
          namespace={ss.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`ss-${ss.namespace}-${ss.name}`} tabs={tabs} actions={actions} />
}

export default function StatefulSetsPage() {
  usePageTitle('StatefulSets')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const statefulsets = useClusterResources<StatefulSetData>(resolvedId, 'statefulsets')
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = statefulsets.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<StatefulSetData>
      title="StatefulSets"
      icon={<Database className="h-5 w-5" />}
      queryResult={{ data: statefulsets, isLoading, error: null }}
      getNamespace={(ss) => ss.namespace}
      getKey={(ss) => `${ss.namespace}/${ss.name}`}
      filterFn={(ss, q) =>
        ss.name.toLowerCase().includes(q) || ss.namespace.toLowerCase().includes(q)
      }
      renderSummary={(ss) => <StatefulSetSummary ss={ss} />}
      renderDetail={(ss) => <StatefulSetExpandedDetail ss={ss} clusterId={resolvedId} />}
      searchPlaceholder="Search statefulsets..."
      emptyMessage="No StatefulSets found"
    />
  )
}
