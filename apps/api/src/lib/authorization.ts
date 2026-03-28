import { TRPCError } from '@trpc/server'
import {
  accessRelations,
  type Database,
  type objectTypeEnum,
  type relationEnum,
  type subjectTypeEnum,
  teamMembers,
  teams,
  user as userTable,
} from '@voyager/db'
import { and, eq, inArray, or } from 'drizzle-orm'

export type SubjectType = (typeof subjectTypeEnum.enumValues)[number]
export type Relation = (typeof relationEnum.enumValues)[number]
export type ObjectType = (typeof objectTypeEnum.enumValues)[number]

export interface SubjectRef {
  type: SubjectType
  id: string
}

export interface ObjectRef {
  type: ObjectType
  id: string
}

interface RelationRecord {
  subjectType: SubjectType
  subjectId: string
  relation: Relation
  objectType: ObjectType
  objectId: string
}

interface AuthorizationRepo {
  getUserRole(userId: string): Promise<string | null>
  getUserTeamIds(userId: string): Promise<string[]>
  listRelationsForSubjects(subjects: SubjectRef[], object: ObjectRef): Promise<RelationRecord[]>
  listRelationsForSubjectsAndObjects(
    subjects: SubjectRef[],
    objectType: ObjectType,
    objectIds: string[],
  ): Promise<RelationRecord[]>
  listRelationsForSubject(subject: SubjectRef): Promise<RelationRecord[]>
  listRelationsForObject(object: ObjectRef): Promise<RelationRecord[]>
  listAccessibleObjectIds(
    subject: SubjectRef,
    objectType: ObjectType,
    relation: Relation,
  ): Promise<string[]>
  listTeamMemberUserIds(teamId: string): Promise<string[]>
  insertRelation(entry: RelationRecord & { createdBy?: string | null }): Promise<void>
  deleteRelation(entry: RelationRecord): Promise<number>
  listTeams(): Promise<Array<typeof teams.$inferSelect>>
  createTeam(input: {
    name: string
    description?: string | null
  }): Promise<typeof teams.$inferSelect>
  addTeamMember(input: { teamId: string; userId: string; role: 'admin' | 'member' }): Promise<void>
  removeTeamMember(input: { teamId: string; userId: string }): Promise<number>
}

const RELATION_LEVEL: Record<Relation, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

class DrizzleAuthorizationRepo implements AuthorizationRepo {
  constructor(private readonly db: Database) {}

