'use client'

import { RefreshCw } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'

export default function LogsPage() {
  const { id } = useParams<{ id: string }>()

  const dbCluster = trpc.clusters.get.useQuery({ id })
  const resolvedId = dbCluster.data?.id ?? id

  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)

  // Fetch pods list
  const podsQuery = trpc.logs.pods.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId },
  )

  const pods = podsQuery.data ?? []

  const [selectedPod, setSelectedPod] = useState<string>('')
  const [selectedContainer, setSelectedContainer] = useState<string>('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [tailLines, setTailLines] = useState(200)

  const currentPod = useMemo(
    () => pods.find((p) => `${p.namespace}/${p.name}` === selectedPod),
    [pods, selectedPod],
  )

  // Auto-select first pod
  useEffect(() => {
    if (pods.length > 0 && !selectedPod) {
      const first = pods[0]
      if (first) {
        setSelectedPod(`${first.namespace}/${first.name}`)
        setSelectedContainer(first.containers[0] ?? '')
      }
    }
  }, [pods, selectedPod])

  // When pod changes, reset container selection
  useEffect(() => {
    if (currentPod) {
      setSelectedContainer(currentPod.containers[0] ?? '')
    }
  }, [currentPod])

  const namespace = currentPod?.namespace ?? ''
  const podName = currentPod?.name ?? ''

  const logsQuery = trpc.logs.get.useQuery(
    {
      clusterId: resolvedId,
      podName,
      namespace,
      container: selectedContainer || undefined,
      tailLines,
    },
    {
      enabled: !!podName && !!namespace && hasCredentials,
      refetchInterval: false,
    },
  )

  const logText = logsQuery.data?.logs ?? ''
  const logLines = useMemo(() => logText.split('\n').filter(Boolean), [logText])

  const preRef = useRef<HTMLDivElement>(null)

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logLines, autoScroll])

  if (dbCluster.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view logs.
        </p>
      </div>
    )
  }

  return (
    // P3-012: react-resizable-panels split-pane layout
    <PanelGroup orientation="vertical" className="min-h-[60vh]">
      {/* Upper panel: Controls + Log output */}
      <Panel defaultSize={75} minSize={30} className="flex flex-col">
    <div className="space-y-3 h-full flex flex-col">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Pod selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="pod-select" className="text-[12px] text-[var(--color-text-muted)] shrink-0">
            Pod:
          </label>
          <select
            id="pod-select"
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            className="text-[12px] font-mono rounded-lg px-2 py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] max-w-[260px]"
          >
            {podsQuery.isLoading && (
              <option value="">Loading pods…</option>
            )}
            {pods.length === 0 && !podsQuery.isLoading && (
              <option value="">No pods found</option>
            )}
            {pods.map((p) => (
              <option key={`${p.namespace}/${p.name}`} value={`${p.namespace}/${p.name}`}>
                {p.namespace}/{p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Container selector */}
        {currentPod && currentPod.containers.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="container-select" className="text-[12px] text-[var(--color-text-muted)] shrink-0">
              Container:
            </label>
            <select
              id="container-select"
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="text-[12px] font-mono rounded-lg px-2 py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              {currentPod.containers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tail lines */}
        <div className="flex items-center gap-2">
          <label htmlFor="tail-select" className="text-[12px] text-[var(--color-text-muted)] shrink-0">
            Lines:
          </label>
          <select
            id="tail-select"
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            className="text-[12px] font-mono rounded-lg px-2 py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>

        {/* Auto-scroll toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer" htmlFor="autoscroll-toggle">
          <input
            id="autoscroll-toggle"
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-[var(--color-accent)] h-3.5 w-3.5"
          />
          <span className="text-[12px] text-[var(--color-text-muted)]">Auto-scroll</span>
        </label>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => void logsQuery.refetch()}
          disabled={logsQuery.isFetching}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
          aria-label="Refresh logs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Log output */}
      <div
        ref={preRef}
        className="rounded-xl border border-[var(--color-border)] bg-[#0d0d0d] overflow-auto flex-1 p-4"
        role="log"
        aria-live="polite"
        aria-label={`Logs for ${selectedPod}`}
      >
        {logsQuery.isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-4 w-full opacity-30" />)}
          </div>
        ) : logsQuery.isError ? (
          <p className="text-[12px] text-[var(--color-status-error)] font-mono">
            Error: {logsQuery.error?.message ?? 'Failed to fetch logs'}
          </p>
        ) : logLines.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-dim)] font-mono">No log output.</p>
        ) : (
          <pre className="text-[12px] font-mono text-green-400/90 whitespace-pre-wrap break-all leading-5">
            {logLines.map((line, i) => {
              const isError = /error|fatal|panic/i.test(line)
              const isWarn = /warn/i.test(line)
              return (
                <span
                  key={i}
                  className={`block ${isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : ''}`}
                >
                  {line}
                </span>
              )
            })}
          </pre>
        )}
      </div>

      {!logsQuery.isLoading && logLines.length > 0 && (
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono">
          {logLines.length} line{logLines.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
      </Panel>

      {/* Resize handle */}
      <PanelResizeHandle className="h-2 flex items-center justify-center group cursor-row-resize my-1">
        <div className="h-1 w-16 rounded-full bg-[var(--color-border)] group-hover:bg-[var(--color-accent)]/60 transition-colors" />
      </PanelResizeHandle>

      {/* Lower panel: Info / metadata */}
      <Panel defaultSize={25} minSize={10} className="overflow-auto">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 h-full">
          <p className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mb-3">
            Pod Info
          </p>
          {selectedPod ? (
            <div className="space-y-1.5">
              <div className="flex gap-2 text-[12px]">
                <span className="text-[var(--color-text-dim)] w-24 shrink-0">Pod:</span>
                <span className="font-mono text-[var(--color-text-secondary)] truncate">{selectedPod}</span>
              </div>
              {selectedContainer && (
                <div className="flex gap-2 text-[12px]">
                  <span className="text-[var(--color-text-dim)] w-24 shrink-0">Container:</span>
                  <span className="font-mono text-[var(--color-text-secondary)]">{selectedContainer}</span>
                </div>
              )}
              <div className="flex gap-2 text-[12px]">
                <span className="text-[var(--color-text-dim)] w-24 shrink-0">Lines shown:</span>
                <span className="font-mono text-[var(--color-text-secondary)]">{logLines.length} / {tailLines}</span>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--color-text-dim)] font-mono">Select a pod above to view logs.</p>
          )}
        </div>
      </Panel>
    </PanelGroup>
  )
}
