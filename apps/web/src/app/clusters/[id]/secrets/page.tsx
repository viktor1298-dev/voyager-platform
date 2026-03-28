'use client'

import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface SecretData {
  name: string
  namespace: string
  type: string
  dataKeysCount: number
  dataKeyNames: string[]
  age: string
  labels: Record<string, string>
  annotations: Record<string, string>
}

function secretTypeColor(type: string) {
  if (type === 'kubernetes.io/tls') return 'var(--color-accent)'
  if (type === 'kubernetes.io/dockerconfigjson') return 'var(--color-status-warning)'
  if (type === 'kubernetes.io/service-account-token') return 'var(--color-text-muted)'
  return 'var(--color-text-dim)'
}

function SecretExpanded({ secret }: { secret: SecretData }) {
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
        <span className="text-[var(--color-text-muted)]">Type</span>
        <span className="text-[var(--color-text-primary)]">{secret.type}</span>
      </div>
      {secret.dataKeyNames.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Data Keys ({secret.dataKeysCount})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {secret.dataKeyNames.map((key) => (
              <span
                key={key}
                className="px-2 py-0.5 bg-white/[0.03] border border-[var(--color-border)]/40 rounded-md font-mono text-[10px] text-[var(--color-accent)]"
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      )}
      {Object.keys(secret.labels).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Labels
          </p>
          <TagPills tags={secret.labels} />
        </div>
      )}
      {Object.keys(secret.annotations).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Annotations
          </p>
          <TagPills tags={secret.annotations} />
        </div>
      )}
    </div>
  )
}

export default function SecretsPage() {
  usePageTitle('Secrets')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.secrets.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )
  const secrets = (query.data ?? []) as SecretData[]

  if (!hasCredentials)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
      </div>
    )
  if (query.isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  if (secrets.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No secrets found</p>
      </div>
    )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Namespace</th>
            <th className="text-left px-3 py-2.5">Type</th>
            <th className="text-left px-3 py-2.5">Data Keys</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {secrets.map((s) => (
            <ExpandableTableRow
              key={`${s.namespace}/${s.name}`}
              columnCount={5}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {s.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {s.namespace}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        color: secretTypeColor(s.type),
                        background: `color-mix(in srgb, ${secretTypeColor(s.type)} 12%, transparent)`,
                      }}
                    >
                      {s.type.replace('kubernetes.io/', '')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {s.dataKeysCount}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {s.age}
                  </td>
                </>
              }
              detail={<SecretExpanded secret={s} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
