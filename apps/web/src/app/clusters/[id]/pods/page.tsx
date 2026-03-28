'use client'

import { ChevronDown, Search, Trash2, AlertTriangle } from 'lucide-react'
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
import { usePageTitle } from '@/hooks/usePageTitle'

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
  usePageTitle('Cluster Pods')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const isAdmin = useIsAdmin()

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )
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
  const [searchQuery, setSearchQuery] = useState('')

  const pods: PodRow[] = (podsQuery.data ?? []).map(
    (p: Record<string, unknown>, i) =>
      ({
        id: `pod-${i}`,
        ...p,
        restartCount: typeof p.restartCount === 'number' ? p.restartCount : null,
        ready: typeof p.ready === 'string' ? p.ready : null,
      }) as PodRow,
  )

  const filteredPods = useMemo(() => {
    if (!searchQuery.trim()) return pods
    const q = searchQuery.toLowerCase().trim()
    return pods.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.namespace.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q),
    )
  }, [pods, searchQuery])

  // When cluster has credentials but live data failed, show offline warning + last-known data
  const isOffline = isLive && liveFailed

  if (!isLive && !podsQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <svg
            className="h-8 w-8 text-[var(--color-text-dim)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
          Connect cluster credentials to view pods in real time. Pod data requires an active
          connection to the cluster API.
        </p>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">Cluster Pods</h1>
      {/* Offline warning banner */}
      {isOffline && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/[0.06] text-[var(--color-status-warning)]">
          <span className="text-sm">⚠️</span>
          <div>
            <p className="text-xs font-medium">Cluster offline</p>
            <p className="text-xs opacity-70">
              Showing last-known pod data.
              {podsQuery.dataUpdatedAt > 0
                ? ` Last updated ${new Date(podsQuery.dataUpdatedAt).toLocaleTimeString()}.`
                : ''}
            </p>
          </div>
        </div>
      )}

      {/* Search / filter bar */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-dim)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter pods by name, namespace, or status…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] pl-9 pr-3 py-2 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
          aria-label="Filter pods"
        />
        {searchQuery && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[var(--color-text-muted)]">
            {filteredPods.length}/{pods.length}
          </span>
        )}
      </div>

      <PodsGroupedByNamespace
        pods={filteredPods}
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
        pod={
          selectedPod
            ? { ...selectedPod, restartCount: selectedPod.restartCount ?? undefined }
            : null
        }
        open={!!selectedPod}
        onOpenChange={(open) => {
          if (!open) setSelectedPod(null)
        }}
        events={[]}
      />
    </>
  )
}

function DeletePodDialog({
  pod,
  clusterId,
  onClose,
}: {
  pod: PodRow
  clusterId: string
  onClose: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const utils = trpc.useUtils()
  const deleteMutation = trpc.pods.delete.useMutation({
    onSuccess: () => {
      toast.success(`Pod ${pod.name} deleted`)
      utils.pods.list.invalidate({ clusterId })
      onClose()
    },
    onError: (err) => toast.error(`Failed to delete pod: ${err.message}`),
  })

  const podShortName = pod.name.length > 20 ? pod.name.slice(0, 20) : pod.name
  const isConfirmed = confirmText === 'delete'

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-[420px] max-w-[calc(100vw-2rem)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="delete-pod-title"
        aria-describedby="delete-pod-desc"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 rounded-full bg-red-500/10 p-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3
              id="delete-pod-title"
              className="text-sm font-bold text-[var(--color-text-primary)]"
            >
              Delete Pod
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono break-all">
              {pod.namespace}/{pod.name}
            </p>
          </div>
        </div>
        <div id="delete-pod-desc" className="space-y-2 mb-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Are you sure you want to delete this pod? If it&apos;s managed by a Deployment or
            ReplicaSet, Kubernetes will automatically restart it.
          </p>
          <div className="rounded-lg border border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning)]/[0.06] px-3 py-2">
            <p className="text-xs text-[var(--color-status-warning)]">
              ⚠️ This action cannot be undone. Running processes inside the pod will be terminated.
            </p>
          </div>
        </div>
        <div className="mb-4">
          <label
            htmlFor="confirm-delete"
            className="text-xs text-[var(--color-text-muted)] mb-1 block"
          >
            Type{' '}
            <span className="font-mono font-bold text-[var(--color-text-primary)]">delete</span> to
            confirm
          </label>
          <input
            id="confirm-delete"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="delete"
            className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-1 focus:ring-red-500/50"
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              deleteMutation.mutate({ clusterId, namespace: pod.namespace, podName: pod.name })
            }
            disabled={!isConfirmed || deleteMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Pod'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PodsGroupedByNamespace({
  pods,
  isLoading,
  isAdmin,
  onDeletePod,
  onSelectPod,
}: {
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

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )

  if (pods.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <svg
            className="h-8 w-8 text-[var(--color-text-dim)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">
          No pods found in this cluster
        </p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
          Pods appear here when workloads are running in your cluster. Check that your cluster is
          connected and has active deployments.
        </p>
      </div>
    )

  return (
    <div className="space-y-2">
      {grouped.map(([namespace, nsPods]) => (
        <NamespacePodGroup
          key={namespace}
          namespace={namespace}
          pods={nsPods}
          isAdmin={isAdmin}
          onDeletePod={onDeletePod}
          onSelectPod={onSelectPod}
        />
      ))}
    </div>
  )
}

function NamespacePodGroup({
  namespace,
  pods,
  isAdmin,
  onDeletePod,
  onSelectPod,
}: {
  namespace: string
  pods: PodRow[]
  isAdmin: boolean
  onDeletePod: (pod: PodRow) => void
  onSelectPod: (pod: PodRow) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--color-text-dim)] transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-xs font-bold font-mono text-[var(--color-text-secondary)]">
          {namespace}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold">
          {pods.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 pl-2">
          {pods.map((pod) => {
            const statusColor =
              pod.status === 'Running' || pod.status === 'Succeeded'
                ? 'bg-[var(--color-status-active)]'
                : pod.status === 'Pending'
                  ? 'bg-[var(--color-status-warning)]'
                  : 'bg-[var(--color-status-error)]'
            return (
              <div
                key={pod.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPod(pod)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectPod(pod)
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
                <span className="flex-1 min-w-0 text-[13px] font-mono text-[var(--color-text-primary)] truncate">
                  {pod.name}
                </span>
                {pod.ready && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${pod.ready.split('/')[0] === pod.ready.split('/')[1] ? 'bg-[var(--color-status-active)]/15 text-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}
                  >
                    {pod.ready}
                  </span>
                )}
                {pod.restartCount != null && pod.restartCount > 0 && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${pod.restartCount >= 5 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}
                  >
                    ↻{pod.restartCount}
                  </span>
                )}
                <span className="text-xs text-[var(--color-text-secondary)]">{pod.status}</span>
                <span className="text-xs text-[var(--color-text-dim)] font-mono">
                  {pod.createdAt ? timeAgo(pod.createdAt) : '—'}
                </span>
                {isAdmin && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeletePod(pod)
                          }}
                          className="p-1 rounded hover:bg-red-500/10 text-[var(--color-text-dim)] hover:text-red-400 transition-colors"
                          aria-label={`Delete pod ${pod.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete pod</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
