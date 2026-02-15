import { getBestRelationForUser, relationAtLeast, type Relation } from '@/lib/mock-access-control'
import { useAuthStore } from '@/stores/auth'
import { useMemo } from 'react'

type ObjectType = 'cluster' | 'team' | 'user'

export function usePermission(objectType: ObjectType, objectId: string, relation: Relation) {
  const user = useAuthStore((state) => state.user)

  return useMemo(() => {
    if (!user) return false
    if (user.role === 'admin') return true

    if (objectType === 'cluster') {
      const resourceId = objectId.startsWith('cluster-') ? objectId : `cluster-${objectId}`
      const currentRelation = getBestRelationForUser(user.id, resourceId)
      return relationAtLeast(currentRelation, relation)
    }

    return false
  }, [objectId, objectType, relation, user])
}
