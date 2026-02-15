import { getBestRelationForUser, relationAtLeast, type Relation } from '@/lib/mock-access-control'
import { useAuthStore } from '@/stores/auth'
import { useMemo } from 'react'

type ObjectType = 'cluster' | 'team' | 'user'

const RESOURCE_PREFIX_BY_TYPE: Partial<Record<ObjectType, string>> = {
  cluster: 'cluster-',
}

function toResourceId(objectType: ObjectType, objectId: string) {
  const prefix = RESOURCE_PREFIX_BY_TYPE[objectType]
  if (!prefix) {
    // TODO: support team/user resource permission IDs once backend schema is finalized.
    return objectId
  }
  return objectId.startsWith(prefix) ? objectId : `${prefix}${objectId}`
}

export function usePermission(objectType: ObjectType, objectId: string, relation: Relation) {
  const user = useAuthStore((state) => state.user)

  return useMemo(() => {
    if (!user) return false
    if (user.role === 'admin') return true

    const resourceId = toResourceId(objectType, objectId)
    const currentRelation = getBestRelationForUser(user.id, resourceId)
    return relationAtLeast(currentRelation, relation)
  }, [objectId, objectType, relation, user])
}
