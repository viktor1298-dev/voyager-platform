'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { APP_VERSION } from '@/config/constants'
import { trpc } from '@/lib/trpc'
import { DataTable } from '@/components/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, Globe, Info, Layers, Server, Wifi } from 'lucide-react'
import { useMemo } from 'react'

interface ClusterRow {
  id: string
  name: string
  provider: string
  endpoint: string
  status: string
}

const clusterColumns: ColumnDef<ClusterRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-primary)] font-medium text-[12px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'provider',
    header: 'Provider',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-secondary)] text-[12px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'endpoint',
    header: 'Endpoint',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] font-mono text-[11px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue<string>()
      const color =
        status === 'active' || status === 'healthy' || status === 'Connected'
          ? 'var(--color-status-active)'
          : status === 'warning'
            ? 'var(--color-status-warning)'
            : 'var(--color-status-error)'
      return (
        <span className="text-[11px] font-semibold" style={{ color }}>
          {status}
        </span>
      )
    },
  },
]

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)]/50 last:border-b-0">
      <span className="text-[12px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider">
        {label}
      </span>
      <span className="text-[13px] text-[var(--color-text-primary)] font-medium">
        {value}
      </span>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-6 border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] animate-slide-up"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'var(--shadow-card)',
        transition: 'border-color var(--duration-normal) ease',
      }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <span className="text-[var(--color-accent)]">{icon}</span>
        <h3 className="text-[14px] font-bold text-[var(--color-text-primary)] tracking-tight">
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${connected ? 'animate-pulse-slow' : ''}`}
        style={{
          backgroundColor: connected
            ? 'var(--color-status-active)'
            : 'var(--color-status-error)',
          boxShadow: connected
            ? '0 0 8px rgba(0, 229, 153, 0.4)'
            : '0 0 8px rgba(255, 77, 106, 0.4)',
        }}
      />
      <span
        style={{
          color: connected
            ? 'var(--color-status-active)'
            : 'var(--color-status-error)',
        }}
        className="text-[13px] font-semibold"
      >
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </span>
  )
}

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    refetchInterval: 30000,
  })
  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: 60000,
  })

  const live = liveQuery.data
  const clusters = listQuery.data ?? []
  const isConnected = !!live

  return (
    <AppLayout>
      <PageTransition>
      <Breadcrumbs />
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Settings
        </h1>
        <p className="text-[12px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
          Platform configuration & information
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Section 1: Cluster Connection */}
        <SectionCard icon={<Wifi className="h-4 w-4" />} title="Cluster Connection">
          <InfoRow label="Status" value={<StatusDot connected={isConnected} />} />
          <InfoRow
            label="API Endpoint"
            value={
              <span className="text-[12px] font-mono text-[var(--color-text-secondary)]">
                {isConnected ? (live.endpoint ?? '/trpc') : '—'}
              </span>
            }
          />
          <InfoRow label="K8s Version" value={isConnected ? live.version : '—'} />
          <InfoRow
            label="Last Sync"
            value={
              isConnected
                ? new Date().toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'
            }
          />
        </SectionCard>

        {/* Section 2: Platform Info */}
        <SectionCard icon={<Server className="h-4 w-4" />} title="Platform Info">
          <InfoRow
            label="Voyager Version"
            value={
              <span
                className="gradient-text font-bold"
                style={{ backgroundImage: 'var(--gradient-text-default)' }}
              >
                {APP_VERSION}
              </span>
            }
          />
          <InfoRow label="API Version" value="v1" />
          <InfoRow label="Runtime" value="Next.js 16 + tRPC 11" />
          <InfoRow
            label="Status"
            value={
              <span className="text-[var(--color-status-active)] text-[12px] font-semibold">
                Operational
              </span>
            }
          />
        </SectionCard>

        {/* Section 3: Registered Clusters */}
        <SectionCard icon={<Layers className="h-4 w-4" />} title="Registered Clusters">
          <ClusterTable live={live} clusters={clusters} />
        </SectionCard>

        {/* Section 4: About */}
        <SectionCard icon={<Info className="h-4 w-4" />} title="About">
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed mb-4">
            <strong className="text-[var(--color-text-primary)]">Voyager Platform</strong> —
            Unified Kubernetes Operations Dashboard. Monitor clusters, track events, and manage
            your infrastructure from a single pane of glass.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="https://github.com/vkzone/voyager-platform"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[12px] text-[var(--color-accent)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              GitHub Repository
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
            <a
              href="#"
              className="flex items-center gap-2 text-[12px] text-[var(--color-accent)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Documentation
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          </div>
        </SectionCard>
      </div>
          </PageTransition>
    </AppLayout>
  )
}

function ClusterTable({
  live,
  clusters,
}: {
  live: Record<string, unknown> | null | undefined
  clusters: Array<Record<string, unknown>>
}) {
  const rows: ClusterRow[] = useMemo(() => {
    const result: ClusterRow[] = []
    if (live) {
      result.push({
        id: 'live',
        name: (live.name as string) ?? '',
        provider: (live.provider as string) ?? '',
        endpoint: (live.endpoint as string) ?? 'in-cluster',
        status: 'Connected',
      })
    }
    for (const c of clusters) {
      if (live && ((c.name as string) === (live.name as string) || (c.name as string) === 'minikube-dev')) continue
      result.push({
        id: (c.id as string) ?? '',
        name: (c.name as string) ?? '',
        provider: (c.provider as string) ?? '',
        endpoint: (c.endpoint as string) ?? '—',
        status: (c.status as string) ?? 'Unknown',
      })
    }
    return result
  }, [live, clusters])

  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-[var(--color-text-muted)] py-4">
        No clusters registered.
      </p>
    )
  }

  return <DataTable data={rows} columns={clusterColumns} />
}
