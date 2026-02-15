import { getBestRelationForUser, relationAtLeast, type Relation } from '@/lib/mock-access-control'
import { useAuthStore } from '@/stores/auth'
import { useMemo } from 'react'

type ObjectType = 'cluster' | 'team' | 'user'

export function usePermission(_objectType: ObjectType, objectId: string, relation: Relation) {
  const user = useAuthStore((state) => state.user)

  return useMemo(() => {
    if (!user) return false
    if (user.role === 'admin') return true

    const currentRelation = getBestRelationForUser(user.id, objectId)
    return relationAtLeast(currentRelation, relation)
  }, [objectId, relation, user])
}
