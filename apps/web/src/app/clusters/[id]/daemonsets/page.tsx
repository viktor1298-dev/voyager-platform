'use client'

import { BarChart3, Box, CircleCheck, Layers, RotateCw, Tag, Trash2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, TagPills } from '@/components/expandable'
import {
  ActionToolbar,
  DeleteConfirmDialog,
  RelatedPodsList,
  ResourceDiff,
  ResourcePageScaffold,
  RestartConfirmDialog,
  YamlViewer,
} from '@/components/resource'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface DaemonSetData {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  updated: number
  available: number
  unavailable: number
  age: string
  nodeSelector: Record<string, string>
  tolerations: { key: string; operator: string; value: string; effect: string }[]
  selector: Record<string, string>
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function DaemonSetSummary({ ds }: { ds: DaemonSetData }) {
  const isReady = ds.desired === ds.ready
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-mono font-semibold text-[13px] text-[var(--color-text-primary)] truncate">
        {ds.name}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: isReady ? 'var(--color-status-active)' : 'var(--color-status-warning)',
            background: `color-mix(in srgb, ${isReady ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 12%, transparent)`,
          }}
        >
          {ds.ready}/{ds.desired}
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{
            color: isReady ? 'var(--color-status-active)' : 'var(--color-status-warning)',
            background: `color-mix(in srgb, ${isReady ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 10%, transparent)`,
          }}
        >
          {isReady ? 'Ready' : 'Updating'}
        </span>
      </div>
      <span className="ml-auto text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        {ds.age}
      </span>
    </div>
  )
}

function DaemonSetExpandedDetail({ ds, clusterId }: { ds: DaemonSetData; clusterId: string }) {
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const utils = trpc.useUtils()
  const restartMutation = trpc.daemonSets.restart.useMutation({
    onSuccess: () => {
      toast.success(`DaemonSet ${ds.name} restarted`)
      utils.daemonSets.list.invalidate({ clusterId })
      setRestartDialogOpen(false)
    },
    onError: (err) => toast.error(`Restart failed: ${err.message}`),
  })
  const deleteMutation = trpc.daemonSets.delete.useMutation({
    onSuccess: () => {
      toast.success(`DaemonSet ${ds.name} deleted`)
      utils.daemonSets.list.invalidate({ clusterId })
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
        resourceType="DaemonSet"
        resourceName={ds.name}
        podCount={ds.desired}
        onConfirm={() =>
          restartMutation.mutate({
            name: ds.name,
            namespace: ds.namespace,
            clusterId,
          })
        }
        isRestarting={restartMutation.isPending}
      />
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        resourceType="DaemonSet"
        resourceName={ds.name}
        namespace={ds.namespace}
        onConfirm={() =>
          deleteMutation.mutate({
            name: ds.name,
            namespace: ds.namespace,
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
      content: <RelatedPodsList clusterId={clusterId} matchLabels={ds.selector} />,
    },
    {
      id: 'status',
      label: 'Status',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Desired', value: ds.desired },
            { label: 'Current', value: ds.current },
            { label: 'Ready', value: ds.ready },
            { label: 'Updated', value: ds.updated },
            { label: 'Available', value: ds.available },
            { label: 'Unavailable', value: ds.unavailable },
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
              </p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'selectors',
      label: 'Selectors',
      icon: <Tag className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-4">
          {Object.keys(ds.nodeSelector).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Node Selector
              </p>
              <TagPills tags={ds.nodeSelector} />
            </div>
          )}
          {ds.tolerations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Tolerations ({ds.tolerations.length})
              </p>
              <div className="space-y-1">
                {ds.tolerations.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-md"
                  >
                    <span className="text-[var(--color-accent)]">{t.key}</span>
                    <span className="text-[var(--color-text-muted)]/60">{t.operator}</span>
                    {t.value && (
                      <span className="text-[var(--color-text-secondary)]">{t.value}</span>
                    )}
                    <span className="ml-auto px-1 py-px rounded text-[9px] bg-amber-500/10 text-amber-400 font-semibold">
                      {t.effect}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(ds.nodeSelector).length === 0 && ds.tolerations.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No node selectors or tolerations defined.
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
        ds.conditions.length > 0 ? (
          <ConditionsList conditions={ds.conditions} />
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
          resourceType="daemonsets"
          resourceName={ds.name}
          namespace={ds.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="daemonsets"
          resourceName={ds.name}
          namespace={ds.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`ds-${ds.namespace}-${ds.name}`} tabs={tabs} actions={actions} />
}

export default function DaemonSetsPage() {
  usePageTitle('DaemonSets')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const daemonsets = useClusterResources<DaemonSetData>(resolvedId, 'daemonsets')
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = daemonsets.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<DaemonSetData>
      title="DaemonSets"
      icon={<Layers className="h-5 w-5 text-[var(--color-text-muted)]" />}
      queryResult={{ data: daemonsets, isLoading, error: null }}
      getNamespace={(ds) => ds.namespace}
      getKey={(ds) => `${ds.namespace}/${ds.name}`}
      filterFn={(ds, q) =>
        ds.name.toLowerCase().includes(q) ||
        ds.namespace.toLowerCase().includes(q) ||
        (ds.desired === ds.ready ? 'ready' : 'updating').includes(q)
      }
      renderSummary={(ds) => <DaemonSetSummary ds={ds} />}
      renderDetail={(ds) => <DaemonSetExpandedDetail ds={ds} clusterId={resolvedId} />}
      searchPlaceholder="Search daemonsets..."
    />
  )
}
