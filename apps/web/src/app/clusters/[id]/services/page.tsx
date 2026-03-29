'use client'

import { Box, Globe, Settings, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, TagPills } from '@/components/expandable'
import {
  RelatedPodsList,
  ResourceDiff,
  ResourcePageScaffold,
  YamlViewer,
} from '@/components/resource'
import { useClusterResources, useConnectionState } from '@/hooks/useResources'
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
  if (!ports || ports.length === 0) return '--'
  return ports
    .map((p) => {
      const proto = p.protocol ?? 'TCP'
      const nodePort = p.nodePort ? `:${p.nodePort}` : ''
      return `${p.port}/${proto}${nodePort}`
    })
    .join(', ')
}

function ServiceSummary({ s }: { s: ServiceDetail }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {s.name}
      </span>
      <span
        className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{
          color: typeColor(s.type),
          background: `color-mix(in srgb, ${typeColor(s.type)} 15%, transparent)`,
        }}
      >
        {s.type}
      </span>
      <span className="text-xs font-mono text-[var(--color-text-muted)] shrink-0">
        {s.clusterIP ?? '--'}
      </span>
      <span className="text-xs font-mono text-[var(--color-text-secondary)] max-w-[200px] truncate shrink-0">
        {formatPorts(s.ports)}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        {s.createdAt ? timeAgo(s.createdAt) : '--'}
      </span>
    </div>
  )
}

function ServiceExpandedDetail({ svc, clusterId }: { svc: ServiceDetail; clusterId: string }) {
  const tabs = [
    {
      id: 'endpoints',
      label: 'Endpoints',
      icon: <Box className="h-3.5 w-3.5" />,
      content: (
        <RelatedPodsList
          clusterId={clusterId}
          matchLabels={svc.selector ?? {}}
          title="Endpoint Pods"
        />
      ),
    },
    {
      id: 'selectors',
      label: 'Selectors',
      icon: <Tag className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {Object.keys(svc.selector ?? {}).length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Label Selectors
              </p>
              <TagPills tags={svc.selector ?? {}} />
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
                        {p.name ?? '--'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-accent)]">{p.port}</td>
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                        {p.targetPort ?? '--'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
                        {p.protocol ?? 'TCP'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                        {p.nodePort ?? '--'}
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
                  {ing.hostname ?? ing.ip ?? '--'}
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
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="services"
          resourceName={svc.name}
          namespace={svc.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="services"
          resourceName={svc.name}
          namespace={svc.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`svc-${svc.namespace}-${svc.name}`} tabs={tabs} />
}

export default function ServicesPage() {
  usePageTitle('Services')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const services = useClusterResources<ServiceDetail>(resolvedId, 'services')
  const connectionState = useConnectionState(resolvedId)
  const isLoading = services.length === 0 && connectionState === 'initializing'

  return (
    <ResourcePageScaffold<ServiceDetail>
      title="Services"
      icon={<Globe className="h-5 w-5" />}
      queryResult={{ data: services, isLoading, error: null }}
      getNamespace={(s) => s.namespace}
      getKey={(s) => `${s.namespace}/${s.name}`}
      filterFn={(s, q) =>
        s.name.toLowerCase().includes(q) ||
        s.namespace.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q)
      }
      renderSummary={(s) => <ServiceSummary s={s} />}
      renderDetail={(s) => <ServiceExpandedDetail svc={s} clusterId={resolvedId} />}
      searchPlaceholder="Search services..."
      emptyMessage="No services found"
    />
  )
}
