import { useAuthStore } from '@/stores/auth'

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.role === 'admin')
}
