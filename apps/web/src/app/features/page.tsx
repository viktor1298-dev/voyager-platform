'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { FeatureFlagToggle } from '@/components/FeatureFlagToggle'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { mockAdminApi, type FeatureFlag } from '@/lib/mock-admin-api'
import type { ColumnDef } from '@tanstack/react-table'
import { Flag } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function FeatureFlagsPage() {
  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    let mounted = true

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await mockAdminApi.features.listWithMeta()
        if (mounted) setFlags(data)
      } catch {
        if (mounted) setError('Failed to load feature flags')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void run()
    return () => {
      mounted = false
    }
  }, [isAdmin])

  if (!isAdmin) return null

  const columns = useMemo<ColumnDef<FeatureFlag, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-[var(--color-text-secondary)]">{row.original.description}</span>,
    },
    {
      accessorKey: 'enabled',
      header: 'Status',
      cell: ({ row }) => (
        <FeatureFlagToggle
          name={row.original.name}
          enabled={row.original.enabled}
          targeting={row.original.targeting}
          critical={row.original.critical}
          onToggle={async (nextEnabled) => {
            setFlags((prev) => prev.map((flag) => (flag.id === row.original.id ? { ...flag, enabled: nextEnabled } : flag)))
            try {
              // Placeholder for: trpc.features.update.useMutation()
              await mockAdminApi.features.update({ id: row.original.id, enabled: nextEnabled })
              setFlags((prev) => prev.map((flag) => (flag.id === row.original.id ? { ...flag, updatedAt: new Date().toISOString() } : flag)))
              toast.success(`Feature flag ${nextEnabled ? 'enabled' : 'disabled'}`)
            } catch {
              setFlags((prev) => prev.map((flag) => (flag.id === row.original.id ? { ...flag, enabled: !nextEnabled } : flag)))
              toast.error('Failed to update feature flag')
              throw new Error('Failed to update feature flag')
            }
          }}
        />
      ),
    },
    {
      accessorKey: 'targeting',
      header: 'Targeting',
      cell: ({ row }) => <span className="text-[11px] font-mono text-[var(--color-text-muted)]">{row.original.targeting}</span>,
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated At',
      cell: ({ row }) => <span className="text-[11px] text-[var(--color-text-muted)]">{formatDate(row.original.updatedAt)}</span>,
    },
  ], [])

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Feature Flags</h1>
          <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">{flags.length} flags</p>
        </div>

        {error && <QueryError message={error} onRetry={() => window.location.reload()} />}

        <DataTable
          data={flags}
          columns={columns}
          loading={isLoading}
          searchable
          searchPlaceholder="Search feature flags…"
          emptyIcon={<Flag className="h-10 w-10" />}
          emptyTitle="No feature flags"
          mobileCard={(flag) => (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--color-text-primary)] text-sm">{flag.name}</span>
                <FeatureFlagToggle
                  name={flag.name}
                  enabled={flag.enabled}
                  targeting={flag.targeting}
                  critical={flag.critical}
                  onToggle={async (nextEnabled) => {
                    setFlags((prev) => prev.map((item) => (item.id === flag.id ? { ...item, enabled: nextEnabled } : item)))
                    await mockAdminApi.features.update({ id: flag.id, enabled: nextEnabled })
                    toast.success(`Feature flag ${nextEnabled ? 'enabled' : 'disabled'}`)
                  }}
                />
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">{flag.description}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-[var(--color-text-muted)]">Targeting</span>
                <span className="font-mono text-[var(--color-text-primary)]">{flag.targeting}</span>
                <span className="text-[var(--color-text-muted)]">Updated</span>
                <span className="text-[var(--color-text-primary)]">{formatDate(flag.updatedAt)}</span>
              </div>
            </div>
          )}
        />
      </PageTransition>
    </AppLayout>
  )
}
