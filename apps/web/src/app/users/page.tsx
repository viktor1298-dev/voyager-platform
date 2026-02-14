'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useAuthStore } from '@/stores/auth'
import { trpc } from '@/lib/trpc'
import { useForm } from '@tanstack/react-form'
import { Plus, Shield, ShieldAlert, Trash2, UserCog, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Minimum 6 characters'),
  role: z.enum(['admin', 'viewer'] as const),
})

function formatDate(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function UsersPage() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const currentUserId = useAuthStore((s) => s.user?.id)

  // Redirect non-admins
  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  const utils = trpc.useUtils()
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin })
  const createUser = trpc.users.create.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); setShowAdd(false) },
  })
  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => utils.users.list.invalidate(),
  })
  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); setDeleteTarget(null) },
  })

  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const addForm = useForm({
    defaultValues: { name: '', email: '', password: '', role: 'viewer' as 'admin' | 'viewer' },
    validators: { onChange: createUserSchema },
    onSubmit: async ({ value }) => {
      createUser.mutate(value)
    },
  })

  const users = usersQuery.data ?? []

  if (!isAdmin) return null

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'
  const btnPrimary =
    'px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer'
  const btnSecondary =
    'px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer'

  return (
    <AppLayout>
      <Breadcrumbs />

      {usersQuery.error && (
        <QueryError message={usersQuery.error.message} onRetry={() => usersQuery.refetch()} />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            User Management
          </h1>
          <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
            {users.length} users
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => { addForm.reset(); setShowAdd(true) }}>
          <span className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Add User
          </span>
        </button>
      </div>

      {/* Users Table */}
      <div
        className="rounded-xl border border-[var(--color-border)] overflow-hidden"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}
      >
        {usersQuery.isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
            <Users className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No users found</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 p-3">
              {users.map((u) => (
                <div key={u.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-[var(--color-text-primary)] truncate text-sm">
                      {u.name}
                    </span>
                    <Badge variant={u.role === 'admin' ? 'warning' : 'outline'}>
                      {u.role === 'admin' ? (
                        <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Admin</span>
                      ) : (
                        <span className="flex items-center gap-1"><Shield className="h-3 w-3" />Viewer</span>
                      )}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <span className="text-[var(--color-text-muted)]">Email</span>
                    <span className="text-[var(--color-text-primary)] font-mono truncate">{u.email}</span>
                    <span className="text-[var(--color-text-muted)]">Created</span>
                    <span className="text-[var(--color-text-primary)]">{formatDate(u.createdAt)}</span>
                  </div>
                  {u.id !== currentUserId && (
                    <div className="pt-2 border-t border-[var(--color-border)]/50 flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateRole.mutate({ userId: u.id, role: u.role === 'admin' ? 'viewer' : 'admin' })}
                        disabled={updateRole.isPending}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <UserCog className="h-3 w-3" />
                        {u.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
                        className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['Name', 'Email', 'Role', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
                  >
                    <td className="py-3 px-4 font-medium text-[var(--color-text-primary)]">{u.name}</td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-[12px]">{u.email}</td>
                    <td className="py-3 px-4">
                      <Badge variant={u.role === 'admin' ? 'warning' : 'outline'}>
                        {u.role === 'admin' ? (
                          <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Admin</span>
                        ) : (
                          <span className="flex items-center gap-1"><Shield className="h-3 w-3" />Viewer</span>
                        )}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)] text-[12px]">{formatDate(u.createdAt)}</td>
                    <td className="py-3 px-4">
                      {u.id !== currentUserId ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateRole.mutate({ userId: u.id, role: u.role === 'admin' ? 'viewer' : 'admin' })}
                            disabled={updateRole.isPending}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                          >
                            <UserCog className="h-3 w-3" />
                            {u.role === 'admin' ? 'Demote' : 'Promote'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--color-text-dim)] font-mono">You</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Add User Modal */}
      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add User">
        <form
          onSubmit={(e) => { e.preventDefault(); addForm.handleSubmit() }}
          className="space-y-4"
        >
          <addForm.Field name="name">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Name</span>
                <input type="text" placeholder="John Doe" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} className={inputClass} />
                {field.state.meta.errors?.length > 0 && <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map(String).join(', ')}</p>}
              </label>
            )}
          </addForm.Field>
          <addForm.Field name="email">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Email</span>
                <input type="email" placeholder="john@example.com" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} className={inputClass} />
                {field.state.meta.errors?.length > 0 && <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map(String).join(', ')}</p>}
              </label>
            )}
          </addForm.Field>
          <addForm.Field name="password">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Password</span>
                <input type="password" placeholder="••••••••" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} className={inputClass} />
                {field.state.meta.errors?.length > 0 && <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map(String).join(', ')}</p>}
              </label>
            )}
          </addForm.Field>
          <addForm.Field name="role">
            {(field) => (
              <label className="block">
                <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Role</span>
                <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value as 'admin' | 'viewer')} className={inputClass}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}
          </addForm.Field>
          {createUser.error && <p className="text-xs text-red-400">{createUser.error.message}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
            <addForm.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <button type="submit" className={btnPrimary} disabled={isSubmitting || createUser.isPending}>
                  {createUser.isPending ? 'Creating…' : 'Create User'}
                </button>
              )}
            </addForm.Subscribe>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete User">
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-[var(--color-text-primary)]">{deleteTarget?.name}</span>?
          This action cannot be undone.
        </p>
        {deleteUser.error && <p className="text-xs text-red-400 mb-4">{deleteUser.error.message}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
            onClick={() => deleteTarget && deleteUser.mutate({ userId: deleteTarget.id })}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Dialog>
    </AppLayout>
  )
}
