'use client'

import { GitFork, Key, Lock, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, TagPills } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
import { RelationsTab } from '@/components/resource/RelationsTab'
import dynamic from 'next/dynamic'
const ResourceDiff = dynamic(
  () => import('@/components/resource/ResourceDiff').then((m) => ({ default: m.ResourceDiff })),
  { ssr: false },
)
const YamlViewer = dynamic(
  () => import('@/components/resource/YamlViewer').then((m) => ({ default: m.YamlViewer })),
  { ssr: false },
)
import { LiveTimeAgo } from '@/components/shared/LiveTimeAgo'
import { useClusterResources, useResourceLoading } from '@/hooks/useResources'
import { useRequestResourceTypes } from '@/hooks/useRequestResourceTypes'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface SecretData {
  name: string
  namespace: string
  type: string
  dataKeysCount: number
  dataKeyNames: string[]
  createdAt: string | null
  labels: Record<string, string>
  annotations: Record<string, string>
}

function secretTypeColor(type: string) {
  if (type === 'kubernetes.io/tls') return 'var(--color-accent)'
  if (type === 'kubernetes.io/dockerconfigjson') return 'var(--color-status-warning)'
  if (type === 'kubernetes.io/service-account-token') return 'var(--color-text-muted)'
  return 'var(--color-text-dim)'
}

function SecretSummary({ secret }: { secret: SecretData }) {
  const typeLabel = secret.type.replace('kubernetes.io/', '')
  const color = secretTypeColor(secret.type)

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <Lock className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {secret.name}
      </span>
      <span
        className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
      >
        {typeLabel}
      </span>
      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0">
        {secret.dataKeysCount} key{secret.dataKeysCount !== 1 ? 's' : ''}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        <LiveTimeAgo date={secret.createdAt} />
      </span>
    </div>
  )
}

function SecretExpandedDetail({ secret, clusterId }: { secret: SecretData; clusterId: string }) {
  const tabs = [
    {
      id: 'keys',
      label: 'Data Keys',
      icon: <Key className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-1.5">
          {secret.dataKeyNames.length > 0 ? (
            secret.dataKeyNames.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)]/40 px-3 py-1.5 text-[11px] font-mono"
              >
                <span className="text-[var(--color-accent)] font-bold">{key}</span>
                <span className="text-[var(--color-text-dim)]">***</span>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">No data keys.</p>
          )}
          <div className="mt-2 grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Type</span>
            <span className="text-[var(--color-text-primary)]">{secret.type}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'labels',
      label: 'Labels',
      icon: <Tag className="h-3.5 w-3.5" />,
      content:
        Object.keys(secret.labels ?? {}).length > 0 ? (
          <TagPills tags={secret.labels} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No labels.</p>
        ),
    },
    {
      id: 'annotations',
      label: 'Annotations',
      icon: <Tag className="h-3.5 w-3.5" />,
      content:
        Object.keys(secret.annotations ?? {}).length > 0 ? (
          <TagPills tags={secret.annotations} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No annotations.</p>
        ),
    },
    {
      id: 'relations',
      label: 'Relations',
      icon: <GitFork className="h-3.5 w-3.5" />,
      content: (
        <RelationsTab
          clusterId={clusterId}
          kind="Secret"
          namespace={secret.namespace}
          name={secret.name}
        />
      ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="secrets"
          resourceName={secret.name}
          namespace={secret.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="secrets"
          resourceName={secret.name}
          namespace={secret.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`secret-${secret.namespace}-${secret.name}`} tabs={tabs} />
}

export default function SecretsPage() {
  usePageTitle('Secrets')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  useRequestResourceTypes(resolvedId, ['secrets'] as const)

  const secrets = useClusterResources<SecretData>(resolvedId, 'secrets')
  const isLoading = useResourceLoading(resolvedId, 'secrets', secrets.length)

  return (
    <ResourcePageScaffold<SecretData>
      title="Secrets"
      icon={<Lock className="h-10 w-10 text-[var(--color-text-dim)]" />}
      queryResult={{ data: secrets, isLoading, error: null }}
      getNamespace={(s) => s.namespace}
      getKey={(s) => `${s.namespace}/${s.name}`}
      filterFn={(s, q) =>
        s.name.toLowerCase().includes(q) ||
        s.namespace.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q)
      }
      renderSummary={(s) => <SecretSummary secret={s} />}
      renderDetail={(s) => <SecretExpandedDetail secret={s} clusterId={resolvedId} />}
      searchPlaceholder="Search secrets..."
      emptyMessage="No secrets found"
      emptyDescription="Secrets will appear here when available in the cluster."
    />
  )
}
