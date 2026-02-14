import { create } from 'zustand'

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
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
}))
