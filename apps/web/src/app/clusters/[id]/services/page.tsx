'use client'

import { CircleCheck, Globe, Settings, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { useMemo } from 'react'
import { DetailTabs, ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

interface ServiceDetail {
  name: string
  namespace: string
  type: string
  clusterIP: string | null
  ports: {
    name: string | null
    protocol: string | null
    port: number
    targetPort: string | number | null
    nodePort: number | null
  }[]
  createdAt: string | null
  selector: Record<string, string>
  externalTrafficPolicy: string | null
  sessionAffinity: string
  loadBalancerIngress: { ip: string | null; hostname: string | null }[]
  healthCheckNodePort: number | null
}

function typeColor(type: string): string {
  if (type === 'LoadBalancer') return 'var(--color-accent)'
  if (type === 'NodePort') return 'var(--color-status-warning)'
  if (type === 'ExternalName') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}

function formatPorts(ports: ServiceDetail['ports']): string {
  if (!ports || ports.length === 0) return '—'
  return ports
    .map((p) => {
      const proto = p.protocol ?? 'TCP'
      const nodePort = p.nodePort ? `:${p.nodePort}` : ''
      return `${p.port}/${proto}${nodePort}`
    })
    .join(', ')
}

function ServiceExpandedDetail({ svc }: { svc: ServiceDetail }) {
  const tabs = [
    {
      id: 'selectors',
      label: 'Selectors',
      icon: <Tag className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {Object.keys(svc.selector).length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Label Selectors
              </p>
              <TagPills tags={svc.selector} />
            </div>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No selectors defined (headless service or ExternalName).
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'ports',
      label: 'Ports',
      icon: <Globe className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2">
          {svc.ports.length > 0 ? (
            <div className="rounded-lg border border-[var(--color-border)]/40 overflow-hidden">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--color-border)]/40 text-[10px] uppercase text-[var(--color-text-muted)]">
                    <th className="text-left px-3 py-1.5">Name</th>
                    <th className="text-left px-3 py-1.5">Port</th>
                    <th className="text-left px-3 py-1.5">Target</th>
                    <th className="text-left px-3 py-1.5">Protocol</th>
                    <th className="text-left px-3 py-1.5">NodePort</th>
                  </tr>
                </thead>
                <tbody>
                  {svc.ports.map((p, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]/20 last:border-0">
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                        {p.name ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-accent)]">{p.port}</td>
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                        {p.targetPort ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
                        {p.protocol ?? 'TCP'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                        {p.nodePort ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">No ports configured.</p>
          )}
          {svc.loadBalancerIngress.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Load Balancer Ingress
              </p>
              {svc.loadBalancerIngress.map((ing, i) => (
                <div key={i} className="text-[11px] font-mono text-[var(--color-accent)]">
                  {ing.hostname ?? ing.ip ?? '—'}
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Session Affinity</span>
          <span className="text-[var(--color-text-primary)]">{svc.sessionAffinity}</span>
          {svc.externalTrafficPolicy && (
            <>
              <span className="text-[var(--color-text-muted)]">External Traffic</span>
              <span className="text-[var(--color-text-primary)]">{svc.externalTrafficPolicy}</span>
            </>
          )}
          {svc.healthCheckNodePort && (
            <>
              <span className="text-[var(--color-text-muted)]">Health Check Port</span>
              <span className="text-[var(--color-text-primary)]">{svc.healthCheckNodePort}</span>
            </>
          )}
          <span className="text-[var(--color-text-muted)]">Cluster IP</span>
          <span className="text-[var(--color-text-primary)]">{svc.clusterIP ?? 'None'}</span>
        </div>
      ),
    },
  ]

  return <DetailTabs id={`svc-${svc.namespace}-${svc.name}`} tabs={tabs} />
}

export default function ServicesPage() {
  usePageTitle('Cluster Services')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const servicesQuery = trpc.services.listDetail.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, refetchInterval: 30000 },
  )

  const services = (servicesQuery.data ?? []) as ServiceDetail[]

  if (dbCluster.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view services.
        </p>
      </div>
    )
  }

  return (
    <>
      {servicesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No services found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Namespace</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">ClusterIP</th>
                <th className="text-left px-3 py-2.5">Ports</th>
                <th className="text-left px-3 py-2.5">Age</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <ExpandableTableRow
                  key={`${svc.namespace}/${svc.name}`}
                  columnCount={6}
                  cells={
                    <>
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-medium text-[var(--color-text-primary)]">
                          {svc.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                        {svc.namespace}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: typeColor(svc.type),
                            background: `color-mix(in srgb, ${typeColor(svc.type)} 15%, transparent)`,
                          }}
                        >
                          {svc.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                        {svc.clusterIP ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                        {formatPorts(svc.ports)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                        {svc.createdAt ? timeAgo(svc.createdAt) : '—'}
                      </td>
                    </>
                  }
                  detail={<ServiceExpandedDetail svc={svc} />}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
