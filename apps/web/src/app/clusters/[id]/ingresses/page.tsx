'use client'

import { Lock, Route, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

interface IngressData {
  name: string
  namespace: string
  ingressClassName: string | null
  hosts: string[]
  ports: string
  createdAt: string | null
  rules: {
    host: string
    paths: { path: string; pathType: string; serviceName: string; servicePort: string | number }[]
  }[]
  tls: { hosts: string[]; secretName: string }[]
  annotations: Record<string, string>
  defaultBackend: { serviceName: string; servicePort: string | number } | null
}

function IngressExpandedDetail({ ing }: { ing: IngressData }) {
  const tabs = [
    {
      id: 'rules',
      label: 'Rules',
      icon: <Route className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {ing.rules.map((rule, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--color-border)]/40 overflow-hidden"
            >
              <div className="px-3 py-1.5 bg-white/[0.02] border-b border-[var(--color-border)]/30">
                <span className="text-[11px] font-mono font-bold text-[var(--color-accent)]">
                  {rule.host}
                </span>
              </div>
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--color-border)]/20 text-[10px] uppercase text-[var(--color-text-muted)]">
                    <th className="text-left px-3 py-1">Path</th>
                    <th className="text-left px-3 py-1">Type</th>
                    <th className="text-left px-3 py-1">Service</th>
                    <th className="text-left px-3 py-1">Port</th>
                  </tr>
                </thead>
                <tbody>
                  {rule.paths.map((p, j) => (
                    <tr key={j} className="border-b border-[var(--color-border)]/10 last:border-0">
                      <td className="px-3 py-1 text-[var(--color-text-primary)]">{p.path}</td>
                      <td className="px-3 py-1 text-[var(--color-text-muted)]">{p.pathType}</td>
                      <td className="px-3 py-1 text-[var(--color-accent)]">{p.serviceName}</td>
                      <td className="px-3 py-1 text-[var(--color-text-secondary)]">
                        {p.servicePort}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {ing.rules.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">No rules defined.</p>
          )}
        </div>
      ),
    },
    {
      id: 'tls',
      label: 'TLS',
      icon: <Lock className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2">
          {ing.tls.length > 0 ? (
            ing.tls.map((t, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border)]/40 p-3 space-y-1"
              >
                <div className="text-[11px] font-mono">
                  <span className="text-[var(--color-text-muted)]">Secret: </span>
                  <span className="text-[var(--color-accent)]">{t.secretName}</span>
                </div>
                <div className="text-[11px] font-mono">
                  <span className="text-[var(--color-text-muted)]">Hosts: </span>
                  <span className="text-[var(--color-text-primary)]">{t.hosts.join(', ')}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">No TLS configured.</p>
          )}
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Ingress Class</span>
            <span className="text-[var(--color-text-primary)]">{ing.ingressClassName ?? '—'}</span>
            {ing.defaultBackend && (
              <>
                <span className="text-[var(--color-text-muted)]">Default Backend</span>
                <span className="text-[var(--color-text-primary)]">
                  {ing.defaultBackend.serviceName}:{ing.defaultBackend.servicePort}
                </span>
              </>
            )}
          </div>
          {Object.keys(ing.annotations).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Annotations ({Object.keys(ing.annotations).length})
              </p>
              <TagPills tags={ing.annotations} />
            </div>
          )}
        </div>
      ),
    },
  ]

  return <DetailTabs id={`ing-${ing.namespace}-${ing.name}`} tabs={tabs} />
}

export default function IngressesPage() {
  usePageTitle('Ingresses')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.ingresses.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )

  const ingresses = (query.data ?? []) as IngressData[]

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view ingresses.
        </p>
      </div>
    )
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (ingresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No ingresses found</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Namespace</th>
            <th className="text-left px-3 py-2.5">Class</th>
            <th className="text-left px-3 py-2.5">Hosts</th>
            <th className="text-left px-3 py-2.5">Ports</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {ingresses.map((ing) => (
            <ExpandableTableRow
              key={`${ing.namespace}/${ing.name}`}
              columnCount={6}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {ing.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {ing.namespace}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {ing.ingressClassName ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-accent)]">
                    {ing.hosts.join(', ') || '*'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {ing.ports}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {ing.createdAt ? timeAgo(ing.createdAt) : '—'}
                  </td>
                </>
              }
              detail={<IngressExpandedDetail ing={ing} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
