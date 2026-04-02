// apps/web/src/components/resource/RelationsTab.tsx
'use client'

import { KIND_TO_TAB } from '@voyager/types'
import type { RelationGroup, RelationResource } from '@voyager/types'
import {
  Box,
  CircleDot,
  Database,
  FileText,
  GitFork,
  Globe,
  HardDrive,
  Lock,
  Network,
  Server,
  Timer,
  Workflow,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { SYNC_INTERVAL_MS } from '@/config/constants'
import { trpc } from '@/lib/trpc'
import { RelatedResourceLink } from './RelatedResourceLink'

// ── Icon mapping per resource kind ──────────────────────────

const KIND_ICONS: Record<string, ReactNode> = {
  Ingress: <Globe className="h-3.5 w-3.5" />,
  Service: <Network className="h-3.5 w-3.5" />,
  Deployment: <Server className="h-3.5 w-3.5" />,
  StatefulSet: <Database className="h-3.5 w-3.5" />,
  DaemonSet: <Workflow className="h-3.5 w-3.5" />,
  Job: <Zap className="h-3.5 w-3.5" />,
  CronJob: <Timer className="h-3.5 w-3.5" />,
  Pod: <Box className="h-3.5 w-3.5" />,
  HorizontalPodAutoscaler: <CircleDot className="h-3.5 w-3.5" />,
  ConfigMap: <FileText className="h-3.5 w-3.5" />,
  Secret: <Lock className="h-3.5 w-3.5" />,
  PersistentVolumeClaim: <HardDrive className="h-3.5 w-3.5" />,
  Node: <Server className="h-3.5 w-3.5" />,
}

// ── Status badge colors ─────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  healthy: {
    bg: 'bg-[var(--color-status-active)]/12',
    text: 'text-[var(--color-status-active)]',
    dot: 'bg-[var(--color-status-active)]',
  },
  warning: {
    bg: 'bg-[var(--color-status-warning)]/12',
    text: 'text-[var(--color-status-warning)]',
    dot: 'bg-[var(--color-status-warning)]',
  },
  error: {
    bg: 'bg-[var(--color-status-error)]/12',
    text: 'text-[var(--color-status-error)]',
    dot: 'bg-[var(--color-status-error)]',
  },
  unknown: {
    bg: 'bg-[var(--color-text-muted)]/12',
    text: 'text-[var(--color-text-muted)]',
    dot: 'bg-[var(--color-text-muted)]',
  },
}

// ── Sub-components ──────────────────────────────────────────

function StatusBadge({ status, category }: { status: string; category: string }) {
  const colors = STATUS_COLORS[category] ?? STATUS_COLORS.unknown
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] ${colors.bg} ${colors.text}`}
    >
      <span className={`h-1 w-1 rounded-full ${colors.dot}`} />
      {status}
    </span>
  )
}

function RelationItem({ resource, kind }: { resource: RelationResource; kind: string }) {
  const tab = KIND_TO_TAB[kind]
  if (!tab) return null

  if (resource.isCurrent) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/[0.06] border-l-2 border-[var(--color-accent)] px-2 py-1 -ml-2 min-w-0">
        <span className="text-[var(--color-accent)] shrink-0">{KIND_ICONS[kind]}</span>
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {resource.name}
        </span>
        <StatusBadge status={resource.status} category={resource.statusCategory} />
        <span className="text-[10px] italic text-[var(--color-accent)] shrink-0">← current</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <RelatedResourceLink
        tab={tab}
        resourceKey={resource.namespace ? `${resource.namespace}/${resource.name}` : resource.name}
        label={resource.name}
        icon={KIND_ICONS[kind]}
      />
      <span className="shrink-0">
        <StatusBadge status={resource.status} category={resource.statusCategory} />
      </span>
    </div>
  )
}

function RelationGroupSection({ group }: { group: RelationGroup }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
        {group.displayName}
      </p>
      <div className="flex flex-col gap-1">
        {group.resources.map((r) => (
          <RelationItem key={`${r.namespace}/${r.name}`} resource={r} kind={group.kind} />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

interface RelationsTabProps {
  clusterId: string
  kind: string
  namespace: string
  name: string
}

export function RelationsTab({ clusterId, kind, namespace, name }: RelationsTabProps) {
  const { data, isLoading } = trpc.relations.forResource.useQuery(
    { clusterId, kind, namespace, name },
    { staleTime: SYNC_INTERVAL_MS, refetchOnWindowFocus: true },
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-40 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-36 rounded bg-white/[0.04] animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  const groups = data?.groups ?? []

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-[var(--color-text-muted)]">No related resources found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5 p-3">
      {groups.map((group) => (
        <RelationGroupSection key={group.kind} group={group} />
      ))}
    </div>
  )
}
