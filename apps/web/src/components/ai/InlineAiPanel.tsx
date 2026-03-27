'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Send, X, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export type AiContextType = 'anomaly' | 'pod' | 'alert' | 'cluster' | 'dashboard'

interface InlineAiPanelProps {
  open: boolean
  onClose: () => void
  contextType: AiContextType
  contextData: Record<string, unknown>
  initialPrompt: string
  clusterId?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function InlineAiPanel({
  open,
  onClose,
  contextType,
  contextData,
  initialPrompt,
  clusterId,
}: InlineAiPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [followUp, setFollowUp] = useState('')
  // Track whether the initial prompt has been sent for the current open session
  const hasAskedInitialRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prefersReduced = useReducedMotion()

  const contextChatMutation = trpc.ai.contextChat.useMutation()

  // Use refs to always capture the latest contextType/contextData/clusterId/initialPrompt
  // This avoids stale closures without adding them as effect dependencies
  const contextTypeRef = useRef(contextType)
  const contextDataRef = useRef(contextData)
  const clusterIdRef = useRef(clusterId)
  const initialPromptRef = useRef(initialPrompt)
  // Keep mutation ref stable — useMutation returns a new object each render,
  // so we store it in a ref to avoid making askQuestion re-create on each render
  const mutationRef = useRef(contextChatMutation)
  useEffect(() => {
    contextTypeRef.current = contextType
  }, [contextType])
  useEffect(() => {
    contextDataRef.current = contextData
  }, [contextData])
  useEffect(() => {
    clusterIdRef.current = clusterId
  }, [clusterId])
  useEffect(() => {
    initialPromptRef.current = initialPrompt
  }, [initialPrompt])
  // Always keep mutationRef current without causing re-renders of askQuestion
  mutationRef.current = contextChatMutation

  // askQuestion is stable — it never changes reference because it only uses refs
  // This prevents the useEffect below from re-firing on every render
  const askQuestion = useCallback(async (prompt: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: prompt }])

    try {
      const result = await mutationRef.current.mutateAsync({
        prompt,
        context: { type: contextTypeRef.current, data: contextDataRef.current },
        clusterId: clusterIdRef.current,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: result.answer }])
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('NO_API_KEY')
          ? 'No AI key configured. Please add one in Settings → AI Keys.'
          : 'Failed to get AI response. Please try again.'
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }])
    }
  }, []) // stable — only uses refs

  // FIX BUG-192-001: cleanup added to prevent global listener leak that broke SPA routing
  // Auto-ask initial prompt when panel opens; reset when closed.
  // IMPORTANT: askQuestion is stable (no deps), so this effect only fires when `open` changes.
  // Previously, askQuestion depended on contextChatMutation (new object every render),
  // causing this effect to re-run every render → infinite setState loop → navigation frozen.
  useEffect(() => {
    if (open) {
      if (!hasAskedInitialRef.current) {
        hasAskedInitialRef.current = true
        askQuestion(initialPromptRef.current)
      }
    } else {
      // Reset for next open session
      hasAskedInitialRef.current = false
      setMessages([])
    }
  }, [open, askQuestion]) // askQuestion is stable, so this only fires on open change

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleFollowUp(e: React.FormEvent) {
    e.preventDefault()
    if (!followUp.trim() || contextChatMutation.isPending) return
    const q = followUp.trim()
    setFollowUp('')
    askQuestion(q)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ overflow: 'hidden' }}
        >
          <div
            className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] bg-[var(--color-surface-elevated,var(--color-bg-card))] overflow-hidden"
            style={{
              borderLeft: '4px solid color-mix(in srgb, var(--color-accent) 60%, transparent)',
            }}
            role="region"
            aria-label="AI assistant panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]">
              <span className="text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1">
                ✨ AI Assistant
              </span>
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                aria-label="Close AI panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="px-3 py-2 space-y-3 overflow-y-auto"
              style={{ maxHeight: '400px' }}
              aria-live="polite"
            >
              {messages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
                  {msg.role === 'user' ? (
                    <span className="inline-block text-xs text-[var(--color-text-muted)] italic">
                      {msg.content}
                    </span>
                  ) : (
                    <div
                      className="text-xs text-[var(--color-text-primary)] leading-relaxed prose prose-invert prose-xs max-w-none"
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}

              {contextChatMutation.isPending && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            {/* Follow-up input */}
            <form
              onSubmit={handleFollowUp}
              className="flex items-center gap-2 px-3 py-2 border-t border-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
            >
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up question..."
                className="flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
                disabled={contextChatMutation.isPending}
              />
              <button
                type="submit"
                disabled={!followUp.trim() || contextChatMutation.isPending}
                className="text-[var(--color-accent)] hover:opacity-80 disabled:opacity-40 transition-colors"
                aria-label="Send follow-up"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
