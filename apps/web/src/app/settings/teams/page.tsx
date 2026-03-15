'use client'

import { useForm } from '@tanstack/react-form'
import type { ColumnDef } from '@tanstack/react-table'
import { motion } from 'motion/react'
import { Plus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import {
  getTeamMemberUserOptions,
  mockAccessControlApi,
  TEAM_ROLE_OPTIONS,
  type Team,
  type TeamRole,
} from '@/lib/mock-access-control'

const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name is required'),
  description: z.string().min(4, 'Description is required'),
})

const teamRoles: TeamRole[] = TEAM_ROLE_OPTIONS
const userOptions = getTeamMemberUserOptions()

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const dynamic = 'force-dynamic'

export default function SettingsTeamsPage() {
  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [memberToAdd, setMemberToAdd] = useState('user-mai')
  const [roleToAdd, setRoleToAdd] = useState<TeamRole>('member')

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
        const data = await mockAccessControlApi.teams.list()
        if (!mounted) return
        setTeams(data)
        setSelectedTeamId((prev) => prev ?? data[0]?.id ?? null)
      } catch {
        if (mounted) setError('Failed to load teams')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void run()
    return () => { mounted = false }
  }, [isAdmin])

  const createForm = useForm({
    defaultValues: { name: '', description: '' },
    validators: { onChange: createTeamSchema },
    onSubmit: async ({ value }) => {
      try {
        const created = await mockAccessControlApi.teams.create(value)
        setTeams((prev) => [created, ...prev])
        setSelectedTeamId(created.id)
        setShowCreate(false)
        toast.success('Team created')
      } catch {
        toast.error('Failed to create team')
      }
    },
  })

  const selectedTeam = teams.find((team) => teamotion.id === selectedTeamId) ?? null

  const teamColumns = useMemo<ColumnDef<Team, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-semibold text-[var(--color-text-primary)]">{row.original.name}</span> },
    { id: 'members', header: 'Members', cell: ({ row }) => <span className="font-mono text-xs text-[var(--color-text-secondary)]">{row.original.members.length}</span> },
    { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => <span className="text-xs text-[var(--color-text-muted)]">{formatDate(row.original.createdAt)}</span> },
  ], [])

  const memberColumns = useMemo<ColumnDef<Team['members'][number], unknown>[]>(() => [
    { accessorKey: 'name', header: 'Member', cell: ({ row }) => <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span> },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => <span className="text-xs font-mono text-[var(--color-text-muted)]">{row.original.email}</span> },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <select
          aria-label={`Role for ${row.original.name}`}
          value={row.original.role}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2 py-1 text-xs"
          onChange={async (event) => {
            if (!selectedTeam) return
            const role = event.target.value as TeamRole
            try {
              await mockAccessControlApi.teams.setMemberRole({ teamId: selectedTeamotion.id, userId: row.original.userId, role })
              setTeams((prev) => prev.map((team) => teamotion.id === selectedTeamotion.id
                ? { ...team, members: teamotion.members.map((member) => member.userId === row.original.userId ? { ...member, role } : member) }
                : team))
              toast.success('Team role updated')
            } catch { toast.error('Failed to update team role') }
          }}
        >
          {teamRoles.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      ),
    },
    {
      id: 'actions', header: '',
      cell: ({ row }) => (
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
          onClick={async () => {
            if (!selectedTeam) return
            try {
              await mockAccessControlApi.teams.removeMember({ teamId: selectedTeamotion.id, userId: row.original.userId })
              setTeams((prev) => prev.map((team) => teamotion.id === selectedTeamotion.id
                ? { ...team, members: teamotion.members.filter((member) => member.userId !== row.original.userId) }
                : team))
              toast.success('Member removed')
            } catch { toast.error('Failed to remove member') }
          }}
        >
          Remove
        </button>
      ),
    },
  ], [selectedTeam])

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

  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm'

  return (
    <div>
      {error && <QueryError message={error} onRetry={() => window.location.reload()} />}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Teams</h2>
          <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">{teams.length} teams</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 min-h-[44px]">
          <Plus className="h-4 w-4" />Create Team
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="hidden md:block">
            <DataTable data={teams} columns={teamColumns} searchable searchPlaceholder="Search teams…" loading={isLoading} onRowClick={(team) => setSelectedTeamId(teamotion.id)} emptyIcon={<Users className="h-10 w-10" />} emptyTitle="No teams" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:hidden">
            {teams.map((team, index) => (
              <motion.button
                key={teamotion.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => setSelectedTeamId(teamotion.id)}
                className={`rounded-xl border p-4 text-left transition ${selectedTeamId === teamotion.id ? 'border-[var(--color-accent)] bg-[var(--color-bg-card)]' : 'border-[var(--color-border)] bg-[var(--color-bg-card)]/80 hover:border-[var(--color-accent)]/40'}`}
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{teamotion.name}</p>
                <div className="mt-2 flex -space-x-2">
                  {teamotion.members.slice(0, 4).map((member) => (
                    <span key={member.userId} className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[10px] font-semibold text-[var(--color-text-secondary)]">{member.avatar}</span>
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
                <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{selectedTeamotion.name}</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">{selectedTeamotion.description}</p>
                <div className="mt-2"><Badge variant="outline">Created {formatDate(selectedTeamotion.createdAt)}</Badge></div>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                <select value={memberToAdd} onChange={(e) => setMemberToAdd(e.target.value)} className={inputClass}>
                  {userOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <select value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value as TeamRole)} className={inputClass}>
                  {teamRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-white/[0.06]"
                  onClick={async () => {
                    try {
                      await mockAccessControlApi.teams.addMember({ teamId: selectedTeamotion.id, userId: memberToAdd, role: roleToAdd })
                      const next = await mockAccessControlApi.teams.list()
                      setTeams(next)
                      toast.success('Member added')
                    } catch { toast.error('Failed to add member') }
                  }}
                >
                  Add member
                </button>
              </div>

              <DataTable
                data={selectedTeamotion.members}
                columns={memberColumns}
                emptyTitle="No members"
                mobileCard={(member) => (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{member.name}</p>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-mono text-[var(--color-text-muted)]">{member.email}</p>
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
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createFormotion.handleSubmit() }}>
          <createFormotion.Field name="name">
            {(field) => (
              <label className="block">
                <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">Name</span>
                <input value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} className={inputClass} />
                {field.state.meta.errors.length > 0 && <span className="text-xs text-red-300">{field.state.meta.errors.map(String).join(', ')}</span>}
              </label>
            )}
          </createFormotion.Field>
          <createFormotion.Field name="description">
            {(field) => (
              <label className="block">
                <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">Description</span>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} rows={3} className={inputClass} />
                {field.state.meta.errors.length > 0 && <span className="text-xs text-red-300">{field.state.meta.errors.map(String).join(', ')}</span>}
              </label>
            )}
          </createFormotion.Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">Cancel</button>
            <button type="submit" className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm text-white">Create</button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
