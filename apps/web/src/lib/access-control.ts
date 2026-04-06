export type Relation = 'owner' | 'admin' | 'editor' | 'viewer'
export type PrincipalType = 'user' | 'team'
export type TeamRole = 'admin' | 'member'

const RELATION_RANK: Record<Relation, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

export const TEAM_ROLE_OPTIONS: TeamRole[] = ['admin', 'member']

export function relationAtLeast(current: Relation | null | undefined, required: Relation) {
  if (!current) return false
  return RELATION_RANK[current] >= RELATION_RANK[required]
}

export function getRelationBadgeClass(relation: Relation) {
  if (relation === 'owner') return 'relation-badge relation-badge--owner'
  if (relation === 'admin') return 'relation-badge relation-badge--admin'
  if (relation === 'editor') return 'relation-badge relation-badge--editor'
  return 'relation-badge relation-badge--viewer'
}
