import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotificationsState {
  lastReadAt: string | null
  setLastRead: () => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      lastReadAt: null,
      setLastRead: () => set({ lastReadAt: new Date().toISOString() }),
    }),
    { name: 'voyager-notifications-last-read' },
  ),
)
