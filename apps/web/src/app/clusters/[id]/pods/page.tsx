'use client'

import { ChevronDown, Trash2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PodDetailSheet } from '@/components/PodDetailSheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

interface PodRow {
  id: string
  name: string
  namespace: string
  status: string
  createdAt: string | null
  nodeName: string | null
  cpuMillis: number | null
  memoryMi: number | null
  cpuPercent: number | null
  memoryPercent: number | null
  restartCount: number | null
  ready: string | null
}

export default function PodsPage() {
  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const isAdmin = useIsAdmin()

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: resolvedId },
    { enabled: isLive, refetchInterval: 30000, retry: false, staleTime: 30000 },
  )
  const liveFailed = isLive && liveQuery.isError
  const effectiveIsLive = isLive && !liveFailed

  const podsQuery = trpc.pods.list.useQuery(
    { clusterId: resolvedId },
    {
      enabled: effectiveIsLive,
      refetchInterval: 30000,
      // Keep stale data visible even when offline
      staleTime: 5 * 60 * 1000,
    },
  )

  const [deletePodTarget, setDeletePodTarget] = useState<PodRow | null>(null)
  const [selectedPod, setSelectedPod] = useState<PodRow | null>(null)

  const pods: PodRow[] = (podsQuery.data ?? []).map((p: Record<string, unknown>, i) => ({
    id: `pod-${i}`,
    ...p,
    restartCount: typeof p.restartCount === 'number' ? p.restartCount : null,
    ready: typeof p.ready === 'string' ? p.ready : null,
  } as PodRow))

  // When cluster has credentials but live data failed, show offline warning + last-known data
  const isOffline = isLive && liveFailed

  if (!isLive && !podsQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view pods in real time.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Offline warning banner */}
      {isOffline && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/[0.06] text-[var(--color-status-warning)]">
          <span className="text-sm">⚠️</span>
          <div>
            <p className="text-[12px] font-medium">Cluster offline</p>
            <p className="text-[11px] opacity-70">
              Showing last-known pod data.
              {podsQuery.dataUpdatedAt > 0
                ? ` Last updated ${new Date(podsQuery.dataUpdatedAt).toLocaleTimeString()}.`
                : ''}
            </p>
          </div>
        </div>
      )}

      <PodsGroupedByNamespace
        pods={pods}
        isLoading={podsQuery.isLoading}
        isAdmin={isAdmin === true}
        onDeletePod={setDeletePodTarget}
        onSelectPod={setSelectedPod}
      />

      {deletePodTarget && (
        <DeletePodDialog
          pod={deletePodTarget}
          clusterId={resolvedId}
          onClose={() => setDeletePodTarget(null)}
        />
      )}

      <PodDetailSheet
        pod={selectedPod ? { ...selectedPod, restartCount: selectedPod.restartCount ?? undefined } : null}
        open={!!selectedPod}
        onOpenChange={(open) => { if (!open) setSelectedPod(null) }}
        events={[]}
      />
    </>
  )
}

function DeletePodDialog({ pod, clusterId, onClose }: { pod: PodRow; clusterId: string; onClose: () => void }) {
  const utils = trpc.useUtils()
  const deleteMutation = trpc.pods.delete.useMutation({
    onSuccess: () => {
      toast.success(`Pod ${pod.name} deleted`)
      utils.pods.list.invalidate({ clusterId })
      onClose()
    },
    onError: (err) => toast.error(`Failed to delete pod: ${err.message}`),
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose} role="presentation">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-96 max-w-[calc(100vw-2rem)] shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">Delete Pod</h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-4 font-mono">{pod.namespace}/{pod.name}</p>
        <p className="text-[12px] text-[var(--color-text-secondary)] mb-4">
          K8s will restart it automatically.
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12px] hover:bg-white/[0.04] transition-colors">Cancel</button>
          <button type="button" onClick={() => deleteMutation.mutate({ clusterId, namespace: pod.namespace, podName: pod.name })} disabled={deleteMutation.isPending} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-600 text-white hover:opacity-90 disabled:opacity-50">
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PodsGroupedByNamespace({ pods, isLoading, isAdmin, onDeletePod, onSelectPod }: {
  pods: PodRow[]
  isLoading: boolean
  isAdmin: boolean
  onDeletePod: (pod: PodRow) => void
  onSelectPod: (pod: PodRow) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, PodRow[]>()
    for (const pod of pods) {
      const ns = pod.namespace || 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)?.push(pod)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [pods])

  if (isLoading) return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )

  if (pods.length === 0) return <p className="text-[12px] text-[var(--color-text-muted)] py-4">No pods found.</p>

  return (
    <div className="space-y-2">
      {grouped.map(([namespace, nsPods]) => (
        <NamespacePodGroup key={namespace} namespace={namespace} pods={nsPods} isAdmin={isAdmin} onDeletePod={onDeletePod} onSelectPod={onSelectPod} />
      ))}
    </div>
  )
}

function NamespacePodGroup({ namespace, pods, isAdmin, onDeletePod, onSelectPod }: {
  namespace: string; pods: PodRow[]; isAdmin: boolean; onDeletePod: (pod: PodRow) => void; onSelectPod: (pod: PodRow) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--color-text-dim)] transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-[12px] font-bold font-mono text-[var(--color-text-secondary)]">{namespace}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold">{pods.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 pl-2">
          {pods.map((pod) => {
            const statusColor = pod.status === 'Running' ? 'bg-[var(--color-status-active)]' : pod.status === 'Pending' ? 'bg-[var(--color-status-warning)]' : 'bg-[var(--color-status-error)]'
            return (
              <button key={pod.id} type="button" onClick={() => onSelectPod(pod)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
                <span className="flex-1 min-w-0 text-[13px] font-mono text-[var(--color-text-primary)] truncate">{pod.name}</span>
                {pod.ready && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${pod.ready.split('/')[0] === pod.ready.split('/')[1] ? 'bg-[var(--color-status-active)]/15 text-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}>{pod.ready}</span>}
                {pod.restartCount != null && pod.restartCount > 0 && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${pod.restartCount >= 5 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}>↻{pod.restartCount}</span>}
                <span className="text-[11px] text-[var(--color-text-secondary)]">{pod.status}</span>
                <span className="text-[11px] text-[var(--color-text-dim)] font-mono">{pod.createdAt ? timeAgo(pod.createdAt) : '—'}</span>
                {isAdmin && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDeletePod(pod) }} className="p-1 rounded hover:bg-red-500/10 text-[var(--color-text-dim)] hover:text-red-400 transition-colors" aria-label={`Delete pod ${pod.name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete pod</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </button>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