  async getUserRole(userId: string): Promise<string | null> {
    const [result] = await this.db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, userId))
    return result?.role ?? null
  }

  async getUserTeamIds(userId: string): Promise<string[]> {
    const records = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
    return records.map((record) => record.teamId)
  }

  async listRelationsForSubjects(
    subjects: SubjectRef[],
    object: ObjectRef,
  ): Promise<RelationRecord[]> {
    if (subjects.length === 0) return []

    const subjectsByType = new Map<SubjectType, string[]>()
    for (const subject of subjects) {
      const ids = subjectsByType.get(subject.type) ?? []
      ids.push(subject.id)
      subjectsByType.set(subject.type, ids)
    }

    const perTypeFilters = Array.from(subjectsByType.entries()).map(([type, ids]) =>
      and(eq(accessRelations.subjectType, type), inArray(accessRelations.subjectId, ids)),
    )

    return this.db
      .select({
        subjectType: accessRelations.subjectType,
        subjectId: accessRelations.subjectId,
        relation: accessRelations.relation,
        objectType: accessRelations.objectType,
        objectId: accessRelations.objectId,
      })
      .from(accessRelations)
      .where(
        and(
          eq(accessRelations.objectType, object.type),
          eq(accessRelations.objectId, object.id),
          perTypeFilters.length === 1 ? perTypeFilters[0]! : or(...perTypeFilters),
        ),
      )
  }

  async listRelationsForSubjectsAndObjects(
    subjects: SubjectRef[],
    objectType: ObjectType,
    objectIds: string[],
  ): Promise<RelationRecord[]> {
    if (subjects.length === 0 || objectIds.length === 0) return []

    const subjectsByType = new Map<SubjectType, string[]>()
    for (const subject of subjects) {
      const ids = subjectsByType.get(subject.type) ?? []
      ids.push(subject.id)
      subjectsByType.set(subject.type, ids)
    }

    const perTypeFilters = Array.from(subjectsByType.entries()).map(([type, ids]) =>
      and(eq(accessRelations.subjectType, type), inArray(accessRelations.subjectId, ids)),
    )

    return this.db
      .select({
        subjectType: accessRelations.subjectType,
        subjectId: accessRelations.subjectId,
        relation: accessRelations.relation,
        objectType: accessRelations.objectType,
        objectId: accessRelations.objectId,
      })
      .from(accessRelations)
      .where(
        and(
          eq(accessRelations.objectType, objectType),
          inArray(accessRelations.objectId, objectIds),
          perTypeFilters.length === 1 ? perTypeFilters[0]! : or(...perTypeFilters),
        ),
      )
  }

  async listRelationsForSubject(subject: SubjectRef): Promise<RelationRecord[]> {
    return this.db
      .select({
        subjectType: accessRelations.subjectType,
        subjectId: accessRelations.subjectId,
        relation: accessRelations.relation,
        objectType: accessRelations.objectType,
        objectId: accessRelations.objectId,
      })
      .from(accessRelations)
      .where(
        and(
          eq(accessRelations.subjectType, subject.type),
          eq(accessRelations.subjectId, subject.id),
        ),
      )
  }

  async listRelationsForObject(object: ObjectRef): Promise<RelationRecord[]> {
    return this.db
      .select({
        subjectType: accessRelations.subjectType,
        subjectId: accessRelations.subjectId,
        relation: accessRelations.relation,
        objectType: accessRelations.objectType,
        objectId: accessRelations.objectId,
      })
      .from(accessRelations)
      .where(
        and(eq(accessRelations.objectType, object.type), eq(accessRelations.objectId, object.id)),
      )
  }

  async listAccessibleObjectIds(
    subject: SubjectRef,
    objectType: ObjectType,
    relation: Relation,
  ): Promise<string[]> {
    const expandedSubjects: SubjectRef[] = [subject]

    if (subject.type === 'user') {
      const teamIds = await this.getUserTeamIds(subject.id)
      expandedSubjects.push(...teamIds.map((teamId) => ({ type: 'team' as const, id: teamId })))

      const userRole = await this.getUserRole(subject.id)
      if (userRole) {
        expandedSubjects.push({ type: 'role', id: userRole })
      }
    }

    const subjectsByType = new Map<SubjectType, string[]>()
    for (const expandedSubject of expandedSubjects) {
      const ids = subjectsByType.get(expandedSubject.type) ?? []
      ids.push(expandedSubject.id)
      subjectsByType.set(expandedSubject.type, ids)
    }

    const subjectFilters = Array.from(subjectsByType.entries()).map(([type, ids]) =>
      and(eq(accessRelations.subjectType, type), inArray(accessRelations.subjectId, ids)),
    )

    const rows = await this.db
      .select({ objectId: accessRelations.objectId })
      .from(accessRelations)
      .where(
        and(
          eq(accessRelations.objectType, objectType),
          inArray(
            accessRelations.relation,
            relation === 'viewer'
              ? ['viewer', 'editor', 'admin', 'owner']
              : relation === 'editor'
                ? ['editor', 'admin', 'owner']
                : relation === 'admin'
                  ? ['admin', 'owner']
                  : ['owner'],
          ),
          subjectFilters.length === 1 ? subjectFilters[0]! : or(...subjectFilters),
        ),
      )

    return [...new Set(rows.map((row) => row.objectId))]
  }

  async listTeamMemberUserIds(teamId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
    return rows.map((row) => row.userId)
  }

  async insertRelation(entry: RelationRecord & { createdBy?: string | null }): Promise<void> {
    await this.db.insert(accessRelations).values({
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      relation: entry.relation,
      objectType: entry.objectType,
      objectId: entry.objectId,
      createdBy: entry.createdBy ?? null,
    })
  }

  async deleteRelation(entry: RelationRecord): Promise<number> {
    const deleted = await this.db
      .delete(accessRelations)
      .where(
        and(
          eq(accessRelations.subjectType, entry.subjectType),
          eq(accessRelations.subjectId, entry.subjectId),
          eq(accessRelations.relation, entry.relation),
          eq(accessRelations.objectType, entry.objectType),
          eq(accessRelations.objectId, entry.objectId),
        ),
      )
      .returning({ id: accessRelations.id })

    return deleted.length
  }

  listTeams() {
    return this.db.select().from(teams)
  }

  async createTeam(input: { name: string; description?: string | null }) {
    const [created] = await this.db
      .insert(teams)
      .values({ name: input.name, description: input.description ?? null })
      .returning()
    return created
  }

  async addTeamMember(input: { teamId: string; userId: string; role: 'admin' | 'member' }) {
    await this.db.insert(teamMembers).values(input)
  }

  async removeTeamMember(input: { teamId: string; userId: string }) {
    const deleted = await this.db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)))
      .returning({ userId: teamMembers.userId })
    return deleted.length
  }
}

export class AuthorizationService {
  private readonly repo: AuthorizationRepo

  constructor(
    private readonly db: Database,
    repo?: AuthorizationRepo,
  ) {
    this.repo = repo ?? new DrizzleAuthorizationRepo(db)
  }

