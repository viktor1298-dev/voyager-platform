export type Relation = 'owner' | 'admin' | 'editor' | 'viewer'
export type PrincipalType = 'user' | 'team'
export type TeamRole = 'lead' | 'maintainer' | 'member' | 'observer'

export type TeamMember = {
  userId: string
  name: string
  email: string
  role: TeamRole
  avatar: string
}

export type Team = {
  id: string
  name: string
  description: string
  createdAt: string
  members: TeamMember[]
}

export type AccessPrincipal = {
  id: string
  type: PrincipalType
  name: string
  email?: string
}

export type AccessResource = {
  id: string
  type: 'cluster'
  name: string
}

export type AccessGrant = {
  id: string
  principalId: string
  principalType: PrincipalType
  resourceId: string
  relation: Relation
  createdAt: string
}

const RELATION_RANK: Record<Relation, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

const users: AccessPrincipal[] = [
  { id: 'user-morpheus', type: 'user', name: 'Morpheus', email: 'morpheus@voyager.dev' },
  { id: 'user-ron', type: 'user', name: 'Ron', email: 'ron@voyager.dev' },
  { id: 'user-dima', type: 'user', name: 'Dima', email: 'dima@voyager.dev' },
  { id: 'user-mai', type: 'user', name: 'Mai', email: 'mai@voyager.dev' },
]

let teams: Team[] = [
  {
    id: 'team-platform',
    name: 'Platform Team',
    description: 'Owns core platform architecture and security posture.',
    createdAt: '2026-01-05T09:15:00.000Z',
    members: [
      { userId: 'user-morpheus', name: 'Morpheus', email: 'morpheus@voyager.dev', role: 'lead', avatar: 'M' },
      { userId: 'user-ron', name: 'Ron', email: 'ron@voyager.dev', role: 'maintainer', avatar: 'R' },
    ],
  },
  {
    id: 'team-sre',
    name: 'SRE Team',
    description: 'Production operations and reliability automation.',
    createdAt: '2026-01-18T12:00:00.000Z',
    members: [
      { userId: 'user-dima', name: 'Dima', email: 'dima@voyager.dev', role: 'lead', avatar: 'D' },
      { userId: 'user-mai', name: 'Mai', email: 'mai@voyager.dev', role: 'member', avatar: 'M' },
    ],
  },
  {
    id: 'team-dev',
    name: 'Dev Team',
    description: 'Feature delivery, UI, and product iteration.',
    createdAt: '2026-01-23T08:30:00.000Z',
    members: [
      { userId: 'user-ron', name: 'Ron', email: 'ron@voyager.dev', role: 'lead', avatar: 'R' },
      { userId: 'user-mai', name: 'Mai', email: 'mai@voyager.dev', role: 'observer', avatar: 'M' },
    ],
  },
]

const resources: AccessResource[] = [
  { id: 'cluster-minikube-dev', type: 'cluster', name: 'minikube-dev' },
  { id: 'cluster-production-eks', type: 'cluster', name: 'production-eks' },
  { id: 'cluster-staging-aks', type: 'cluster', name: 'staging-aks' },
  { id: 'cluster-analytics-gke', type: 'cluster', name: 'analytics-gke' },
  { id: 'cluster-dev-k3s', type: 'cluster', name: 'dev-k3s' },
]

let grants: AccessGrant[] = [
  { id: 'grant-1', principalId: 'team-platform', principalType: 'team', resourceId: 'cluster-production-eks', relation: 'owner', createdAt: '2026-02-01T10:00:00.000Z' },
  { id: 'grant-2', principalId: 'team-sre', principalType: 'team', resourceId: 'cluster-production-eks', relation: 'admin', createdAt: '2026-02-01T10:05:00.000Z' },
  { id: 'grant-3', principalId: 'team-dev', principalType: 'team', resourceId: 'cluster-staging-aks', relation: 'editor', createdAt: '2026-02-01T10:15:00.000Z' },
  { id: 'grant-4', principalId: 'user-ron', principalType: 'user', resourceId: 'cluster-minikube-dev', relation: 'owner', createdAt: '2026-02-01T10:20:00.000Z' },
  { id: 'grant-5', principalId: 'user-dima', principalType: 'user', resourceId: 'cluster-analytics-gke', relation: 'admin', createdAt: '2026-02-01T10:22:00.000Z' },
  { id: 'grant-6', principalId: 'user-mai', principalType: 'user', resourceId: 'cluster-dev-k3s', relation: 'viewer', createdAt: '2026-02-01T10:25:00.000Z' },
]

