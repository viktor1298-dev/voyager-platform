import { describe, expect, it } from 'vitest'
import {
  AuthorizationService,
  type ObjectRef,
  type Relation,
  type SubjectRef,
} from '../lib/authorization.js'

type RelationRow = {
  subjectType: SubjectRef['type']
  subjectId: string
  relation: Relation
  objectType: ObjectRef['type']
  objectId: string
  createdBy?: string | null
}

function createMemoryService(seed?: {
  relations?: RelationRow[]
  teamMemberships?: Record<string, string[]>
  userRoles?: Record<string, string>
}) {
  const state = {
    relations: [...(seed?.relations ?? [])],
    teamMemberships: { ...(seed?.teamMemberships ?? {}) },
    userRoles: { ...(seed?.userRoles ?? {}) },
  }

  const repo = {
    getUserRole: async (userId: string) => state.userRoles[userId] ?? null,
    getUserTeamIds: async (userId: string) => state.teamMemberships[userId] ?? [],
    listRelationsForSubjects: async (subjects: SubjectRef[], object: ObjectRef) =>
      state.relations.filter(
        (row) =>
          row.objectType === object.type &&
          row.objectId === object.id &&
          subjects.some(
            (subject) => subject.type === row.subjectType && subject.id === row.subjectId,
          ),
      ),
    listRelationsForSubject: async (subject: SubjectRef) =>
      state.relations.filter(
        (row) => row.subjectType === subject.type && row.subjectId === subject.id,
      ),
    listRelationsForObject: async (object: ObjectRef) =>
      state.relations.filter((row) => row.objectType === object.type && row.objectId === object.id),
    listAccessibleObjectIds: async (
      subject: SubjectRef,
      objectType: ObjectRef['type'],
      relation: Relation,
    ) => {
      const relationLevel = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const
      const userTeams = subject.type === 'user' ? (state.teamMemberships[subject.id] ?? []) : []
      const userRole = subject.type === 'user' ? (state.userRoles[subject.id] ?? null) : null
      const subjects: SubjectRef[] = [subject]
      subjects.push(...userTeams.map((id) => ({ type: 'team' as const, id })))
      if (userRole) subjects.push({ type: 'role', id: userRole })
      return state.relations
        .filter((row) => row.objectType === objectType)
        .filter((row) => relationLevel[row.relation] >= relationLevel[relation])
        .filter((row) => subjects.some((s) => s.type === row.subjectType && s.id === row.subjectId))
        .map((row) => row.objectId)
    },
    listTeamMemberUserIds: async (teamId: string) =>
      Object.entries(state.teamMemberships)
        .filter(([, teamIds]) => teamIds.includes(teamId))
        .map(([userId]) => userId),
    insertRelation: async (entry: RelationRow) => {
      state.relations.push(entry)
    },
    deleteRelation: async (entry: RelationRow) => {
      const before = state.relations.length
      state.relations = state.relations.filter(
        (row) =>
          !(
            row.subjectType === entry.subjectType &&
            row.subjectId === entry.subjectId &&
            row.relation === entry.relation &&
            row.objectType === entry.objectType &&
            row.objectId === entry.objectId
          ),
      )
      return before - state.relations.length
    },
    listTeams: async () => [],
    createTeam: async () => ({
      id: 'team-1',
      name: 'ops',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    addTeamMember: async () => {},
    removeTeamMember: async () => 1,
  }

  return { service: new AuthorizationService({} as any, repo as any), state }
}

describe('AuthorizationService', () => {
  it('respects relation hierarchy owner > admin > editor > viewer', async () => {
    const { service } = createMemoryService({
      relations: [
        {
          subjectType: 'user',
          subjectId: 'u1',
          relation: 'admin',
          objectType: 'cluster',
          objectId: 'c1',
        },
      ],
    })

    await expect(
      service.check({ type: 'user', id: 'u1' }, 'viewer', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)
    await expect(
      service.check({ type: 'user', id: 'u1' }, 'editor', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)
    await expect(
      service.check({ type: 'user', id: 'u1' }, 'owner', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(false)
  })

  it('supports inheritance via team membership', async () => {
    const { service } = createMemoryService({
      relations: [
        {
          subjectType: 'team',
          subjectId: 't1',
          relation: 'editor',
          objectType: 'cluster',
          objectId: 'c1',
        },
      ],
      teamMemberships: { u1: ['t1'] },
    })

    await expect(
      service.check({ type: 'user', id: 'u1' }, 'viewer', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)
    await expect(
      service.check({ type: 'user', id: 'u1' }, 'editor', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)
    await expect(
      service.check({ type: 'user', id: 'u1' }, 'admin', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(false)
  })

  it('grant + revoke updates authorization state', async () => {
    const { service } = createMemoryService()

    await service.grant(
      { type: 'user', id: 'u1' },
      'viewer',
      { type: 'cluster', id: 'c1' },
      'admin-1',
    )
    await expect(
      service.check({ type: 'user', id: 'u1' }, 'viewer', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)

    await service.revoke({ type: 'user', id: 'u1' }, 'viewer', { type: 'cluster', id: 'c1' })
    await expect(
      service.check({ type: 'user', id: 'u1' }, 'viewer', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(false)
  })

  it('keeps backward compatibility with legacy admin/viewer role', async () => {
    const { service } = createMemoryService({ userRoles: { admin1: 'admin', viewer1: 'viewer' } })

    await expect(
      service.check({ type: 'user', id: 'admin1' }, 'owner', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)
    await expect(
      service.check({ type: 'user', id: 'viewer1' }, 'viewer', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(true)
    await expect(
      service.check({ type: 'user', id: 'viewer1' }, 'editor', { type: 'cluster', id: 'c1' }),
    ).resolves.toBe(false)
  })
})
