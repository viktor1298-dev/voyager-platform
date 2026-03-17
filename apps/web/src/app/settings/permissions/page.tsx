'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  getAllPrincipals,
  getRelationBadgeClass,
  getResources,
  mockAccessControlApi,
  type AccessGrant,
  type PrincipalType,
  type Relation,
} from '@/lib/mock-access-control'

const RELATIONS: Relation[] = ['owner', 'admin', 'editor', 'viewer']

export const dynamic = 'force-dynamic'

export default function SettingsPermissionsPage() {
  usePageTitle('Settings — Permissions')

  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [resourceId, setResourceId] = useState('cluster-production-eks')
  const [principalId, setPrincipalId] = useState('team-platform')
  const [principalType, setPrincipalType] = useState<PrincipalType>('team')
  const [relation, setRelation] = useState<Relation>('viewer')
  const [revokeTarget, setRevokeTarget] = useState<AccessGrant | null>(null)
  const [isGrantPending, setIsGrantPending] = useState(false)
  const [isRevokePending, setIsRevokePending] = useState(false)

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    let mounted = true
    const run = async () => {
      setIsLoading(true)
      const data = await mockAccessControlApi.permissions.listGrants()
      if (mounted) { setGrants(data); setIsLoading(false) }
    }
    void run()
    return () => { mounted = false }
  }, [isAdmin])

  const resources = getResources()
  const principals = getAllPrincipals()
  const principalMap = useMemo(() => Object.fromEntries(principals.map((p) => [p.id, p])), [principals])
  const resourceMap = useMemo(() => Object.fromEntries(resources.map((r) => [r.id, r])), [resources])
  const resourceGrants = useMemo(() => grants.filter((g) => g.resourceId === resourceId), [grants, resourceId])

  const grantColumns = useMemo<ColumnDef<AccessGrant, unknown>[]>(() => [
    {
      id: 'principal', header: 'Principal',
      cell: ({ row }) => {
        const p = principalMap[row.original.principalId]
        return <span className="font-medium text-[var(--color-text-primary)]">{p?.name ?? row.original.principalId}</span>
      },
    },
    { accessorKey: 'principalType', header: 'Type', cell: ({ row }) => <span className="text-xs uppercase text-[var(--color-table-meta)]">{row.original.principalType}</span> },
    { accessorKey: 'relation', header: 'Relation', cell: ({ row }) => <Badge className={getRelationBadgeClass(row.original.relation)}>{row.original.relation}</Badge> },
    {
      id: 'actions', header: '',
      cell: ({ row }) => (
        <button type="button" className="rounded-md px-2 py-1 text-xs text-[var(--color-status-error)] hover:bg-red-500/12 disabled:cursor-not-allowed disabled:opacity-60" disabled={isGrantPending || isRevokePending} onClick={() => setRevokeTarget(row.original)}>
          Revoke
        </button>
      ),
    },
  ], [isGrantPending, isRevokePending, principalMap])

  const matrixRows = principals.map((p) => {
    const row: Record<string, string> = { principal: p.name, type: p.type }
    for (const r of resources) {
      row[r.id] = grants.find((g) => g.principalId === p.id && g.resourceId === r.id)?.relation ?? '—'
    }
    return row
  })

  const matrixColumns = useMemo<ColumnDef<Record<string, string>, unknown>[]>(() => [
    { accessorKey: 'principal', header: 'Principal', cell: ({ row }) => <span className="font-medium text-[var(--color-text-primary)]">{row.original.principal}</span> },
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => <span className="text-xs uppercase text-[var(--color-table-meta)]">{row.original.type}</span> },
    ...resources.map((r) => ({
      accessorKey: r.id, header: r.name,
      cell: ({ row }: { row: { original: Record<string, string> } }) => {
        const value = row.original[r.id]
        if (value === '—') return <span className="text-xs text-[var(--color-table-meta)]">—</span>
        return <Badge className={getRelationBadgeClass(value as Relation)}>{value}</Badge>
      },
    })),
  ], [resources])

  if (isAdmin === null)
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  if (isAdmin === false) { router.replace('/'); return null }

  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm'

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Permissions</h2>
        <p className="mt-1 text-xs font-mono uppercase tracking-wider text-[var(--color-table-meta)]">Resource-based access control viewer</p>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select aria-label="Principal" value={principalId} onChange={(event) => {
          const next = principals.find((p) => p.id === event.target.value)
          setPrincipalId(event.target.value)
          setPrincipalType((next?.type ?? 'user') as PrincipalType)
        }} className={inputClass} disabled={isGrantPending || isRevokePending}>
          {principals.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
        </select>
        <select aria-label="Resource" value={resourceId} onChange={(e) => setResourceId(e.target.value)} className={inputClass} disabled={isGrantPending || isRevokePending}>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select aria-label="Relation" value={relation} onChange={(e) => setRelation(e.target.value as Relation)} className={inputClass} disabled={isGrantPending || isRevokePending}>
          {RELATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isGrantPending || isRevokePending}
          onClick={async () => {
            try {
              setIsGrantPending(true)
              await mockAccessControlApi.permissions.grant({ principalId, principalType, resourceId, relation })
              setGrants(await mockAccessControlApi.permissions.listGrants())
              toast.success('Permission granted')
            } finally { setIsGrantPending(false) }
          }}
        >
          <Shield className="h-4 w-4" />{isGrantPending ? 'Granting…' : 'Grant'}
        </button>
      </div>

      <section className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Resource Access Viewer</h3>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-[var(--color-table-meta)]">Selected resource:</span>
          <Badge variant="outline">{resourceMap[resourceId]?.name}</Badge>
        </div>
        <DataTable data={resourceGrants} columns={grantColumns} loading={isLoading} emptyTitle="No permissions for this resource" />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Permission Matrix</h3>
        {/* Zebra striping for dense matrix readability */}
        <div className="[&_tbody_tr:nth-child(even)]:bg-white/[0.02] dark:[&_tbody_tr:nth-child(even)]:bg-white/[0.03] [&_tbody_tr:nth-child(odd)]:bg-transparent">
          <DataTable data={matrixRows} columns={matrixColumns} searchable searchPlaceholder="Search users/teams…" loading={isLoading} />
        </div>
      </section>

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={async () => {
          if (!revokeTarget || isRevokePending) return
          try {
            setIsRevokePending(true)
            await mockAccessControlApi.permissions.revoke({ grantId: revokeTarget.id })
            setGrants((prev) => prev.filter((g) => g.id !== revokeTarget.id))
            setRevokeTarget(null)
            toast.success('Permission revoked')
          } finally { setIsRevokePending(false) }
        }}
        title="Revoke permission"
        description={<span>Revoke <strong>{revokeTarget?.relation}</strong> access from {revokeTarget ? principalMap[revokeTarget.principalId]?.name : ''}?</span>}
        confirmLabel="Revoke"
        variant="danger"
        loading={isRevokePending}
      />
    </div>
  )
}
