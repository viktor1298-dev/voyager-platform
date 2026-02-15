import { create } from 'zustand'
import { authClient } from '@/lib/auth-client'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'viewer'
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  setUser: (user: User | null) => void
  clearUser: () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  clearUser: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  logout: async () => {
    try {
      await authClient.signOut()
    } catch {
      // ignore errors on signout
    }
    set({ user: null, isAuthenticated: false, isLoading: false })
  },
}))