  async check(subject: SubjectRef, relation: Relation, object: ObjectRef): Promise<boolean> {
    const userRole = subject.type === 'user' ? await this.repo.getUserRole(subject.id) : null

    if (subject.type === 'user') {
      if (userRole === 'admin') return true
      if (userRole === 'viewer' && relation === 'viewer') return true
    }

    const expandedSubjects = await this.expandSubjects(subject, userRole)
    const found = await this.repo.listRelationsForSubjects(expandedSubjects, object)
    const requiredLevel = RELATION_LEVEL[relation]

    return found.some((row) => RELATION_LEVEL[row.relation] >= requiredLevel)
  }

  async checkBatch(
    subject: SubjectRef,
    objectType: ObjectType,
    objectIds: string[],
    relation: Relation,
  ): Promise<Set<string>> {
    if (objectIds.length === 0) return new Set<string>()

    const userRole = subject.type === 'user' ? await this.repo.getUserRole(subject.id) : null

    if (subject.type === 'user') {
      if (userRole === 'admin') return new Set(objectIds)
      if (userRole === 'viewer' && relation === 'viewer') return new Set(objectIds)
    }

    const expandedSubjects = await this.expandSubjects(subject, userRole)
    const found = await this.repo.listRelationsForSubjectsAndObjects(
      expandedSubjects,
      objectType,
      objectIds,
    )
    const requiredLevel = RELATION_LEVEL[relation]

    const allowedObjectIds = new Set<string>()
    for (const row of found) {
      if (RELATION_LEVEL[row.relation] >= requiredLevel) {
        allowedObjectIds.add(row.objectId)
      }
    }

    return allowedObjectIds
  }

  async grant(
    subject: SubjectRef,
    relation: Relation,
    object: ObjectRef,
    createdBy?: string,
  ): Promise<void> {
    await this.repo.insertRelation({
      subjectType: subject.type,
      subjectId: subject.id,
      relation,
      objectType: object.type,
      objectId: object.id,
      createdBy: createdBy ?? null,
    })
  }

  async revoke(subject: SubjectRef, relation: Relation, object: ObjectRef): Promise<boolean> {
    const deleted = await this.repo.deleteRelation({
      subjectType: subject.type,
      subjectId: subject.id,
      relation,
      objectType: object.type,
      objectId: object.id,
    })
    return deleted > 0
  }

  async listPermissions(subject: SubjectRef) {
    const direct = await this.repo.listRelationsForSubject(subject)

    if (subject.type !== 'user') return direct

    const teamIds = await this.repo.getUserTeamIds(subject.id)
    if (!teamIds.length) return direct

    const inherited = (
      await Promise.all(
        teamIds.map((teamId) => this.repo.listRelationsForSubject({ type: 'team', id: teamId })),
      )
    ).flat()

    return [...direct, ...inherited.map((row) => ({ ...row, inheritedFromTeamId: row.subjectId }))]
  }

  async listAccessibleObjectIds(subject: SubjectRef, objectType: ObjectType, relation: Relation) {
    if (subject.type === 'user') {
      const legacyRole = await this.repo.getUserRole(subject.id)
      if (legacyRole === 'admin') {
        const all = await this.db
          .select({ objectId: accessRelations.objectId })
          .from(accessRelations)
          .where(eq(accessRelations.objectType, objectType))
        return [...new Set(all.map((row) => row.objectId))]
      }
    }

    return this.repo.listAccessibleObjectIds(subject, objectType, relation)
  }

  async listSubjects(object: ObjectRef) {
    const direct = await this.repo.listRelationsForObject(object)
    const expanded: Array<RelationRecord & { userId?: string; inheritedViaTeamId?: string }> = [
      ...direct,
    ]

    for (const entry of direct) {
      if (entry.subjectType !== 'team') continue
      const memberIds = await this.repo.listTeamMemberUserIds(entry.subjectId)
      for (const userId of memberIds) {
        expanded.push({
          ...entry,
          subjectType: 'user',
          subjectId: userId,
          userId,
          inheritedViaTeamId: entry.subjectId,
        })
      }
    }

    return expanded
  }

  listTeams() {
    return this.repo.listTeams()
  }

  createTeam(input: { name: string; description?: string | null }) {
    return this.repo.createTeam(input)
  }

  addTeamMember(input: { teamId: string; userId: string; role: 'admin' | 'member' }) {
    return this.repo.addTeamMember(input)
  }

  async removeTeamMember(input: { teamId: string; userId: string }) {
    const removed = await this.repo.removeTeamMember(input)
    if (removed === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Team member not found' })
    }
  }

  private async expandSubjects(
    subject: SubjectRef,
    userRole?: string | null,
  ): Promise<SubjectRef[]> {
    if (subject.type !== 'user') return [subject]

    const subjects: SubjectRef[] = [subject]
    const teamIds = await this.repo.getUserTeamIds(subject.id)
    subjects.push(...teamIds.map((teamId) => ({ type: 'team' as const, id: teamId })))

    if (userRole) {
      subjects.push({ type: 'role', id: userRole })
    }

    return subjects
  }
}

export function createAuthorizationService(db: Database) {
  return new AuthorizationService(db)
}
