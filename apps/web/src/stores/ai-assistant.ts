import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AiChatRole = 'user' | 'assistant'

export type AiChatMessage = {
  id: string
  role: AiChatRole
  content: string
  createdAt: string
  animate?: boolean
}

export type AiQuickPrompt = {
  id: string
  text: string
}

type AiAssistantState = {
  selectedClusterId: string | null
  quickPrompt: AiQuickPrompt | null
  chatByCluster: Record<string, AiChatMessage[]>
  dismissedRecommendationIds: Record<string, string[]>
  setSelectedClusterId: (clusterId: string) => void
  queueQuickPrompt: (prompt: AiQuickPrompt) => void
  clearQuickPrompt: () => void
  appendMessage: (clusterId: string, message: AiChatMessage) => void
  setClusterMessages: (clusterId: string, messages: AiChatMessage[]) => void
  dismissRecommendation: (clusterId: string, recommendationId: string) => void
  getDismissedForCluster: (clusterId: string) => string[]
}

export const useAiAssistantStore = create<AiAssistantState>()(
  persist(
    (set, get) => ({
      selectedClusterId: null,
      quickPrompt: null,
      chatByCluster: {},
      dismissedRecommendationIds: {},
      setSelectedClusterId: (clusterId) =>
        set((state) =>
          state.selectedClusterId === clusterId ? state : { selectedClusterId: clusterId },
        ),
      queueQuickPrompt: (prompt) => set({ quickPrompt: prompt }),
      clearQuickPrompt: () => set({ quickPrompt: null }),
      appendMessage: (clusterId, message) =>
        set((state) => ({
          chatByCluster: {
            ...state.chatByCluster,
            [clusterId]: [...(state.chatByCluster[clusterId] ?? []), message],
          },
        })),
      setClusterMessages: (clusterId, messages) =>
        set((state) => ({
          chatByCluster: {
            ...state.chatByCluster,
            [clusterId]: messages,
          },
        })),
      dismissRecommendation: (clusterId, recommendationId) =>
        set((state) => {
          const current = state.dismissedRecommendationIds[clusterId] ?? []
          if (current.includes(recommendationId)) {
            return state
          }

          return {
            dismissedRecommendationIds: {
              ...state.dismissedRecommendationIds,
              [clusterId]: [...current, recommendationId],
            },
          }
        }),
      getDismissedForCluster: (clusterId) => get().dismissedRecommendationIds[clusterId] ?? [],
    }),
    {
      name: 'voyager-ai-assistant-v1',
      partialize: (state) => ({
        selectedClusterId: state.selectedClusterId,
        chatByCluster: state.chatByCluster,
        dismissedRecommendationIds: state.dismissedRecommendationIds,
      }),
    },
  ),
)
