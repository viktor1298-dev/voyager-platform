import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ClusterContextState {
  activeClusterId: string | null
  setActiveCluster: (id: string | null) => void
}

export const useClusterContext = create<ClusterContextState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      setActiveCluster: (id) => set({ activeClusterId: id }),
    }),
    {
      name: 'voyager-active-cluster',
    },
  ),
)
