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
  threadIdByCluster: Record<string, string>
  dismissedRecommendationIds: Record<string, string[]>
  setSelectedClusterId: (clusterId: string) => void
  queueQuickPrompt: (prompt: AiQuickPrompt) => void
  clearQuickPrompt: () => void
  appendMessage: (clusterId: string, message: AiChatMessage) => void
  setClusterMessages: (clusterId: string, messages: AiChatMessage[]) => void
  appendToMessage: (clusterId: string, messageId: string, delta: string) => void
  setThreadId: (clusterId: string, threadId: string) => void
  dismissRecommendation: (clusterId: string, recommendationId: string) => void
  getDismissedForCluster: (clusterId: string) => string[]
}

export const useAiAssistantStore = create<AiAssistantState>()(
  persist(
    (set, get) => ({
      selectedClusterId: null,
      quickPrompt: null,
      chatByCluster: {},
      threadIdByCluster: {},
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
      appendToMessage: (clusterId, messageId, delta) =>
        set((state) => {
          const current = state.chatByCluster[clusterId] ?? []
          const next = current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: `${message.content}${delta}`,
                }
              : message,
          )

          return {
            chatByCluster: {
              ...state.chatByCluster,
              [clusterId]: next,
            },
          }
        }),
      setThreadId: (clusterId, threadId) =>
        set((state) => ({
          threadIdByCluster: {
            ...state.threadIdByCluster,
            [clusterId]: threadId,
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
        threadIdByCluster: state.threadIdByCluster,
        dismissedRecommendationIds: state.dismissedRecommendationIds,
      }),
    },
  ),
)
