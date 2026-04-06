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
  getRelationBadgeClass,
  type PrincipalType,
  type Relation,
} from '@/lib/access-control'
import { trpc } from '@/lib/trpc'

const RELATIONS: Relation[] = ['owner', 'admin', 'editor', 'viewer']

type GrantRow = {
  id: string
  principalId: string
  principalType: string
  relation: Relation
  resourceId: string
}

export const dynamic = 'force-dynamic'

export default function SettingsPermissionsPage() {
  usePageTitle('Settings — Permissions')

  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [resourceId, setResourceId] = useState('')
  const [principalId, setPrincipalId] = useState('')
  const [principalType, setPrincipalType] = useState<PrincipalType>('team')
  const [relation, setRelation] = useState<Relation>('viewer')
  const [revokeTarget, setRevokeTarget] = useState<GrantRow | null>(null)

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  const clustersQuery = trpc.clusters.list.useQuery(undefined, { enabled: isAdmin === true })
  const teamsQuery = trpc.teams.list.useQuery(undefined, { enabled: isAdmin === true })
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin === true })
  const grantMutation = trpc.authorization.grant.useMutation()
  const revokeMutation = trpc.authorization.revoke.useMutation()

  const resources = useMemo(
    () => (clustersQuery.data ?? []).map((c) => ({ id: c.id, type: 'cluster' as const, name: c.name })),
    [clustersQuery.data],
  )

  const principals = useMemo(() => {
    const userPrincipals = (usersQuery.data ?? []).map((u) => ({
      id: u.id,
      type: 'user' as const,
      name: u.name,
    }))
    const teamPrincipals = (teamsQuery.data ?? []).map((t) => ({
      id: t.id,
      type: 'team' as const,
      name: t.name,
    }))
    return [...userPrincipals, ...teamPrincipals]
  }, [usersQuery.data, teamsQuery.data])

  useEffect(() => {
    if (resources.length > 0 && !resourceId) setResourceId(resources[0].id)
  }, [resources, resourceId])

  useEffect(() => {
    if (principals.length > 0 && !principalId) {
      setPrincipalId(principals[0].id)
      setPrincipalType(principals[0].type)
    }
  }, [principals, principalId])

  const grantsQuery = trpc.authorization.listForResource.useQuery(
    { object: { type: 'cluster', id: resourceId } },
    { enabled: isAdmin === true && !!resourceId },
  )

  const grants: GrantRow[] = useMemo(() => {
    if (!grantsQuery.data) return []
    return (grantsQuery.data as unknown as Array<{ subjectType: string; subjectId: string; relation: string; objectId: string; objectType: string }>).map((g, i) => ({
      id: `${g.subjectType}-${g.subjectId}-${g.relation}-${i}`,
      principalId: g.subjectId,
      principalType: g.subjectType,
      relation: g.relation as Relation,
      resourceId: g.objectId,
    }))
  }, [grantsQuery.data])

  const principalMap = useMemo(
    () => Object.fromEntries(principals.map((p) => [p.id, p])),
    [principals],
  )
  const resourceMap = useMemo(
    () => Object.fromEntries(resources.map((r) => [r.id, r])),
    [resources],
  )

  const grantColumns = useMemo<ColumnDef<GrantRow, unknown>[]>(
    () => [
      {
        id: 'principal',
        header: 'Principal',
        cell: ({ row }) => {
          const p = principalMap[row.original.principalId]
          return (
            <span className="font-medium text-[var(--color-text-primary)]">
              {p?.name ?? row.original.principalId}
            </span>
          )
        },
      },
      {
        accessorKey: 'principalType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-xs uppercase text-[var(--color-table-meta)]">
            {row.original.principalType}
          </span>
        ),
      },
      {
        accessorKey: 'relation',
        header: 'Relation',
        cell: ({ row }) => (
          <Badge className={getRelationBadgeClass(row.original.relation)}>
            {row.original.relation}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-[var(--color-status-error)] hover:bg-red-500/12 disabled:cursor-not-allowed disabled:opacity-60 transition-colors duration-150"
            disabled={grantMutation.isPending || revokeMutation.isPending}
            onClick={() => setRevokeTarget(row.original)}
          >
            Revoke
          </button>
        ),
      },
    ],
    [grantMutation.isPending, revokeMutation.isPending, principalMap],
  )

  const matrixRows = principals.map((p) => {
    const row: Record<string, string> = { principal: p.name, type: p.type }
    for (const r of resources) {
      row[r.id] =
        grants.find((g) => g.principalId === p.id && g.resourceId === r.id)?.relation ?? '—'
    }
    return row
  })

  const matrixColumns = useMemo<ColumnDef<Record<string, string>, unknown>[]>(
    () => [
      {
        accessorKey: 'principal',
        header: 'Principal',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-text-primary)]">
            {row.original.principal}
          </span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-xs uppercase text-[var(--color-table-meta)]">
            {row.original.type}
          </span>
        ),
      },
      ...resources.map((r) => ({
        accessorKey: r.id,
        header: r.name,
        cell: ({ row }: { row: { original: Record<string, string> } }) => {
          const value = row.original[r.id]
          if (value === '—')
            return <span className="text-xs text-[var(--color-table-meta)]">—</span>
          return <Badge className={getRelationBadgeClass(value as Relation)}>{value}</Badge>
        },
      })),
    ],
    [resources],
  )

  if (isAdmin === null)
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  if (isAdmin === false) {
    router.replace('/')
    return null
  }

  const inputClass =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm'

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Permissions
        </h2>
        <p className="mt-1 text-xs font-mono uppercase tracking-wider text-[var(--color-table-meta)]">
          Resource-based access control viewer
        </p>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select
          aria-label="Principal"
          value={principalId}
          onChange={(event) => {
            const next = principals.find((p) => p.id === event.target.value)
            setPrincipalId(event.target.value)
            setPrincipalType((next?.type ?? 'user') as PrincipalType)
          }}
          className={inputClass}
          disabled={grantMutation.isPending || revokeMutation.isPending}
        >
          {principals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.type})
            </option>
          ))}
        </select>
        <select
          aria-label="Resource"
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          className={inputClass}
          disabled={grantMutation.isPending || revokeMutation.isPending}
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Relation"
          value={relation}
          onChange={(e) => setRelation(e.target.value as Relation)}
          className={inputClass}
          disabled={grantMutation.isPending || revokeMutation.isPending}
        >
          {RELATIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={grantMutation.isPending || revokeMutation.isPending}
          onClick={async () => {
            try {
              await grantMutation.mutateAsync({
                subject: { type: principalType, id: principalId },
                relation,
                object: { type: 'cluster', id: resourceId },
              })
              grantsQuery.refetch()
              toast.success('Permission granted')
            } catch {
              toast.error('Failed to grant permission')
            }
          }}
        >
          <Shield className="h-4 w-4" />
          {grantMutation.isPending ? 'Granting…' : 'Grant'}
        </button>
      </div>

      <section className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Resource Access Viewer
        </h3>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-[var(--color-table-meta)]">Selected resource:</span>
          <Badge variant="outline">{resourceMap[resourceId]?.name ?? '—'}</Badge>
        </div>
        <DataTable
          data={grants}
          columns={grantColumns}
          loading={grantsQuery.isLoading}
          emptyTitle="No permissions for this resource"
        />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Permission Matrix
        </h3>
        <div className="[&_tbody_tr:nth-child(even)]:bg-white/[0.02] dark:[&_tbody_tr:nth-child(even)]:bg-white/[0.03] [&_tbody_tr:nth-child(odd)]:bg-transparent">
          <DataTable
            data={matrixRows}
            columns={matrixColumns}
            searchable
            searchPlaceholder="Search users/teams…"
            loading={grantsQuery.isLoading}
          />
        </div>
      </section>

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={async () => {
          if (!revokeTarget || revokeMutation.isPending) return
          try {
            await revokeMutation.mutateAsync({
              subject: { type: revokeTarget.principalType as 'user' | 'team' | 'role', id: revokeTarget.principalId },
              relation: revokeTarget.relation,
              object: { type: 'cluster', id: revokeTarget.resourceId },
            })
            grantsQuery.refetch()
            setRevokeTarget(null)
            toast.success('Permission revoked')
          } catch {
            toast.error('Failed to revoke permission')
          }
        }}
        title="Revoke permission"
        description={
          <span>
            Revoke <strong>{revokeTarget?.relation}</strong> access from{' '}
            {revokeTarget ? principalMap[revokeTarget.principalId]?.name : ''}?
          </span>
        }
        confirmLabel="Revoke"
        variant="danger"
        loading={revokeMutation.isPending}
      />
    </div>
  )
}
