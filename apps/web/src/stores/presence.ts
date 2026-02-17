'use client'

import { create } from 'zustand'

export type PresenceStatus = 'online' | 'away'

export interface PresenceUser {
  id: string
  name: string
  currentPage: string
  avatar?: string
  lastSeen: string
}

interface PresenceState {
  onlineUsers: PresenceUser[]
  myStatus: PresenceStatus
  setOnlineUsers: (users: PresenceUser[]) => void
  upsertUser: (user: PresenceUser) => void
  removeUser: (userId: string) => void
  setMyStatus: (status: PresenceStatus) => void
}

export const AWAY_AFTER_MS = 30_000

export const usePresenceStore = create<PresenceState>()((set) => ({
  onlineUsers: [],
  myStatus: 'online',
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  upsertUser: (user) =>
    set((state) => {
      const existing = state.onlineUsers.find((u) => u.id === user.id)
      if (!existing) {
        return { onlineUsers: [...state.onlineUsers, user] }
      }

      return {
        onlineUsers: state.onlineUsers.map((u) => (u.id === user.id ? { ...u, ...user } : u)),
      }
    }),
  removeUser: (userId) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.id !== userId),
    })),
  setMyStatus: (status) => set({ myStatus: status }),
}))
