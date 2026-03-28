'use client'

import { Shield, X } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { RbacMatrix } from '@/components/rbac/RbacMatrix'
import { SearchFilterBar } from '@/components/resource'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'

interface BindingDetail {
  roleName: string
  bindingName: string
  namespace?: string
  verbs: string[]
}

export default function RbacPage() {
  usePageTitle('Cluster RBAC')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const matrixQuery = trpc.rbac.matrix.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, staleTime: 60_000 },
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{
    subject: string
    resource: string
  } | null>(null)

  const bindingQuery = trpc.rbac.bindingDetail.useQuery(
    {
      clusterId: resolvedId,
      subject: selectedCell?.subject ?? '',
      resource: selectedCell?.resource ?? '',
    },
    { enabled: !!selectedCell },
  )

  type MatrixData = {
    subjects: string[]
    resources: string[]
    matrix: Record<string, Record<string, string[]>>
  }
  const data = (matrixQuery.data ?? { subjects: [], resources: [], matrix: {} }) as MatrixData

  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) return data.subjects
    const q = searchQuery.toLowerCase().trim()
    return data.subjects.filter((s) => s.toLowerCase().includes(q))
  }, [data.subjects, searchQuery])

  const filteredMatrix = useMemo(() => {
    const result: Record<string, Record<string, string[]>> = {}
    for (const subject of filteredSubjects) {
      if (data.matrix[subject]) {
        result[subject] = data.matrix[subject]
      }
    }
    return result
  }, [filteredSubjects, data.matrix])

  const handleCellClick = useCallback((subject: string, resource: string) => {
    setSelectedCell({ subject, resource })
  }, [])

  if (!hasCredentials && !matrixQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <Shield className="h-8 w-8 text-[var(--color-text-dim)]" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
          Connect cluster credentials to view RBAC bindings.
        </p>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">Cluster RBAC</h1>

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={data.subjects.length}
        filteredCount={filteredSubjects.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder="Search subjects..."
      />

      {matrixQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <RbacMatrix
          subjects={filteredSubjects}
          resources={data.resources}
          matrix={filteredMatrix}
          onCellClick={handleCellClick}
        />
      )}

      {/* Binding detail popover */}
      {selectedCell && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setSelectedCell(null)}
          role="presentation"
        >
          <div
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-[440px] max-w-[calc(100vw-2rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Binding details"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                  Binding Details
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono break-all">
                  {selectedCell.subject} &rarr; {selectedCell.resource}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-[var(--color-text-dim)]" />
              </button>
            </div>

            {bindingQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-auto">
                {((bindingQuery.data as { bindings: BindingDetail[] } | undefined)?.bindings ?? [])
                  .length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)] py-3">
                    No direct bindings found for this combination.
                  </p>
                ) : (
                  (
                    (bindingQuery.data as { bindings: BindingDetail[] } | undefined)?.bindings ?? []
                  ).map((b, i) => (
                    <div
                      key={`${b.bindingName}-${i}`}
                      className="rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-mono font-bold text-[var(--color-text-primary)]">
                          {b.roleName}
                        </span>
                        {b.namespace && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                            {b.namespace}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                        via {b.bindingName}
                      </p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {b.verbs.map((v) => (
                          <span
                            key={v}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
