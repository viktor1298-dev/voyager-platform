'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { FileText, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const TAIL_OPTIONS = [50, 100, 500, 1000] as const
const AUTO_REFRESH_INTERVAL = 5000

export default function LogsPage() {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [selectedPod, setSelectedPod] = useState<string>('')
  const [selectedContainer, setSelectedContainer] = useState<string>('')
  const [tailLines, setTailLines] = useState(100)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  const podsQuery = trpc.logs.pods.useQuery(
    selectedNamespace ? { namespace: selectedNamespace } : undefined,
    { refetchOnWindowFocus: false },
  )

  const logsQuery = trpc.logs.get.useQuery(
    {
      podName: selectedPod,
      namespace: selectedNamespace,
      container: selectedContainer || undefined,
      tailLines,
    },
    {
      enabled: !!selectedPod && !!selectedNamespace,
      refetchOnWindowFocus: false,
      refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL : false,
    },
  )

  const namespaces = useMemo(() => {
    const ns = new Set((podsQuery.data ?? []).map((p) => p.namespace))
    return Array.from(ns).sort()
  }, [podsQuery.data])

  const filteredPods = useMemo(() => {
    if (!podsQuery.data) return []
    if (!selectedNamespace) return podsQuery.data
    return podsQuery.data.filter((p) => p.namespace === selectedNamespace)
  }, [podsQuery.data, selectedNamespace])

  const currentPod = useMemo(
    () => filteredPods.find((p) => p.name === selectedPod),
    [filteredPods, selectedPod],
  )

  const filteredLines = useMemo(() => {
    const text = logsQuery.data?.logs ?? ''
    if (!text) return []
    const lines = text.split('\n')
    if (!searchTerm) return lines
    const lower = searchTerm.toLowerCase()
    return lines.filter((l) => l.toLowerCase().includes(lower))
  }, [logsQuery.data?.logs, searchTerm])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredLines])

  const handleNamespaceChange = useCallback((ns: string) => {
    setSelectedNamespace(ns)
    setSelectedPod('')
    setSelectedContainer('')
  }, [])

  const handlePodChange = useCallback((pod: string) => {
    setSelectedPod(pod)
    setSelectedContainer('')
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Breadcrumbs />
            <p className="text-sm text-muted-foreground mt-1">Tail pod logs in real time</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Namespace */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Namespace</label>
            <select
              className="block w-44 rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={selectedNamespace}
              onChange={(e) => handleNamespaceChange(e.target.value)}
            >
              <option value="">All namespaces</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          {/* Pod */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Pod</label>
            <select
              className="block w-64 rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={selectedPod}
              onChange={(e) => handlePodChange(e.target.value)}
            >
              <option value="">Select a pod…</option>
              {filteredPods.map((p) => (
                <option key={`${p.namespace}/${p.name}`} value={p.name}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {/* Container */}
          {currentPod && currentPod.containers.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Container</label>
              <select
                className="block w-44 rounded-md border border-border bg-card px-3 py-2 text-sm"
                value={selectedContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
              >
                <option value="">All containers</option>
                {currentPod.containers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tail lines */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tail lines</label>
            <select
              className="block w-24 rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value))}
            >
              {TAIL_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!selectedPod || logsQuery.isFetching}
            onClick={() => logsQuery.refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Auto-refresh toggle */}
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter logs…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Log display */}
        {podsQuery.isLoading && <Shimmer className="h-64 w-full rounded-lg" />}
        {podsQuery.isError && <QueryError message={podsQuery.error.message} onRetry={() => podsQuery.refetch()} />}
        {logsQuery.isError && <QueryError message={logsQuery.error.message} onRetry={() => logsQuery.refetch()} />}

        {!selectedPod && !podsQuery.isLoading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-40" />
            <p>Select a pod to view logs</p>
          </div>
        )}

        {selectedPod && logsQuery.data && (
          <div className="relative rounded-lg border border-border bg-[#0d1117] overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/40 bg-[#161b22] px-4 py-2">
              <span className="text-xs text-gray-400 font-mono">
                {selectedNamespace}/{selectedPod}
                {selectedContainer ? ` → ${selectedContainer}` : ''}
              </span>
              <span className="text-xs text-gray-500">{filteredLines.length} lines</span>
            </div>
            <pre className="overflow-auto max-h-[600px] p-4 text-xs leading-5 text-gray-300 font-mono whitespace-pre-wrap">
              {filteredLines.length === 0 ? (
                <span className="text-gray-500 italic">No matching log lines</span>
              ) : (
                filteredLines.map((line, i) => (
                  <div key={i} className="hover:bg-white/5">
                    <span className="inline-block w-12 text-right text-gray-600 select-none mr-4">
                      {i + 1}
                    </span>
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
