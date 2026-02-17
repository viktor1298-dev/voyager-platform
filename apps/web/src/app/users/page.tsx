'use client'

import { useForm } from '@tanstack/react-form'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Shield, ShieldAlert, Trash2, UserCog, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useOptimisticOptions } from '@/hooks/useOptimisticMutation'
import { usePermission } from '@/hooks/usePermission'
import { trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'

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

function isRenderableUser(user: UserRow | null | undefined): user is UserRow {
  if (!user) return false
  return user.id.trim().length > 0 && user.name.trim().length > 0 && user.email.trim().length > 0
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
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
      >
        <UserCog className="h-3 w-3" />
        {user.role === 'admin' ? 'Demote' : 'Promote'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  )
}

export const dynamic = 'force-dynamic'

export default function UsersPage() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const currentUserId = useAuthStore((s) => s.user?.id)

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

  const addForm = useForm({
    defaultValues: { name: '', email: '', password: '', role: 'viewer' as 'admin' | 'viewer' },
    validators: { onChange: createUserSchema },
    onSubmit: async ({ value }) => {
      createUser.mutate(value)
    },
  })

  useEffect(() => {
    const onRefresh = () => usersQuery.refetch()
    const onNew = () => {
      addForm.reset()
      setShowAdd(true)
    }
    document.addEventListener('voyager:refresh', onRefresh)
    document.addEventListener('voyager:new', onNew)
    return () => {
      document.removeEventListener('voyager:refresh', onRefresh)
      document.removeEventListener('voyager:new', onNew)
    }
  }, [usersQuery, addForm.reset])

  const allUsers: UserRow[] = usersQuery.data ?? []
  const users = useMemo(() => allUsers.filter(isRenderableUser), [allUsers])

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-muted)] font-mono text-[12px]">
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
          <span className="text-[var(--color-text-muted)] text-[12px]">
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
            return <span className="text-[10px] text-[var(--color-text-dim)] font-mono">You</span>
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
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />
        {usersQuery.error && (
          <QueryError message={usersQuery.error.message} onRetry={() => usersQuery.refetch()} />
        )}

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              User Management
            </h1>
            <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
              {users.length === allUsers.length
                ? `${users.length} users`
                : `${users.length} of ${allUsers.length} users shown`}
            </p>
          </div>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              addForm.reset()
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
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-[var(--color-text-primary)] truncate text-sm">
                  {u.name}
                </span>
                <Badge variant={u.role === 'admin' ? 'warning' : 'outline'}>
                  {u.role === 'admin' ? (
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
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <span className="text-[var(--color-text-muted)]">Email</span>
                <span className="text-[var(--color-text-primary)] font-mono truncate">
                  {u.email}
                </span>
                <span className="text-[var(--color-text-muted)]">Created</span>
                <span className="text-[var(--color-text-primary)]">{formatDate(u.createdAt)}</span>
              </div>
              {u.id !== currentUserId && (
                <div className="pt-2 border-t border-[var(--color-border)]/50 flex gap-2">
                  <UserActions
                    user={u}
                    pending={updateRole.isPending}
                    onToggleRole={() =>
                      updateRole.mutate({
                        userId: u.id,
                        role: u.role === 'admin' ? 'viewer' : 'admin',
                      })
                    }
                    onDelete={() => setDeleteTarget({ id: u.id, name: u.name })}
                  />
                </div>
              )}
            </div>
          )}
        />

        {/* Add User Modal */}
        <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add User">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addForm.handleSubmit()
            }}
            className="space-y-4"
          >
            <addForm.Field name="name">
              {(field) => (
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Name
                  </span>
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className={inputClass}
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">
                      {field.state.meta.errors.map(String).join(', ')}
                    </p>
                  )}
                </label>
              )}
            </addForm.Field>
            <addForm.Field name="email">
              {(field) => (
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Email
                  </span>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className={inputClass}
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">
                      {field.state.meta.errors.map(String).join(', ')}
                    </p>
                  )}
                </label>
              )}
            </addForm.Field>
            <addForm.Field name="password">
              {(field) => (
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Password
                  </span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className={inputClass}
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">
                      {field.state.meta.errors.map(String).join(', ')}
                    </p>
                  )}
                </label>
              )}
            </addForm.Field>
            <addForm.Field name="role">
              {(field) => (
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Role
                  </span>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as 'admin' | 'viewer')}
                    className={inputClass}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              )}
            </addForm.Field>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className={btnSecondary} onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <addForm.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <button
                    type="submit"
                    className={btnPrimary}
                    disabled={isSubmitting || createUser.isPending}
                  >
                    {createUser.isPending ? 'Creating…' : 'Create User'}
                  </button>
                )}
              </addForm.Subscribe>
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
              <span className="font-semibold text-[var(--color-text-primary)]">
                {deleteTarget?.name}
              </span>
              ? This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          variant="danger"
          loading={deleteUser.isPending}
          error={deleteUser.error?.message}
        />
      </PageTransition>
    </AppLayout>
  )
}
