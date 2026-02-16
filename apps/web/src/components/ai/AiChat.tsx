'use client'

import { Loader2, Send, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { trpc } from '@/lib/trpc'
import { type AiChatMessage, useAiAssistantStore } from '@/stores/ai-assistant'

const PAGE_SIZE = 10

function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const reduced = useReducedMotion()
  const [visibleChars, setVisibleChars] = useState(animate && !reduced ? 0 : text.length)

  useEffect(() => {
    if (!animate || reduced) {
      setVisibleChars(text.length)
      return
    }

    setVisibleChars(0)
    const interval = window.setInterval(() => {
      setVisibleChars((prev) => {
        if (prev >= text.length) {
          window.clearInterval(interval)
          return text.length
        }
        return prev + 2
      })
    }, 16)

    return () => window.clearInterval(interval)
  }, [animate, reduced, text])

  return (
    <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
      {text.slice(0, visibleChars)}
    </p>
  )
}

const buildDefaultAssistantGreeting = (clusterName: string | null): AiChatMessage => ({
  id: `seed-${clusterName ?? 'generic'}`,
  role: 'assistant',
  content: clusterName
    ? `Hi, I am Voyager AI Assistant 🤖. Ask me anything about ${clusterName} health, events, and recommendations.`
    : 'Hi, I am Voyager AI Assistant 🤖. Select a cluster to start analyzing live signals.',
  createdAt: new Date().toISOString(),
})

export function AiChat({
  selectedClusterId,
  selectedClusterName,
}: {
  selectedClusterId: string | null
  selectedClusterName: string | null
}) {
  const reduced = useReducedMotion()
  const chatByCluster = useAiAssistantStore((state) => state.chatByCluster)
  const appendMessage = useAiAssistantStore((state) => state.appendMessage)
  const setClusterMessages = useAiAssistantStore((state) => state.setClusterMessages)
  const quickPrompt = useAiAssistantStore((state) => state.quickPrompt)
  const clearQuickPrompt = useAiAssistantStore((state) => state.clearQuickPrompt)

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [draft, setDraft] = useState('')
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const chatMutation = trpc.ai.chat.useMutation()

  useEffect(() => {
    if (!selectedClusterId) return

    const existingMessages = chatByCluster[selectedClusterId]
    if (!existingMessages || existingMessages.length === 0) {
      setClusterMessages(selectedClusterId, [buildDefaultAssistantGreeting(selectedClusterName)])
    }
  }, [chatByCluster, selectedClusterId, selectedClusterName, setClusterMessages])

  const messages = useMemo(() => {
    if (!selectedClusterId) return [buildDefaultAssistantGreeting(null)]
    return chatByCluster[selectedClusterId] ?? [buildDefaultAssistantGreeting(selectedClusterName)]
  }, [chatByCluster, selectedClusterId, selectedClusterName])

  const visibleMessages = useMemo(() => messages.slice(-visibleCount), [messages, visibleCount])

  const loadOlder = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, messages.length))
  }, [messages.length])

  const sendPrompt = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || !selectedClusterId || chatMutation.isPending) return

      const userMessage: AiChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      }

      appendMessage(selectedClusterId, userMessage)
      setDraft('')

      window.requestAnimationFrame(() => {
        const node = viewportRef.current
        if (node) node.scrollTop = node.scrollHeight
      })

      try {
        const response = await chatMutation.mutateAsync({
          clusterId: selectedClusterId,
          question: trimmed,
        })

        const assistantMessage: AiChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          createdAt: new Date().toISOString(),
          animate: !reduced,
        }

        appendMessage(selectedClusterId, assistantMessage)
      } catch {
        toast.error('AI response failed. Please try again.')

        appendMessage(selectedClusterId, {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'I could not reach the AI backend right now. Please retry in a few seconds.',
          createdAt: new Date().toISOString(),
          animate: !reduced,
        })
      } finally {
        window.requestAnimationFrame(() => {
          const node = viewportRef.current
          if (node) node.scrollTop = node.scrollHeight
        })
      }
    },
    [appendMessage, chatMutation, reduced, selectedClusterId],
  )

  useEffect(() => {
    if (!quickPrompt) return
    sendPrompt(quickPrompt.text)
    clearQuickPrompt()
  }, [quickPrompt, sendPrompt, clearQuickPrompt])

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">AI Chat</h2>
        <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)]">
          Cluster: {selectedClusterName ?? 'Not selected'}
        </span>
      </div>

      <div
        ref={viewportRef}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop < 40) loadOlder()
        }}
        className="h-[440px] overflow-y-auto rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-bg-secondary)] p-3 sm:p-4"
      >
        <AnimatePresence initial={false}>
          <div className="space-y-3">
            {visibleMessages.map((message) => {
              const isUser = message.role === 'user'
              return (
                <motion.div
                  key={message.id}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={reduced ? {} : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm">
                      🤖
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      isUser
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'border border-[var(--color-border)] bg-[var(--color-bg-card)]'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-sm leading-6 text-white">{message.content}</p>
                    ) : (
                      <TypewriterText text={message.content} animate={Boolean(message.animate)} />
                    )}
                  </div>

                  {isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </motion.div>
              )
            })}

            {chatMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI is analyzing cluster signals...
              </div>
            )}
          </div>
        </AnimatePresence>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sendPrompt(draft)
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about health, anomalies, recommendations..."
          aria-label="Ask AI assistant"
          disabled={!selectedClusterId}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!selectedClusterId || !draft.trim() || chatMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </form>
    </section>
  )
}
