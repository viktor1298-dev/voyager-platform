'use client'

import { useForm } from '@tanstack/react-form'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Shield, ShieldAlert, Trash2, UserCog, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useOptimisticOptions } from '@/hooks/useOptimisticMutation'
import { usePermission } from '@/hooks/usePermission'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
  role: z.enum(['admin', 'viewer'] as const),
})

function formatDate(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

type UserRow = {
  id: string
  name: string
  email: string
  role: string | null
  createdAt: string | Date | null
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function sanitizeUserRow(raw: unknown): UserRow | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Record<string, unknown>
  const id = normalizeNonEmptyString(candidate.id)
  const email = normalizeNonEmptyString(candidate.email)
  if (!id || !email) return null
  const nameFromApi = normalizeNonEmptyString(candidate.name)
  const fallbackName = email.split('@')[0]?.trim() || 'Unknown user'
  const name = nameFromApi ?? fallbackName
  const role = typeof candidate.role === 'string' ? candidate.role : null
  const createdAt =
    typeof candidate.createdAt === 'string' || candidate.createdAt instanceof Date
      ? candidate.createdAt
      : null
  return { id, name, email, role, createdAt }
}

function UserActions({
  user,
  onToggleRole,
  onDelete,
  pending,
}: {
  user: UserRow
  onToggleRole: () => void
  onDelete: () => void
  pending: boolean
}) {
  const canManage = usePermission('user', user.id, 'admin')
  if (!canManage) return null
  return (
    <>
      <button
        type="button"
        onClick={onToggleRole}
        disabled={pending}
        className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-xs font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
      >
        <UserCog className="h-3 w-3" />
        {user.role === 'admin' ? 'Demote' : 'Promote'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete user"
        className="min-h-11 min-w-11 px-2.5 py-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  )
}

export const dynamic = 'force-dynamic'

export default function SettingsUsersPage() {
  usePageTitle('Settings — Users')

  const router = useRouter()
  const { data: session, isPending: isSessionPending } = authClient.useSession()
  const currentUserId = session?.user?.id
  const isAdmin = isSessionPending ? null : (session?.user as { role?: string } | undefined)?.role === 'admin'

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin === true })
  const userQueryKey = [['users', 'list'], { type: 'query' }] as const

  const createUser = trpc.users.create.useMutation(
    useOptimisticOptions<
      UserRow[],
      { name: string; email: string; password: string; role?: 'admin' | 'viewer' }
    >({
      queryKey: userQueryKey,
      updater: (old, vars) => [
        ...(old ?? []),
        {
          id: `temp-${Date.now()}`,
          name: vars.name,
          email: vars.email,
          role: vars.role ?? 'viewer',
          createdAt: new Date().toISOString(),
        },
      ],
      successMessage: 'User created',
      errorMessage: 'Failed to create user — rolled back',
      onSuccess: () => setShowAdd(false),
    }),
  )
  const updateRole = trpc.users.updateRole.useMutation(
    useOptimisticOptions<UserRow[], { userId: string; role: string }>({
      queryKey: userQueryKey,
      updater: (old, vars) =>
        (old ?? []).map((u) => (u.id === vars.userId ? { ...u, role: vars.role } : u)),
      successMessage: 'Role updated',
      errorMessage: 'Failed to update role — rolled back',
    }),
  )
  const deleteUser = trpc.users.delete.useMutation(
    useOptimisticOptions<UserRow[], { userId: string }>({
      queryKey: userQueryKey,
      updater: (old, vars) => (old ?? []).filter((u) => u.id !== vars.userId),
      successMessage: 'User deleted',
      errorMessage: 'Failed to delete user — rolled back',
      onSuccess: () => setDeleteTarget(null),
    }),
  )

  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const addFormation = useForm({
    defaultValues: { name: '', email: '', password: '', role: 'viewer' as 'admin' | 'viewer' },
    validators: { onChange: createUserSchema },
    onSubmit: async ({ value }) => {
      createUser.mutate(value)
    },
  })

  useEffect(() => {
    const onRefresh = () => usersQuery.refetch()
    const onNew = () => {
      addFormation.reset()
      setShowAdd(true)
    }
    document.addEventListener('voyager:refresh', onRefresh)
    document.addEventListener('voyager:new', onNew)
    return () => {
      document.removeEventListener('voyager:refresh', onRefresh)
      document.removeEventListener('voyager:new', onNew)
    }
  }, [usersQuery, addFormation.reset])

  const users = useMemo(() => {
    const rawUsers: unknown[] = Array.isArray(usersQuery.data) ? usersQuery.data : []
    return rawUsers.map(sanitizeUserRow).filter((user): user is UserRow => user !== null)
  }, [usersQuery.data])

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[var(--color-text-muted)] font-mono text-xs">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Badge variant={row.original.role === 'admin' ? 'warning' : 'outline'}>
            {row.original.role === 'admin' ? (
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Admin
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Viewer
              </span>
            )}
          </Badge>
        ),
      },
      {
        id: 'created',
        header: 'Created',
        accessorFn: (row) => row.createdAt,
        cell: ({ row }) => (
          <span className="text-[var(--color-text-muted)] text-xs">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original
          if (u.id === currentUserId)
            return <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5 bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/25">You</Badge>
          return (
            <div className="flex items-center gap-2">
              <UserActions
                user={u}
                pending={updateRole.isPending}
                onToggleRole={() =>
                  updateRole.mutate({ userId: u.id, role: u.role === 'admin' ? 'viewer' : 'admin' })
                }
                onDelete={() => setDeleteTarget({ id: u.id, name: u.name })}
              />
            </div>
          )
        },
      },
    ],
    [currentUserId, updateRole],
  )

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'
  const btnPrimary =
    'px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer'
  const btnSecondary =
    'px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer'

  if (isAdmin === null)
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )

  if (isAdmin === false) return null

  return (
    <div>
      {usersQuery.error && (
        <QueryError message={usersQuery.error.message} onRetry={() => usersQuery.refetch()} />
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            User Management
          </h2>
          <p className="text-xs text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
            {`${users.length} users`}
          </p>
        </div>
        <button
          type="button"
          className={`${btnPrimary} w-full sm:w-auto`}
          onClick={() => {
            addFormation.reset()
            setShowAdd(true)
          }}
        >
          <span className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Add User
          </span>
        </button>
      </div>

      <DataTable
        data={users}
        columns={columns}
        searchable
        searchPlaceholder="Search users…"
        loading={usersQuery.isLoading}
        emptyIcon={<Users className="h-10 w-10" />}
        emptyTitle="No users found"
        mobileCard={(u) => (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2 min-w-0">
            <div className="flex justify-between items-center gap-2 min-w-0">
              <span className="font-semibold text-[var(--color-text-primary)] truncate text-sm min-w-0">
                {u.name}
              </span>
              <Badge variant={u.role === 'admin' ? 'warning' : 'outline'} className="shrink-0">
                {u.role === 'admin' ? (
                  <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Admin</span>
                ) : (
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3" />Viewer</span>
                )}
              </Badge>
            </div>
            <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-xs">
              <span className="text-[var(--color-text-muted)]">Email</span>
              <span className="text-[var(--color-text-primary)] font-mono break-all min-w-0">{u.email}</span>
              <span className="text-[var(--color-text-muted)]">Created</span>
              <span className="text-[var(--color-text-primary)]">{formatDate(u.createdAt)}</span>
            </div>
          </div>
        )}
      />

      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add User">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addFormation.handleSubmit()
          }}
          className="space-y-4"
        >
          <addFormation.Field name="name">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Name</span>
                <input type="text" placeholder="John Doe" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} className={inputClass} />
                {field.state.meta.errors?.length > 0 && <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map(String).join(', ')}</p>}
              </label>
            )}
          </addFormation.Field>
          <addFormation.Field name="email">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Email</span>
                <input type="email" placeholder="john@example.com" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} className={inputClass} />
                {field.state.meta.errors?.length > 0 && <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map(String).join(', ')}</p>}
              </label>
            )}
          </addFormation.Field>
          <addFormation.Field name="password">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Password</span>
                <input type="password" placeholder="••••••••" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} className={inputClass} />
                {field.state.meta.errors?.length > 0 && <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map(String).join(', ')}</p>}
              </label>
            )}
          </addFormation.Field>
          <addFormation.Field name="role">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Role</span>
                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value as 'admin' | 'viewer')} className={inputClass}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}
          </addFormation.Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
            <addFormation.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <button type="submit" className={btnPrimary} disabled={isSubmitting || createUser.isPending}>
                  {createUser.isPending ? 'Creating…' : 'Create User'}
                </button>
              )}
            </addFormation.Subscribe>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteUser.mutate({ userId: deleteTarget.id })}
        title="Delete User"
        description={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">{deleteTarget?.name}</span>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleteUser.isPending}
        error={deleteUser.error?.message}
      />
    </div>
  )
}
