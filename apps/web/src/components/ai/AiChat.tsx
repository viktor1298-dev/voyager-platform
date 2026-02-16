'use client'

import { Loader2, Send, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  animate?: boolean
}

type QuickPrompt = {
  id: string
  text: string
}

const HISTORY_KEY = 'voyager-ai-chat-history-v1'
const PAGE_SIZE = 10

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'seed-1',
    role: 'assistant',
    content:
      'Hi, I am Voyager AI Assistant 🤖. I can analyze cluster health, explain incident patterns, and suggest actionable steps.',
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 'seed-2',
    role: 'user',
    content: 'Show me a quick overview for production-eu-1.',
    createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
  },
  {
    id: 'seed-3',
    role: 'assistant',
    content:
      'production-eu-1 is stable overall. CPU is elevated on payments namespace, and there were 3 warning events in the last hour related to image pulls.',
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
]

function buildAssistantReply(question: string, cluster: string): string {
  const normalized = question.toLowerCase()

  if (normalized.includes('health') || normalized.includes('analyze')) {
    return `${cluster}: health score is 84/100. Main risk is CPU pressure in the api and worker deployments. Recommend scaling worker by +1 replica and reviewing throttling limits.`
  }

  if (normalized.includes('recommend')) {
    return `Top recommendations for ${cluster}: (1) Increase memory limit for metrics-agent, (2) Enable HPA on checkout service, (3) Rotate aging node pool within 48 hours.`
  }

  if (normalized.includes('event') || normalized.includes('explain')) {
    return `Recent event pattern in ${cluster}: Warning events are concentrated around image pull backoff and readiness probe failures. The timeline suggests a deployment config drift from the previous successful release.`
  }

  return `I analyzed ${cluster}. Baseline is healthy, with intermittent warnings around deployment rollouts. If you want, I can deep dive into health, recommendations, or events specifically.`
}

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

export function AiChat({
  selectedCluster,
  quickPrompt,
}: {
  selectedCluster: string
  quickPrompt: QuickPrompt | null
}) {
  const reduced = useReducedMotion()
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [draft, setDraft] = useState('')
  const [isResponding, setIsResponding] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const persisted = window.localStorage.getItem(HISTORY_KEY)
    if (!persisted) return

    try {
      const parsed = JSON.parse(persisted) as ChatMessage[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed)
      }
    } catch {
      window.localStorage.removeItem(HISTORY_KEY)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages))
  }, [messages])

  const visibleMessages = useMemo(() => messages.slice(-visibleCount), [messages, visibleCount])

  const loadOlder = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, messages.length))
  }, [messages.length])

  const sendPrompt = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isResponding) return

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMessage])
      setDraft('')
      setIsResponding(true)

      window.requestAnimationFrame(() => {
        const node = viewportRef.current
        if (node) node.scrollTop = node.scrollHeight
      })

      window.setTimeout(
        () => {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: buildAssistantReply(trimmed, selectedCluster),
            createdAt: new Date().toISOString(),
            animate: true,
          }

          setMessages((prev) => [...prev, assistantMessage])
          setIsResponding(false)

          window.requestAnimationFrame(() => {
            const node = viewportRef.current
            if (node) node.scrollTop = node.scrollHeight
          })
        },
        reduced ? 150 : 700,
      )
    },
    [isResponding, reduced, selectedCluster],
  )

  useEffect(() => {
    if (!quickPrompt) return
    sendPrompt(quickPrompt.text)
  }, [quickPrompt, sendPrompt])

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">AI Chat</h2>
        <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-dim)]">
          Cluster: {selectedCluster}
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

            {isResponding && (
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
          sendPrompt(draft)
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about health, anomalies, recommendations..."
          aria-label="Ask AI assistant"
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isResponding}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </form>
    </section>
  )
}
