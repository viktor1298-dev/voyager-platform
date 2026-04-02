'use client'

import {
  AlertTriangle,
  Box,
  ChevronDown,
  CircleCheck,
  Cpu,
  FileText,
  GitFork,
  HardDrive,
  Package,
  Server,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, ExpandableCard, ResourceBar } from '@/components/expandable'
import { LogViewer } from '@/components/logs'
import {
  RelatedResourceLink,
  ResourceLoadingSkeleton,
  SearchFilterBar,
} from '@/components/resource'
import { RelationsTab } from '@/components/resource/RelationsTab'
import { ResourceDiff } from '@/components/resource/ResourceDiff'
import { YamlViewer } from '@/components/resource/YamlViewer'
import { useTerminal } from '@/components/terminal/terminal-context'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useClusterResources, useConnectionState, useSnapshotsReady } from '@/hooks/useResources'
import { parseCpuMillicores, parseMemoryMi } from '@/lib/k8s-units'
import { trpc } from '@/lib/trpc'
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { LiveTimeAgo } from '@/components/shared/LiveTimeAgo'
import { resolveResourceStatus } from '@/lib/resource-status'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  configMapRefs: string[]
  secretRefs: string[]
  pvcRefs: string[]
}

// ---------------------------------------------------------------------------
// Pod log viewer (inline, fetches logs when tab becomes active)
// ---------------------------------------------------------------------------

