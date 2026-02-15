import { TRPCError } from '@trpc/server'
import {
  relations,
  teamMembers,
  teams,
  user as userTable,
  type Database,
  type objectTypeEnum,
  type relationEnum,
  type subjectTypeEnum,
} from '@voyager/db'
import { and, eq } from 'drizzle-orm'

export type SubjectType = typeof subjectTypeEnum.enumValues[number]
export type Relation = typeof relationEnum.enumValues[number]
export type ObjectType = typeof objectTypeEnum.enumValues[number]

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
  listRelationsForSubject(subject: SubjectRef): Promise<RelationRecord[]>
  listRelationsForObject(object: ObjectRef): Promise<RelationRecord[]>
  listTeamMemberUserIds(teamId: string): Promise<string[]>
  insertRelation(entry: RelationRecord & { createdBy?: string | null }): Promise<void>
  deleteRelation(entry: RelationRecord): Promise<number>
  listTeams(): Promise<Array<typeof teams.$inferSelect>>
  createTeam(input: { name: string; description?: string | null }): Promise<typeof teams.$inferSelect>
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
    const [result] = await this.db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, userId))
    return result?.role ?? null
  }

  async getUserTeamIds(userId: string): Promise<string[]> {
    const records = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
    return records.map((record) => record.teamId)
  }

  async listRelationsForSubjects(subjects: SubjectRef[], object: ObjectRef): Promise<RelationRecord[]> {
    if (subjects.length === 0) return []

    const results = await Promise.all(
      subjects.map((subject) =>
        this.db
          .select({
            subjectType: relations.subjectType,
            subjectId: relations.subjectId,
            relation: relations.relation,
            objectType: relations.objectType,
            objectId: relations.objectId,
          })
          .from(relations)
          .where(
            and(
              eq(relations.subjectType, subject.type),
              eq(relations.subjectId, subject.id),
              eq(relations.objectType, object.type),
              eq(relations.objectId, object.id),
            ),
          ),
      ),
    )

    return results.flat()
  }

  async listRelationsForSubject(subject: SubjectRef): Promise<RelationRecord[]> {
    return this.db
      .select({
        subjectType: relations.subjectType,
        subjectId: relations.subjectId,
        relation: relations.relation,
        objectType: relations.objectType,
        objectId: relations.objectId,
      })
      .from(relations)
      .where(and(eq(relations.subjectType, subject.type), eq(relations.subjectId, subject.id)))
  }

  async listRelationsForObject(object: ObjectRef): Promise<RelationRecord[]> {
    return this.db
      .select({
        subjectType: relations.subjectType,
        subjectId: relations.subjectId,
        relation: relations.relation,
        objectType: relations.objectType,
        objectId: relations.objectId,
      })
      .from(relations)
      .where(and(eq(relations.objectType, object.type), eq(relations.objectId, object.id)))
  }

  async listTeamMemberUserIds(teamId: string): Promise<string[]> {
    const rows = await this.db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId))
    return rows.map((row) => row.userId)
  }

  async insertRelation(entry: RelationRecord & { createdBy?: string | null }): Promise<void> {
    await this.db.insert(relations).values({
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
      .delete(relations)
      .where(
        and(
          eq(relations.subjectType, entry.subjectType),
          eq(relations.subjectId, entry.subjectId),
          eq(relations.relation, entry.relation),
          eq(relations.objectType, entry.objectType),
          eq(relations.objectId, entry.objectId),
        ),
      )
      .returning({ id: relations.id })

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

  constructor(private readonly db: Database, repo?: AuthorizationRepo) {
    this.repo = repo ?? new DrizzleAuthorizationRepo(db)
  }

  async check(subject: SubjectRef, relation: Relation, object: ObjectRef): Promise<boolean> {
    if (subject.type === 'user') {
      const legacyRole = await this.repo.getUserRole(subject.id)
      if (legacyRole === 'admin') return true
      if (legacyRole === 'viewer' && relation === 'viewer') return true
    }

    const expandedSubjects = await this.expandSubjects(subject)
    const found = await this.repo.listRelationsForSubjects(expandedSubjects, object)
    const requiredLevel = RELATION_LEVEL[relation]

    return found.some((row) => RELATION_LEVEL[row.relation] >= requiredLevel)
  }

  async grant(subject: SubjectRef, relation: Relation, object: ObjectRef, createdBy?: string): Promise<void> {
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
      await Promise.all(teamIds.map((teamId) => this.repo.listRelationsForSubject({ type: 'team', id: teamId })))
    ).flat()

    return [...direct, ...inherited.map((row) => ({ ...row, inheritedFromTeamId: row.subjectId }))]
  }

  async listSubjects(object: ObjectRef) {
    const direct = await this.repo.listRelationsForObject(object)
    const expanded: Array<RelationRecord & { userId?: string; inheritedViaTeamId?: string }> = [...direct]

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

  private async expandSubjects(subject: SubjectRef): Promise<SubjectRef[]> {
    if (subject.type !== 'user') return [subject]

    const subjects: SubjectRef[] = [subject]
    const teamIds = await this.repo.getUserTeamIds(subject.id)
    subjects.push(...teamIds.map((teamId) => ({ type: 'team' as const, id: teamId })))

    const userRole = await this.repo.getUserRole(subject.id)
    if (userRole) {
      subjects.push({ type: 'role', id: userRole })
    }

    return subjects
  }
}

export function createAuthorizationService(db: Database) {
  return new AuthorizationService(db)
}
