'use client'

import { ChevronDown, Shield, User, Users, Bot } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, ExpandableCard } from '@/components/expandable'
import { SearchFilterBar, SectionLoadingSkeleton } from '@/components/resource'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MatrixData = {
  subjects: string[]
  resources: string[]
  matrix: Record<string, Record<string, string[]>>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subjectIcon(subject: string) {
  if (subject.startsWith('ServiceAccount:')) return <Bot className="h-4 w-4 text-blue-400" />
  if (subject.startsWith('Group:')) return <Users className="h-4 w-4 text-purple-400" />
  return <User className="h-4 w-4 text-[var(--color-accent)]" />
}

function subjectType(subject: string): string {
  if (subject.startsWith('ServiceAccount:')) return 'ServiceAccount'
  if (subject.startsWith('Group:')) return 'Group'
  return 'User'
}

function subjectName(subject: string): string {
  const parts = subject.split(':')
  return parts.length > 1 ? parts.slice(1).join(':') : subject
}

function verbBadge(verb: string, allowed: boolean) {
  return (
    <span
      key={verb}
      className={[
        'text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded select-none',
        allowed
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)] opacity-40',
      ].join(' ')}
    >
      {verb}
    </span>
  )
}

const ALL_VERBS = ['get', 'list', 'create', 'update', 'patch', 'delete', 'watch']

// ---------------------------------------------------------------------------
// Subject Summary Row
// ---------------------------------------------------------------------------

function SubjectSummary({ subject, resourceCount }: { subject: string; resourceCount: number }) {
  const typeBadgeColor = {
    ServiceAccount: 'bg-blue-500/15 text-blue-400',
    Group: 'bg-purple-500/15 text-purple-400',
    User: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
  }[subjectType(subject)]

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      {subjectIcon(subject)}
      <span className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate">
        {subjectName(subject)}
      </span>
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${typeBadgeColor}`}>
        {subjectType(subject)}
      </span>
      <span className="text-[11px] text-[var(--color-text-dim)] font-mono shrink-0 ml-auto">
        {resourceCount} resource{resourceCount !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subject Detail (permissions per resource)
// ---------------------------------------------------------------------------

function SubjectDetail({
  subject,
  permissions,
}: {
  subject: string
  permissions: Record<string, string[]>
}) {
  // Group resources by category for better readability
  const sortedResources = Object.keys(permissions).sort()

  // Split into resources with full access (* or all verbs) and partial
  const fullAccess: string[] = []
  const partialAccess: { resource: string; verbs: string[] }[] = []

  for (const resource of sortedResources) {
    const verbs = permissions[resource]
    if (verbs.includes('*') || verbs.length >= 7) {
      fullAccess.push(resource)
    } else if (verbs.length > 0) {
      partialAccess.push({ resource, verbs })
    }
  }

  return (
    <div className="space-y-4">
      {/* Full access resources */}
      {fullAccess.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Full Access ({fullAccess.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {fullAccess.map((resource) => (
              <span
                key={resource}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                {resource}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Partial access resources */}
      {partialAccess.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Partial Access ({partialAccess.length})
          </p>
          <div className="space-y-1.5">
            {partialAccess.map(({ resource, verbs }) => (
              <div
                key={resource}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01]"
              >
                <span className="text-[12px] font-mono font-semibold text-[var(--color-text-primary)] min-w-[160px] truncate">
                  {resource}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {ALL_VERBS.map((v) => verbBadge(v, verbs.includes(v) || verbs.includes('*')))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fullAccess.length === 0 && partialAccess.length === 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)]">No permissions found.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    ServiceAccount: true,
    Group: true,
    User: true,
  })

  const data = (matrixQuery.data ?? { subjects: [], resources: [], matrix: {} }) as MatrixData

  // Filter subjects by search
  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) return data.subjects
    const q = searchQuery.toLowerCase().trim()
    return data.subjects.filter((s) => s.toLowerCase().includes(q))
  }, [data.subjects, searchQuery])

  // Group subjects by type
  const groupedSubjects = useMemo(() => {
    const groups: Record<string, string[]> = {
      ServiceAccount: [],
      Group: [],
      User: [],
    }
    for (const subject of filteredSubjects) {
      const type = subjectType(subject)
      groups[type].push(subject)
    }
    return groups
  }, [filteredSubjects])

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

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))
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
        <SectionLoadingSkeleton sections={2} />
      ) : filteredSubjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">
            <Shield className="h-8 w-8 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No RBAC Bindings</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            No RBAC bindings found. Check cluster role bindings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedSubjects).map(([groupName, subjects]) => {
            if (subjects.length === 0) return null

            return (
              <Collapsible
                key={groupName}
                open={openGroups[groupName] ?? true}
                onOpenChange={() => toggleGroup(groupName)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 group cursor-pointer">
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-[var(--color-text-dim)] transition-transform ${
                      openGroups[groupName] ? '' : '-rotate-90'
                    }`}
                  />
                  <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">
                    {groupName}s
                  </span>
                  <span className="text-[11px] font-mono text-[var(--color-text-dim)] px-1.5 py-0.5 rounded bg-white/[0.04]">
                    {subjects.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1.5 ml-1">
                    {subjects.map((subject) => {
                      const permissions = data.matrix[subject] ?? {}
                      const resourceCount = Object.keys(permissions).filter(
                        (r) => (permissions[r]?.length ?? 0) > 0,
                      ).length

                      return (
                        <ExpandableCard
                          key={subject}
                          expanded={expandAll || undefined}
                          summary={
                            <SubjectSummary subject={subject} resourceCount={resourceCount} />
                          }
                        >
                          <SubjectDetail subject={subject} permissions={permissions} />
                        </ExpandableCard>
                      )
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      )}
    </>
  )
}
