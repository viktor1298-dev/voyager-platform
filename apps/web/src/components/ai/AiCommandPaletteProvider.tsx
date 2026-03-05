'use client'

import { useState } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

const ASK_AI_PREFIX = 'ask ai:'

interface AiCommandPaletteProviderProps {
  search: string
  onClear: () => void
  clusterId?: string
}

/**
 * Detects "Ask AI:" prefix in command palette search and renders
 * an inline AI query result. Mount inside the CommandPalette component.
 */
export function AiCommandPaletteProvider({
  search,
  onClear,
  clusterId,
}: AiCommandPaletteProviderProps) {
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState<string | null>(null)

  const contextChatMutation = trpc.ai.contextChat.useMutation()

  const normalizedSearch = search.toLowerCase()
  const isAiQuery = normalizedSearch.startsWith(ASK_AI_PREFIX)
  const aiQuery = isAiQuery ? search.slice(ASK_AI_PREFIX.length).trim() : ''

  async function handleAskAi() {
    if (!aiQuery || contextChatMutation.isPending) return
    setLastQuery(aiQuery)
    setAiResult(null)

    try {
      const result = await contextChatMutation.mutateAsync({
        prompt: aiQuery,
        context: { type: 'dashboard', data: { source: 'command-palette' } },
        clusterId,
      })
      setAiResult(result.answer)
    } catch {
      setAiResult('Failed to get AI response. Please check your AI key in Settings.')
    }
  }

  if (!isAiQuery) return null

  return (
    <div className="px-3 py-2 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-semibold text-purple-400">AI Query</span>
      </div>

      {aiQuery ? (
        <>
          {aiResult ? (
            <div className="text-xs text-[var(--color-text-primary)] leading-relaxed mb-2 whitespace-pre-wrap">
              {aiResult}
            </div>
          ) : lastQuery === aiQuery && contextChatMutation.isPending ? (
            <div className="flex items-center gap-1.5 text-xs text-purple-400 mb-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Asking AI...</span>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
              Press Enter to ask AI: <em className="text-[var(--color-text-secondary)]">{aiQuery}</em>
            </p>
          )}

          <button
            type="button"
            onClick={handleAskAi}
            disabled={contextChatMutation.isPending || !aiQuery}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40"
          >
            {contextChatMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              '✨'
            )}
            Ask AI
          </button>
        </>
      ) : (
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Type your question after "Ask AI:" to query the AI assistant
        </p>
      )}
    </div>
  )
}
