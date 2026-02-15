import { useAuthStore } from '@/stores/auth'

export function useIsAdmin() {
  return useAuthStore((s) => {
    if (s.isLoading) return null
    return s.user?.role === 'admin'
  })
}
