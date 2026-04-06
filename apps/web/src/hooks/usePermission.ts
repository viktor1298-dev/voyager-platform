import { relationAtLeast, type Relation } from '@/lib/access-control'
import { useAuthStore } from '@/stores/auth'
import { trpc } from '@/lib/trpc'
import { useMemo } from 'react'

type ObjectType = 'cluster' | 'team' | 'user'

export function usePermission(_objectType: ObjectType, objectId: string, relation: Relation) {
  const user = useAuthStore((state) => state.user)
  const grantsQuery = trpc.authorization.listForUser.useQuery(
    { userId: user?.id ?? '' },
    { enabled: !!user && user.role !== 'admin' },
  )

  return useMemo(() => {
    if (!user) return false
    if (user.role === 'admin') return true

    const grants = grantsQuery.data ?? []
    const match = grants.find((g) => g.objectId === objectId)
    const currentRelation = (match?.relation as Relation) ?? null
    return relationAtLeast(currentRelation, relation)
  }, [objectId, relation, user, grantsQuery.data])
}
