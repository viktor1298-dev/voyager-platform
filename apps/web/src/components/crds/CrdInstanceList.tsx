'use client'

import { Copy, FileCode, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DetailTabs, ExpandableCard } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { LiveTimeAgo } from '@/components/shared/LiveTimeAgo'

interface CrdInstanceListProps {
  clusterId: string
  group: string
  version: string
  plural: string
  scope: 'Namespaced' | 'Cluster'
}

interface CrdInstanceData {
  name: string
  namespace: string | null
  uid: string
  createdAt: string | null
}

// ---------------------------------------------------------------------------
// YAML-like JSON viewer for CRD instance
// ---------------------------------------------------------------------------

function CrdInstanceYamlViewer({
  clusterId,
  group,
  version,
  plural,
  name,
  namespace,
}: {
  clusterId: string
  group: string
  version: string
  plural: string
  name: string
  namespace?: string
}) {
  const yamlQuery = trpc.crds.instanceYaml.useQuery(
    { clusterId, group, version, plural, name, namespace },
    { staleTime: 15_000 },
  )

  const [copied, setCopied] = useState(false)

  const formatted = useMemo(() => {
    if (!yamlQuery.data) return ''
    return JSON.stringify(yamlQuery.data, null, 2)
  }, [yamlQuery.data])

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (yamlQuery.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    )
  }

  if (!yamlQuery.data) {
    return (
      <p className="p-4 text-[11px] text-[var(--color-text-muted)]">Instance data unavailable.</p>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-white/[0.06] hover:bg-white/[0.10] text-[var(--color-text-muted)] transition-colors"
      >
        <Copy className="h-3 w-3" />
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="text-[11px] font-mono text-[var(--color-text-secondary)] bg-black/20 rounded-lg p-4 overflow-auto max-h-[400px] leading-relaxed">
        {formatted}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instance detail with tabs
// ---------------------------------------------------------------------------

function InstanceDetail({
  clusterId,
  group,
  version,
  plural,
  instance,
}: {
  clusterId: string
  group: string
  version: string
  plural: string
  instance: CrdInstanceData
}) {
  const tabs = [
    {
      id: 'yaml',
      label: 'YAML',
      icon: <FileCode className="h-3.5 w-3.5" />,
      content: (
        <CrdInstanceYamlViewer
          clusterId={clusterId}
          group={group}
          version={version}
          plural={plural}
          name={instance.name}
          namespace={instance.namespace ?? undefined}
        />
      ),
    },
  ]

  return <DetailTabs id={`crd-instance-${instance.uid}`} tabs={tabs} />
}

// ---------------------------------------------------------------------------
// Instance summary row
// ---------------------------------------------------------------------------

function InstanceSummary({ instance }: { instance: CrdInstanceData }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <FileText className="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
      <span className="text-[13px] font-mono text-[var(--color-text-primary)] truncate">
        {instance.name}
      </span>
      {instance.namespace && (
        <span className="text-[11px] font-mono text-[var(--color-text-muted)] shrink-0">
          {instance.namespace}
        </span>
      )}
      <span className="text-[11px] text-[var(--color-text-dim)] font-mono shrink-0 ml-auto">
        <LiveTimeAgo date={instance.createdAt} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CrdInstanceList({
  clusterId,
  group,
  version,
  plural,
  scope,
}: CrdInstanceListProps) {
  const instancesQuery = trpc.crds.instances.useQuery(
    { clusterId, group, version, plural, scope },
    { staleTime: 15_000 },
  )

  const instances = (instancesQuery.data ?? []) as CrdInstanceData[]

  if (instancesQuery.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (instances.length === 0) {
    return (
      <div className="p-4">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          No instances found for this custom resource definition.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
        {instances.length} Instance{instances.length !== 1 ? 's' : ''}
      </p>
      {instances.map((instance) => (
        <ExpandableCard
          key={instance.uid || instance.name}
          summary={<InstanceSummary instance={instance} />}
        >
          <InstanceDetail
            clusterId={clusterId}
            group={group}
            version={version}
            plural={plural}
            instance={instance}
          />
        </ExpandableCard>
      ))}
    </div>
  )
}
