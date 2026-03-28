'use client'

import {
  AlertTriangle,
  Box,
  ChevronDown,
  CircleCheck,
  Cpu,
  HardDrive,
  Package,
  Trash2,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, ExpandableCard, ResourceBar } from '@/components/expandable'
import { SearchFilterBar } from '@/components/resource'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

interface ContainerData {
  name: string
  image: string
  ports: { containerPort: number; protocol: string; name: string | null }[]
  command: string[] | null
  volumeMounts: { name: string; mountPath: string; readOnly: boolean }[]
  envCount: number
  resources: {
    cpuRequest: string | null
    cpuLimit: string | null
    memRequest: string | null
    memLimit: string | null
  }
}

interface PodData {
  name: string
  namespace: string
  status: string
  createdAt: string | null
  nodeName: string | null
  cpuMillis: number | null
  memoryMi: number | null
  cpuPercent: number | null
  memoryPercent: number | null
  ready: string
  restartCount: number
  lastRestartReason: string | null
  containers: ContainerData[]
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
  labels: Record<string, string>
}

// ---------------------------------------------------------------------------
// K8s unit helpers
// ---------------------------------------------------------------------------

function parseCpuMillicores(value: string | null): number {
  if (!value) return 0
  if (value.endsWith('m')) return Number.parseInt(value, 10) || 0
  const cores = Number.parseFloat(value)
  return Number.isNaN(cores) ? 0 : Math.round(cores * 1000)
}

function parseMemoryMi(value: string | null): number {
  if (!value) return 0
  if (value.endsWith('Mi')) return Number.parseInt(value, 10) || 0
  if (value.endsWith('Gi')) return (Number.parseFloat(value) || 0) * 1024
  if (value.endsWith('Ki')) return Math.round((Number.parseInt(value, 10) || 0) / 1024)
  const bytes = Number.parseInt(value, 10)
  return Number.isNaN(bytes) ? 0 : Math.round(bytes / 1048576)
}

// ---------------------------------------------------------------------------
// Pod detail expanded content
// ---------------------------------------------------------------------------