function PodLogViewer({
  clusterId,
  podName,
  namespace,
}: {
  clusterId: string
  podName: string
  namespace: string
}) {
  const logsQuery = trpc.logs.get.useQuery(
    { clusterId, podName, namespace, tailLines: 200 },
    { staleTime: 15_000 },
  )

  const lines = useMemo(() => {
    if (!logsQuery.data?.logs) return []
    return logsQuery.data.logs.split('\n').filter(Boolean)
  }, [logsQuery.data?.logs])

  return (
    <div className="max-h-[300px] overflow-auto">
      <LogViewer lines={lines} isLoading={logsQuery.isLoading} autoScroll={false} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pod detail expanded content
// ---------------------------------------------------------------------------

function PodDetail({ pod, clusterId }: { pod: PodData; clusterId: string }) {
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
    {
      id: 'logs',
      label: 'Logs',
      icon: <FileText className="h-3.5 w-3.5" />,
      content: <PodLogViewer clusterId={clusterId} podName={pod.name} namespace={pod.namespace} />,
    },
    ...(pod.nodeName
      ? [
          {
            id: 'node',
            label: 'Node',
            icon: <Server className="h-3.5 w-3.5" />,
            content: (
              <div className="space-y-2 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                  Scheduled Node
                </p>
                <RelatedResourceLink
                  tab="nodes"
                  resourceKey={pod.nodeName}
                  label={pod.nodeName}
                  icon={<Server className="h-3.5 w-3.5" />}
                />
              </div>
            ),
          },
        ]
      : []),
    {
      id: 'relations',
      label: 'Relations',
      icon: <GitFork className="h-3.5 w-3.5" />,
      content: (
        <RelationsTab clusterId={clusterId} kind="Pod" namespace={pod.namespace} name={pod.name} />
      ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      icon: <FileText className="h-3.5 w-3.5" />,
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="pods"
          resourceName={pod.name}
          namespace={pod.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      icon: <FileText className="h-3.5 w-3.5" />,
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="pods"
          resourceName={pod.name}
          namespace={pod.namespace}
        />
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
  onExecPod,
}: {
  pod: PodData
  isAdmin: boolean
  onDeletePod: (pod: PodData) => void
  onExecPod: (pod: PodData) => void
}) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span className="flex-1 min-w-0 text-[13px] font-mono text-[var(--color-text-primary)] truncate">
        {pod.name}
      </span>
      {pod.ready &&
        (() => {
          const { colorVar } = resolveResourceStatus(pod.status)
          const allReady = pod.ready.split('/')[0] === pod.ready.split('/')[1]
          const isHealthy = pod.status === 'Running' || pod.status === 'Succeeded'
          // Use status color when pod isn't healthy; green/yellow for healthy pods based on ready count
          const color = isHealthy
            ? allReady
              ? 'var(--color-status-active)'
              : 'var(--color-status-warning)'
            : colorVar
          return (
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
              style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
            >
              {pod.ready}
            </span>
          )
        })()}
      {pod.restartCount > 0 && (
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${pod.restartCount >= 5 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'}`}
        >
          ↻{pod.restartCount}
        </span>
      )}
      <ResourceStatusBadge status={pod.status} size="sm" />
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        <LiveTimeAgo date={pod.createdAt} />
      </span>
      {pod.status === 'Running' && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onExecPod(pod)
                }}
                className="p-1 rounded hover:bg-[var(--color-accent)]/10 text-[var(--color-text-dim)] hover:text-[var(--color-accent)] transition-colors shrink-0"
                aria-label={`Exec into pod ${pod.name}`}
              >
                <Terminal className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Exec into pod</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
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
  onExecPod,
  expandAll,
  clusterId,
  highlightPodKey,
  highlightRef,
  namespacesOpen,
}: {
  namespace: string
  pods: PodData[]
  isAdmin: boolean
  onDeletePod: (pod: PodData) => void
  onExecPod: (pod: PodData) => void
  expandAll: boolean
  clusterId: string
  highlightPodKey: string | null
  highlightRef: React.RefObject<HTMLDivElement | null>
  namespacesOpen: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(true)
  const open = namespacesOpen ? internalOpen : false
  const setOpen = (v: boolean) => {
    if (namespacesOpen) setInternalOpen(v)
  }

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
          {pods.map((pod) => {
            const podKey = `${pod.namespace}/${pod.name}`
            const isHighlighted = highlightPodKey === podKey
            return (
              <div
                key={podKey}
                ref={isHighlighted ? highlightRef : undefined}
                className={
                  isHighlighted
                    ? 'ring-2 ring-[var(--color-accent)] rounded-lg transition-all duration-500'
                    : ''
                }
              >
                <ExpandableCard
                  defaultExpanded={isHighlighted}
                  expanded={expandAll || undefined}
                  summary={
                    <PodSummary
                      pod={pod}
                      isAdmin={isAdmin}
                      onDeletePod={onDeletePod}
                      onExecPod={onExecPod}
                    />
                  }
                >
                  <PodDetail pod={pod} clusterId={clusterId} />
                </ExpandableCard>
              </div>
            )
          })}
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
  const { openTerminal } = useTerminal()

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const pods = useClusterResources<PodData>(resolvedId, 'pods')
  const connectionState = useConnectionState(resolvedId)
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = pods.length === 0 && !snapshotsReady

  const handleExecPod = useCallback(
    (pod: PodData) => {
      openTerminal({
        podName: pod.name,
        container: pod.containers?.[0]?.name ?? pod.name,
        namespace: pod.namespace,
        clusterId: resolvedId,
      })
    },
    [openTerminal, resolvedId],
  )

  const [deletePodTarget, setDeletePodTarget] = useState<PodData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)
  const [namespacesOpen, setNamespacesOpen] = useState(true)
  const searchParams = useSearchParams()
  const highlightRef = useRef<HTMLDivElement>(null)

  // Parse ?highlight=namespace/name for cross-resource navigation (from CrossResourceNav)
  const highlightRaw = searchParams.get('highlight')
  const highlightPodKey = highlightRaw ? decodeURIComponent(highlightRaw) : null

  // Scroll to highlighted pod once data loads
  const hasScrolled = useRef(false)
  useEffect(() => {
    if (!highlightPodKey || hasScrolled.current) return
    if (pods.length === 0) return
    // Data loaded — wait a tick for DOM to render the card, then scroll
    const timer = setTimeout(() => {
      if (highlightRef.current) {
        highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        hasScrolled.current = true
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [highlightPodKey, pods])

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

  const isOffline = connectionState === 'disconnected' && pods.length === 0

  if (isOffline) {
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

      {/* Reconnecting warning banner */}
      {connectionState === 'reconnecting' && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/[0.06] text-[var(--color-status-warning)]">
          <span className="text-sm">⚠️</span>
          <div>
            <p className="text-xs font-medium">Reconnecting to cluster...</p>
            <p className="text-xs opacity-70">Showing last-known pod data.</p>
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
        namespacesOpen={namespacesOpen}
        onNamespacesToggle={() => setNamespacesOpen((prev) => !prev)}
      />

      {/* Pod list */}
      {isLoading ? (
        <ResourceLoadingSkeleton label="Loading pods..." />
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
              onExecPod={handleExecPod}
              expandAll={expandAll}
              clusterId={resolvedId}
              highlightPodKey={highlightPodKey}
              highlightRef={highlightRef}
              namespacesOpen={namespacesOpen}
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
    onMutate: async () => {
      await utils.pods.list.cancel({ clusterId })
      const previous = utils.pods.list.getData({ clusterId })
      utils.pods.list.setData({ clusterId }, (old) =>
        (old as PodData[] | undefined)?.filter(
          (p) => !(p.name === pod.name && p.namespace === pod.namespace),
        ),
      )
      return { previous }
    },
    onError: (err, _, context) => {
      if (context?.previous) utils.pods.list.setData({ clusterId }, context.previous)
      toast.error(`Failed to delete pod: ${err.message}`)
    },
    onSuccess: () => {
      toast.success(`Pod ${pod.name} deleted`)
      utils.pods.list.invalidate({ clusterId })
      onClose()
    },
  })

  const podShortName = pod.name.length > 20 ? pod.name.slice(0, 20) : pod.name
  const isConfirmed = confirmText === 'delete'

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
      role="presentation"
    >
      <form
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-[420px] max-w-[calc(100vw-2rem)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (isConfirmed && !deleteMutation.isPending) {
            deleteMutation.mutate({ clusterId, namespace: pod.namespace, podName: pod.name })
          }
        }}
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
            type="submit"
            disabled={!isConfirmed || deleteMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Pod'}
          </button>
        </div>
      </form>
    </div>
  )
}
