'use client'

import { useForm } from '@tanstack/react-form'
import type { ColumnDef } from '@tanstack/react-table'
import { motion } from 'motion/react'
import { Plus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cardHover, cardTap } from '@/lib/animation-constants'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type TeamRole, TEAM_ROLE_OPTIONS } from '@/lib/access-control'
import { trpc } from '@/lib/trpc'

const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name is required'),
  description: z.string().min(4, 'Description is required'),
})

const teamRoles: TeamRole[] = TEAM_ROLE_OPTIONS

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type TeamRow = {
  id: string
  name: string
  description: string | null
  createdAt: string | Date
  members: Array<{
    userId: string
    name: string
    email: string
    role: TeamRole
    avatar: string
  }>
}

export const dynamic = 'force-dynamic'

export default function SettingsTeamsPage() {
  usePageTitle('Settings — Teams')
  const reduced = useReducedMotion()

  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const teamsQuery = trpc.teams.list.useQuery(undefined, { enabled: isAdmin === true })
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin === true })
  const createMutation = trpc.teams.create.useMutation()
  const addMemberMutation = trpc.teams.addMember.useMutation()
  const removeMemberMutation = trpc.teams.removeMember.useMutation()

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  useEffect(() => {
    if (teamsQuery.data && teamsQuery.data.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teamsQuery.data[0].id)
    }
  }, [teamsQuery.data, selectedTeamId])

  const teams: TeamRow[] = useMemo(() => {
    if (!teamsQuery.data) return []
    return teamsQuery.data.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      createdAt: team.createdAt,
      members: (team as unknown as { members?: TeamRow['members'] }).members ?? [],
    }))
  }, [teamsQuery.data])

  const userOptions = useMemo(() => {
    if (!usersQuery.data) return []
    return usersQuery.data.map((u) => ({ id: u.id, name: u.name }))
  }, [usersQuery.data])

  const [memberToAdd, setMemberToAdd] = useState('')
  const [roleToAdd, setRoleToAdd] = useState<TeamRole>('member')

  useEffect(() => {
    if (userOptions.length > 0 && !memberToAdd) {
      setMemberToAdd(userOptions[0].id)
    }
  }, [userOptions, memberToAdd])

  const createForm = useForm({
    defaultValues: { name: '', description: '' },
    validators: { onChange: createTeamSchema },
    onSubmit: async ({ value }) => {
      try {
        const created = await createMutation.mutateAsync(value)
        setSelectedTeamId(created.id)
        setShowCreate(false)
        teamsQuery.refetch()
        toast.success('Team created')
      } catch {
        toast.error('Failed to create team')
      }
    },
  })

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null

  const teamColumns = useMemo<ColumnDef<TeamRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-semibold text-[var(--color-text-primary)]">
            {row.original.name}
          </span>
        ),
      },
      {
        id: 'members',
        header: 'Members',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--color-text-secondary)]">
            {row.original.members.length}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  )

  const memberColumns = useMemo<ColumnDef<TeamRow['members'][number], unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Member',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="text-xs font-mono text-[var(--color-text-muted)]">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)]">
            {row.original.role}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 transition-colors duration-150"
            onClick={async () => {
              if (!selectedTeam) return
              try {
                await removeMemberMutation.mutateAsync({
                  teamId: selectedTeam.id,
                  userId: row.original.userId,
                })
                teamsQuery.refetch()
                toast.success('Member removed')
              } catch {
                toast.error('Failed to remove member')
              }
            }}
          >
            Remove
          </button>
        ),
      },
    ],
    [selectedTeam, removeMemberMutation, teamsQuery],
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
      {teamsQuery.error && <QueryError message={teamsQuery.error.message} onRetry={() => teamsQuery.refetch()} />}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Teams
          </h2>
          <p className="mt-1 text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
            {teams.length} teams
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          Create Team
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="hidden md:block">
            <DataTable
              data={teams}
              columns={teamColumns}
              searchable
              searchPlaceholder="Search teams…"
              loading={teamsQuery.isLoading}
              onRowClick={(team) => setSelectedTeamId(team.id)}
              emptyIcon={<Users className="h-10 w-10" />}
              emptyTitle="No teams"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:hidden">
            {teams.map((team, index) => (
              <motion.button
                key={team.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={reduced ? undefined : cardHover}
                whileTap={reduced ? undefined : cardTap}
                transition={{ delay: index * 0.04 }}
                onClick={() => setSelectedTeamId(team.id)}
                className={`rounded-xl border p-4 text-left transition ${selectedTeamId === team.id ? 'border-[var(--color-accent)] bg-[var(--color-bg-card)]' : 'border-[var(--color-border)] bg-[var(--color-bg-card)]/80 hover:border-[var(--color-accent)]/40'}`}
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {team.name}
                </p>
                <div className="mt-2 flex -space-x-2">
                  {team.members.slice(0, 4).map((member) => (
                    <span
                      key={member.userId}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-xs font-semibold text-[var(--color-text-secondary)]"
                    >
                      {member.avatar}
                    </span>
                  ))}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          {selectedTeam ? (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
                  {selectedTeam.name}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {selectedTeam.description}
                </p>
                <div className="mt-2">
                  <Badge variant="outline">Created {formatDate(selectedTeam.createdAt)}</Badge>
                </div>
              </div>

              {userOptions.length > 0 && (
                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                  <select
                    value={memberToAdd}
                    onChange={(e) => setMemberToAdd(e.target.value)}
                    className={inputClass}
                  >
                    {userOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={roleToAdd}
                    onChange={(e) => setRoleToAdd(e.target.value as TeamRole)}
                    className={inputClass}
                  >
                    {teamRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors duration-150"
                    onClick={async () => {
                      try {
                        await addMemberMutation.mutateAsync({
                          teamId: selectedTeam.id,
                          userId: memberToAdd,
                          role: roleToAdd,
                        })
                        teamsQuery.refetch()
                        toast.success('Member added')
                      } catch {
                        toast.error('Failed to add member')
                      }
                    }}
                  >
                    Add member
                  </button>
                </div>
              )}

              <DataTable
                data={selectedTeam.members}
                columns={memberColumns}
                emptyTitle="No members"
                mobileCard={(member) => (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {member.name}
                      </p>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-mono text-[var(--color-text-muted)]">
                      {member.email}
                    </p>
                  </div>
                )}
              />
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Select a team to view details.</p>
          )}
        </section>
      </div>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Create Team">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            createForm.handleSubmit()
          }}
        >
          <createForm.Field name="name">
            {(field) => (
              <label className="block">
                <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                  Name
                </span>
                <input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className={inputClass}
                />
                {field.state.meta.errors.length > 0 && (
                  <span className="text-xs text-red-300">
                    {field.state.meta.errors.map(String).join(', ')}
                  </span>
                )}
              </label>
            )}
          </createForm.Field>
          <createForm.Field name="description">
            {(field) => (
              <label className="block">
                <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                  Description
                </span>
                <textarea
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  rows={3}
                  className={inputClass}
                />
                {field.state.meta.errors.length > 0 && (
                  <span className="text-xs text-red-300">
                    {field.state.meta.errors.map(String).join(', ')}
                  </span>
                )}
              </label>
            )}
          </createForm.Field>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm text-white"
            >
              Create
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
