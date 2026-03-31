'use client'

import { GitFork, Globe, Lock, Network, Route, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, TagPills } from '@/components/expandable'
import { RelatedResourceLink, ResourcePageScaffold } from '@/components/resource'
import { RelationsTab } from '@/components/resource/RelationsTab'
import { ResourceDiff } from '@/components/resource/ResourceDiff'
import { YamlViewer } from '@/components/resource/YamlViewer'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
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

function IngressSummary({ ing }: { ing: IngressData }) {
  const pathCount = ing.rules.reduce((sum, r) => sum + r.paths.length, 0)
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {ing.name}
      </span>
      <span className="text-xs font-mono text-[var(--color-accent)] max-w-[200px] truncate shrink-0">
        {ing.hosts.join(', ') || '*'}
      </span>
      <span className="text-xs font-mono text-[var(--color-text-muted)] shrink-0">
        {pathCount} path{pathCount !== 1 ? 's' : ''}
      </span>
      {ing.tls.length > 0 && (
        <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0 bg-emerald-500/15 text-emerald-400">
          TLS
        </span>
      )}
      {ing.ingressClassName && (
        <span className="text-xs font-mono text-[var(--color-text-secondary)] shrink-0">
          {ing.ingressClassName}
        </span>
      )}
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        {ing.createdAt ? timeAgo(ing.createdAt) : '--'}
      </span>
    </div>
  )
}

function IngressExpandedDetail({ ing, clusterId }: { ing: IngressData; clusterId: string }) {
  // Collect unique services referenced by this ingress
  const referencedServices = ing.rules.flatMap((rule) =>
    rule.paths.map((path) => ({
      key: `${rule.host}/${path.path}`,
      serviceName: path.serviceName,
      servicePort: path.servicePort,
      namespace: ing.namespace,
    })),
  )

  const tabs = [
    {
      id: 'services',
      label: 'Services',
      icon: <Globe className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2 p-3">
          {referencedServices.length > 0 ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Backend Services ({referencedServices.length})
              </p>
              {referencedServices.map((svc) => (
                <div key={svc.key} className="flex items-center gap-2">
                  <RelatedResourceLink
                    tab="services"
                    resourceKey={`${svc.namespace}/${svc.serviceName}`}
                    label={`${svc.serviceName}:${svc.servicePort}`}
                  />
                </div>
              ))}
            </>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No backend services referenced.
            </p>
          )}
        </div>
      ),
    },
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
            <span className="text-[var(--color-text-primary)]">{ing.ingressClassName ?? '--'}</span>
            {ing.defaultBackend && (
              <>
                <span className="text-[var(--color-text-muted)]">Default Backend</span>
                <span className="text-[var(--color-text-primary)]">
                  {ing.defaultBackend.serviceName}:{ing.defaultBackend.servicePort}
                </span>
              </>
            )}
          </div>
          {Object.keys(ing.annotations ?? {}).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Annotations ({Object.keys(ing.annotations ?? {}).length})
              </p>
              <TagPills tags={ing.annotations} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'relations',
      label: 'Relations',
      icon: <GitFork className="h-3.5 w-3.5" />,
      content: (
        <RelationsTab
          clusterId={clusterId}
          kind="Ingress"
          namespace={ing.namespace}
          name={ing.name}
        />
      ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="ingresses"
          resourceName={ing.name}
          namespace={ing.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="ingresses"
          resourceName={ing.name}
          namespace={ing.namespace}
        />
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

  const ingresses = useClusterResources<IngressData>(resolvedId, 'ingresses')
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = ingresses.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<IngressData>
      title="Ingresses"
      icon={<Network className="h-5 w-5" />}
      queryResult={{ data: ingresses, isLoading, error: null }}
      getNamespace={(ing) => ing.namespace}
      getKey={(ing) => `${ing.namespace}/${ing.name}`}
      filterFn={(ing, q) =>
        ing.name.toLowerCase().includes(q) ||
        ing.namespace.toLowerCase().includes(q) ||
        ing.hosts.some((h) => h.toLowerCase().includes(q))
      }
      renderSummary={(ing) => <IngressSummary ing={ing} />}
      renderDetail={(ing) => <IngressExpandedDetail ing={ing} clusterId={resolvedId} />}
      searchPlaceholder="Search ingresses..."
      emptyMessage="No ingresses found"
    />
  )
}