function PodDetail({ pod }: { pod: PodData }) {
  const containers = pod.containers ?? []

  const tabs = [
    {
      id: 'containers',
      label: 'Containers',
      icon: <Package className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {containers.map((c) => (
            <div
              key={c.name}
              className="rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <span className="text-[12px] font-bold font-mono text-[var(--color-text-primary)]">
                  {c.name}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
                <span className="text-[var(--color-text-muted)]">Image</span>
                <span className="text-[var(--color-text-secondary)] truncate" title={c.image}>
                  {c.image}
                </span>
                {c.ports.length > 0 && (
                  <>
                    <span className="text-[var(--color-text-muted)]">Ports</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {c.ports.map((p) => `${p.containerPort}/${p.protocol}`).join(', ')}
                    </span>
                  </>
                )}
                {c.command && (
                  <>
                    <span className="text-[var(--color-text-muted)]">Command</span>
                    <span className="text-[var(--color-text-secondary)] truncate">
                      {c.command.join(' ')}
                    </span>
                  </>
                )}
                {c.volumeMounts.length > 0 && (
                  <>
                    <span className="text-[var(--color-text-muted)]">Mounts</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {c.volumeMounts.map((vm) => vm.mountPath).join(', ')}
                    </span>
                  </>
                )}
                {c.envCount > 0 && (
                  <>
                    <span className="text-[var(--color-text-muted)]">Env vars</span>
                    <span className="text-[var(--color-text-secondary)]">{c.envCount}</span>
                  </>
                )}
              </div>
            </div>
          ))}
          {containers.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No container details available.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'resources',
      label: 'Resources',
      icon: <Box className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-4">
          {containers.map((c) => {
            const cpuReq = parseCpuMillicores(c.resources.cpuRequest)
            const cpuLim = parseCpuMillicores(c.resources.cpuLimit)
            const memReq = parseMemoryMi(c.resources.memRequest)
            const memLim = parseMemoryMi(c.resources.memLimit)
            const hasResources = cpuReq > 0 || cpuLim > 0 || memReq > 0 || memLim > 0

            return (
              <div key={c.name} className="space-y-2">
                <p className="text-[11px] font-bold font-mono text-[var(--color-text-primary)]">
                  {c.name}
                </p>
                {hasResources ? (
                  <div className="space-y-2">
                    {cpuLim > 0 && (
                      <ResourceBar
                        label="CPU"
                        icon={<Cpu className="h-3.5 w-3.5" />}
                        used={cpuReq}
                        total={cpuLim}
                        unit="m"
                      />
                    )}
                    {memLim > 0 && (
                      <ResourceBar
                        label="Memory"
                        icon={<HardDrive className="h-3.5 w-3.5" />}
                        used={memReq}
                        total={memLim}
                        unit="Mi"
                      />
                    )}
                    {cpuLim === 0 && cpuReq > 0 && (
                      <div className="text-[11px] font-mono text-[var(--color-text-muted)]">
                        CPU request: {cpuReq}m (no limit)
                      </div>
                    )}
                    {memLim === 0 && memReq > 0 && (
                      <div className="text-[11px] font-mono text-[var(--color-text-muted)]">
                        Mem request: {memReq}Mi (no limit)
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    No resource requests/limits set
                  </p>
                )}
              </div>
            )
          })}
          {containers.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No resource data available.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <ConditionsList conditions={pod.conditions ?? []} />
          {pod.restartCount > 0 && pod.lastRestartReason && (
            <div className="mt-2 px-2.5 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] text-[11px]">
              <span className="font-medium text-amber-400">Last restart reason:</span>{' '}
              <span className="text-[var(--color-text-secondary)] font-mono">
                {pod.lastRestartReason}
              </span>
            </div>
          )}
        </div>
      ),
    },
  ]

  return <DetailTabs id={`pod-${pod.namespace}-${pod.name}`} tabs={tabs} />
}

// ---------------------------------------------------------------------------
// Pod summary row (inside ExpandableCard)
// ---------------------------------------------------------------------------

function PodSummary({
  pod,
  isAdmin,
  onDeletePod,
}: {
  pod: PodData
  isAdmin: boolean
  onDeletePod: (pod: PodData) => void
}) {
  const statusColor =
    pod.status === 'Running' || pod.status === 'Succeeded'
      ? 'bg-[var(--color-status-active)]'
      : pod.status === 'Pending'
        ? 'bg-[var(--color-status-warning)]'
        : 'bg-[var(--color-status-error)]'

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
      <span className="flex-1 min-w-0 text-[13px] font-mono text-[var(--color-text-primary)] truncate">
        {pod.name}
      </span>
      {pod.ready && (
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${pod.ready.split('/')[0] === pod.ready.split('/')[1] ? 'bg-[var(--color-status-active)]/15 text-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}
        >
          {pod.ready}
        </span>
      )}
      {pod.restartCount > 0 && (
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${pod.restartCount >= 5 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}
        >
          ↻{pod.restartCount}
        </span>
      )}
      <span className="text-xs text-[var(--color-text-secondary)] shrink-0">{pod.status}</span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
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
                className="p-1 rounded hover:bg-red-500/10 text-[var(--color-text-dim)] hover:text-red-400 transition-colors shrink-0"
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
}

// ---------------------------------------------------------------------------
// Namespace group with expandable cards
// ---------------------------------------------------------------------------

function NamespacePodGroup({
  namespace,
  pods,
  isAdmin,
  onDeletePod,
  expandAll,
}: {
  namespace: string
  pods: PodData[]
  isAdmin: boolean
  onDeletePod: (pod: PodData) => void
  expandAll: boolean
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
        <div className="mt-1 space-y-1 pl-2">
          {pods.map((pod) => (
            <ExpandableCard
              key={`${pod.namespace}/${pod.name}`}
              expanded={expandAll}
              summary={<PodSummary pod={pod} isAdmin={isAdmin} onDeletePod={onDeletePod} />}
            >
              <PodDetail pod={pod} />
            </ExpandableCard>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

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
      staleTime: 5 * 60 * 1000,
    },
  )

  const [deletePodTarget, setDeletePodTarget] = useState<PodData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)

  const pods = (podsQuery.data ?? []) as PodData[]

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

  const grouped = useMemo(() => {
    const map = new Map<string, PodData[]>()
    for (const pod of filteredPods) {
      const ns = pod.namespace || 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)?.push(pod)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredPods])

  const isOffline = isLive && liveFailed

  if (!isLive && !podsQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <Box className="h-8 w-8 text-[var(--color-text-dim)]" />
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
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={pods.length}
        filteredCount={filteredPods.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder="Search pods..."
      />

      {/* Pod list */}
      {podsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filteredPods.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">
            <Box className="h-8 w-8 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            No pods found in this cluster
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            Pods appear here when workloads are running in your cluster.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(([namespace, nsPods]) => (
            <NamespacePodGroup
              key={namespace}
              namespace={namespace}
              pods={nsPods}
              isAdmin={isAdmin === true}
              onDeletePod={setDeletePodTarget}
              expandAll={expandAll}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deletePodTarget && (
        <DeletePodDialog
          pod={deletePodTarget}
          clusterId={resolvedId}
          onClose={() => setDeletePodTarget(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Delete dialog (unchanged from original)
// ---------------------------------------------------------------------------

function DeletePodDialog({
  pod,
  clusterId,
  onClose,
}: {
  pod: PodData
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