const sleep = (ms = 240) => new Promise((resolve) => setTimeout(resolve, ms))

export function relationAtLeast(current: Relation | null | undefined, required: Relation) {
  if (!current) return false
  return RELATION_RANK[current] >= RELATION_RANK[required]
}

export function getRelationBadgeClass(relation: Relation) {
  if (relation === 'owner') return 'border-purple-400/30 bg-purple-500/15 text-purple-300'
  if (relation === 'admin') return 'border-rose-400/30 bg-rose-500/15 text-rose-300'
  if (relation === 'editor') return 'border-blue-400/30 bg-blue-500/15 text-blue-300'
  return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
}

export function getAllPrincipals() {
  return [...users, ...teams.map((team) => ({ id: team.id, type: 'team' as const, name: team.name }))]
}

export function getResources() {
  return resources
}

export function getTeamsLocal() {
  return teams
}

export function getBestRelationForUser(userId: string, resourceId: string): Relation | null {
  const direct = grants
    .filter((grant) => grant.resourceId === resourceId && grant.principalType === 'user' && grant.principalId === userId)
    .map((grant) => grant.relation)
  const userTeamIds = teams.filter((team) => team.members.some((member) => member.userId === userId)).map((team) => team.id)
  const viaTeams = grants
    .filter((grant) => grant.resourceId === resourceId && grant.principalType === 'team' && userTeamIds.includes(grant.principalId))
    .map((grant) => grant.relation)

  const all = [...direct, ...viaTeams]
  if (all.length === 0) return null
  return all.sort((a, b) => RELATION_RANK[b] - RELATION_RANK[a])[0] ?? null
}

export const mockAccessControlApi = {
  teams: {
    async list() {
      await sleep()
      return teams
    },
    async create(input: { name: string; description: string }) {
      await sleep()
      const newTeam: Team = {
        id: `team-${Date.now()}`,
        name: input.name,
        description: input.description,
        createdAt: new Date().toISOString(),
        members: [],
      }
      teams = [newTeam, ...teams]
      return newTeam
    },
    async addMember(input: { teamId: string; userId: string; role: TeamRole }) {
      await sleep(180)
      const user = users.find((item) => item.id === input.userId)
      if (!user) throw new Error('User not found')
      teams = teams.map((team) => {
        if (team.id !== input.teamId) return team
        if (team.members.some((m) => m.userId === input.userId)) return team
        return {
          ...team,
          members: [
            ...team.members,
            { userId: input.userId, name: user.name, email: user.email ?? '', role: input.role, avatar: user.name.charAt(0).toUpperCase() },
          ],
        }
      })
      return { ok: true }
    },
    async removeMember(input: { teamId: string; userId: string }) {
      await sleep(180)
      teams = teams.map((team) => {
        if (team.id !== input.teamId) return team
        return { ...team, members: team.members.filter((member) => member.userId !== input.userId) }
      })
      return { ok: true }
    },
    async setMemberRole(input: { teamId: string; userId: string; role: TeamRole }) {
      await sleep(180)
      teams = teams.map((team) => {
        if (team.id !== input.teamId) return team
        return {
          ...team,
          members: team.members.map((member) =>
            member.userId === input.userId ? { ...member, role: input.role } : member,
          ),
        }
      })
      return { ok: true }
    },
  },
  permissions: {
    async listGrants() {
      await sleep()
      return grants
    },
    async grant(input: { principalId: string; principalType: PrincipalType; resourceId: string; relation: Relation }) {
      await sleep(220)
      const existing = grants.find(
        (grant) =>
          grant.principalId === input.principalId &&
          grant.principalType === input.principalType &&
          grant.resourceId === input.resourceId,
      )
      if (existing) {
        grants = grants.map((grant) => (grant.id === existing.id ? { ...grant, relation: input.relation } : grant))
        return { ...existing, relation: input.relation }
      }
      const next: AccessGrant = {
        id: `grant-${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...input,
      }
      grants = [next, ...grants]
      return next
    },
    async revoke(input: { grantId: string }) {
      await sleep(180)
      grants = grants.filter((grant) => grant.id !== input.grantId)
      return { ok: true }
    },
  },
}
