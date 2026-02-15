'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import {
  getAllPrincipals,
  getRelationBadgeClass,
  getResources,
  mockAccessControlApi,
  type AccessGrant,
  type PrincipalType,
  type Relation,
} from '@/lib/mock-access-control'
import type { ColumnDef } from '@tanstack/react-table'
import { Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

const RELATIONS: Relation[] = ['owner', 'admin', 'editor', 'viewer']

export default function PermissionsPage() {
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
      if (mounted) {
        setGrants(data)
        setIsLoading(false)
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [isAdmin])

  const resources = getResources()
  const principals = getAllPrincipals()
  const principalMap = useMemo(() => Object.fromEntries(principals.map((principal) => [principal.id, principal])), [principals])
  const resourceMap = useMemo(() => Object.fromEntries(resources.map((resource) => [resource.id, resource])), [resources])

  const resourceGrants = useMemo(() => grants.filter((grant) => grant.resourceId === resourceId), [grants, resourceId])

  const grantColumns = useMemo<ColumnDef<AccessGrant, unknown>[]>(() => [
    {
      id: 'principal',
      header: 'Principal',
      cell: ({ row }) => {
        const principal = principalMap[row.original.principalId]
        return <span className="font-medium text-[var(--color-text-primary)]">{principal?.name ?? row.original.principalId}</span>
      },
    },
    { accessorKey: 'principalType', header: 'Type', cell: ({ row }) => <span className="text-xs uppercase text-[var(--color-text-muted)]">{row.original.principalType}</span> },
    {
      accessorKey: 'relation',
      header: 'Relation',
      cell: ({ row }) => <Badge className={getRelationBadgeClass(row.original.relation)}>{row.original.relation}</Badge>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button type="button" className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60" disabled={isGrantPending || isRevokePending} onClick={() => setRevokeTarget(row.original)}>
          Revoke
        </button>
      ),
    },
  ], [isGrantPending, isRevokePending, principalMap])

  const matrixRows = principals.map((principal) => {
    const row: Record<string, string> = { principal: principal.name, type: principal.type }
    for (const resource of resources) {
      row[resource.id] = grants.find((grant) => grant.principalId === principal.id && grant.resourceId === resource.id)?.relation ?? '—'
    }
    return row
  })

  const matrixColumns = useMemo<ColumnDef<Record<string, string>, unknown>[]>(() => [
    { accessorKey: 'principal', header: 'Principal', cell: ({ row }) => <span className="font-medium text-[var(--color-text-primary)]">{row.original.principal}</span> },
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => <span className="text-xs uppercase text-[var(--color-text-muted)]">{row.original.type}</span> },
    ...resources.map((resource) => ({
      accessorKey: resource.id,
      header: resource.name,
      cell: ({ row }: { row: { original: Record<string, string> } }) => {
        const value = row.original[resource.id]
        if (value === '—') return <span className="text-xs text-[var(--color-text-dim)]">—</span>
        return <Badge className={getRelationBadgeClass(value as Relation)}>{value}</Badge>
      },
    })),
  ], [resources])

  if (!isAdmin) return null

  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm'

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Permissions</h1>
          <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Resource-based access control viewer</p>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <select aria-label="Principal" value={principalId} onChange={(event) => {
            const next = principals.find((principal) => principal.id === event.target.value)
            setPrincipalId(event.target.value)
            setPrincipalType((next?.type ?? 'user') as PrincipalType)
          }} className={inputClass} disabled={isGrantPending || isRevokePending}>
            {principals.map((principal) => <option key={principal.id} value={principal.id}>{principal.name} ({principal.type})</option>)}
          </select>
          <select aria-label="Resource" value={resourceId} onChange={(event) => setResourceId(event.target.value)} className={inputClass} disabled={isGrantPending || isRevokePending}>
            {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
          </select>
          <select aria-label="Relation" value={relation} onChange={(event) => setRelation(event.target.value as Relation)} className={inputClass} disabled={isGrantPending || isRevokePending}>
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
              } finally {
                setIsGrantPending(false)
              }
            }}
          >
            <Shield className="h-4 w-4" />{isGrantPending ? 'Granting…' : 'Grant'}
          </button>
        </div>

        <section className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Resource Access Viewer</h2>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Selected resource:</span>
            <Badge variant="outline">{resourceMap[resourceId]?.name}</Badge>
          </div>
          <DataTable data={resourceGrants} columns={grantColumns} loading={isLoading} emptyTitle="No permissions for this resource" />
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Permission Matrix</h2>
          <DataTable data={matrixRows} columns={matrixColumns} searchable searchPlaceholder="Search users/teams…" loading={isLoading} />
        </section>

        <ConfirmDialog
          open={revokeTarget !== null}
          onClose={() => setRevokeTarget(null)}
          onConfirm={async () => {
            if (!revokeTarget || isRevokePending) return
            try {
              setIsRevokePending(true)
              await mockAccessControlApi.permissions.revoke({ grantId: revokeTarget.id })
              setGrants((prev) => prev.filter((grant) => grant.id !== revokeTarget.id))
              setRevokeTarget(null)
              toast.success('Permission revoked')
            } finally {
              setIsRevokePending(false)
            }
          }}
          title="Revoke permission"
          description={<span>Revoke <strong>{revokeTarget?.relation}</strong> access from {revokeTarget ? principalMap[revokeTarget.principalId]?.name : ''}?</span>}
          confirmLabel="Revoke"
          variant="danger"
          loading={isRevokePending}
        />
      </PageTransition>
    </AppLayout>
  )
}
