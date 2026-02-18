'use client'

import { AlertTriangle, Loader2, Send, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { trpc } from '@/lib/trpc'
import { type AiChatMessage, useAiAssistantStore } from '@/stores/ai-assistant'

const PAGE_SIZE = 10

type ConversationHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

type ConversationHistoryResponse = {
  threadId?: string | null
  conversationId?: string | null
  createdAt?: string
  updatedAt?: string
  messages: ConversationHistoryMessage[]
}

type FallbackChatResponse = {
  answer: string
  threadId?: string | null
  conversationId?: string | null
}

type StreamChunkEvent = {
  type?: string
  token?: string
  delta?: string
  content?: string
  done?: boolean
  threadId?: string
  provider?: string
  model?: string
  error?: string
}

type StreamResult =
  | {
      status: 'ok'
      answer: string
      threadId: string | null
    }
  | {
      status: 'transport-error'
    }
  | {
      status: 'protocol-error'
    }

function toMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveCanonicalThreadId(payload: {
  threadId?: string | null
  conversationId?: string | null
}): string | null {
  if (payload.threadId?.trim()) {
    return payload.threadId
  }

  if (payload.conversationId?.trim()) {
    return payload.conversationId
  }

  return null
}

function parseSseEventBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n').map((line) => line.trim())
  if (lines.length === 0) return null

  const eventLine = lines.find((line) => line.startsWith('event:'))
  const dataLines = lines.filter((line) => line.startsWith('data:'))

  return {
    event: eventLine ? eventLine.slice(6).trim() : 'message',
    data: dataLines.map((line) => line.slice(5).trim()).join('\n'),
  }
}

async function streamAssistantReply(params: {
  clusterId: string
  question: string
  threadId: string | null
  onDelta: (delta: string) => void
  signal: AbortSignal
}): Promise<StreamResult> {
  const body = JSON.stringify({
    clusterId: params.clusterId,
    question: params.question,
    threadId: params.threadId,
  })

  const candidates = ['/api/ai/chat/stream', '/api/ai/stream']

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream, application/x-ndjson, application/json',
        },
        credentials: 'include',
        body,
        signal: params.signal,
      })

      if (!response.ok || !response.body) continue

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let aggregate = ''
      let buffer = ''
      let sawProtocolEvent = false
      let resolvedThreadId: string | null = params.threadId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue

        if (contentType.includes('text/event-stream')) {
          buffer += chunk
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''

          for (const block of blocks) {
            const event = parseSseEventBlock(block)
            if (!event) continue
            if (!event.data || event.data === '[DONE]') continue

            let parsed: StreamChunkEvent
            try {
              parsed = JSON.parse(event.data) as StreamChunkEvent
            } catch {
              continue
            }

            const isDoneEvent = event.event === 'done' || parsed.done === true
            const delta = parsed.token ?? parsed.delta ?? parsed.content ?? ''

            if (delta) {
              sawProtocolEvent = true
              aggregate += delta
              params.onDelta(delta)
            }

            if (parsed.threadId) {
              resolvedThreadId = parsed.threadId
            }

            if (isDoneEvent) {
              sawProtocolEvent = true
              return {
                status: 'ok',
                answer: aggregate,
                threadId: resolvedThreadId,
              }
            }
          }

          continue
        }

        return {
          status: 'protocol-error',
        }
      }

      if (sawProtocolEvent) {
        return {
          status: 'ok',
          answer: aggregate,
          threadId: resolvedThreadId,
        }
      }

      return {
        status: 'protocol-error',
      }
    } catch {
      // Try next candidate endpoint
    }
  }

  return {
    status: 'transport-error',
  }
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
  const threadIdByCluster = useAiAssistantStore((state) => state.threadIdByCluster)
  const appendMessage = useAiAssistantStore((state) => state.appendMessage)
  const setClusterMessages = useAiAssistantStore((state) => state.setClusterMessages)
  const appendToMessage = useAiAssistantStore((state) => state.appendToMessage)
  const setThreadId = useAiAssistantStore((state) => state.setThreadId)
  const quickPrompt = useAiAssistantStore((state) => state.quickPrompt)
  const clearQuickPrompt = useAiAssistantStore((state) => state.clearQuickPrompt)

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [draft, setDraft] = useState('')
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const trpcUtils = trpc.useUtils()
  const chatMutation = trpc.ai.chat.useMutation()

  const messages = useMemo(() => {
    if (!selectedClusterId) return [buildDefaultAssistantGreeting(null)]
    return chatByCluster[selectedClusterId] ?? [buildDefaultAssistantGreeting(selectedClusterName)]
  }, [chatByCluster, selectedClusterId, selectedClusterName])

  const visibleMessages = useMemo(() => messages.slice(-visibleCount), [messages, visibleCount])

  const loadOlder = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, messages.length))
  }, [messages.length])

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const node = viewportRef.current
      if (node) node.scrollTop = node.scrollHeight
    })
  }, [])

  const syncHistory = useCallback(async () => {
    if (!selectedClusterId) return

    setIsHistoryLoading(true)
    setHistoryError(null)

    try {
      const history = (await trpcUtils.ai.history.fetch({
        clusterId: selectedClusterId,
      })) as ConversationHistoryResponse | null

      if (!history || history.messages.length === 0) {
        const existing = chatByCluster[selectedClusterId]
        if (!existing || existing.length === 0) {
          setClusterMessages(selectedClusterId, [
            buildDefaultAssistantGreeting(selectedClusterName),
          ])
        }
        return
      }

      const canonicalHistoryThreadId = resolveCanonicalThreadId(history)
      if (canonicalHistoryThreadId) {
        setThreadId(selectedClusterId, canonicalHistoryThreadId)
      }

      const historyMessagePrefix =
        canonicalHistoryThreadId ?? history.conversationId ?? selectedClusterId

      const mapped: AiChatMessage[] = history.messages.map((message, index) => ({
        id: `history-${historyMessagePrefix}-${index}`,
        role: message.role,
        content: message.content,
        createdAt: message.timestamp ?? history.createdAt ?? new Date().toISOString(),
      }))

      setClusterMessages(selectedClusterId, mapped)
      setVisibleCount(PAGE_SIZE)
    } catch {
      setHistoryError('Could not load conversation history')
    } finally {
      setIsHistoryLoading(false)
      scrollToBottom()
    }
  }, [
    chatByCluster,
    scrollToBottom,
    selectedClusterId,
    selectedClusterName,
    setClusterMessages,
    setThreadId,
    trpcUtils.ai.history,
  ])

  const sendPrompt = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || !selectedClusterId || isStreaming || chatMutation.isPending) return

      setChatError(null)
      setLastPrompt(trimmed)

      const userMessage: AiChatMessage = {
        id: toMessageId('user'),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      }

      appendMessage(selectedClusterId, userMessage)
      setDraft('')
      scrollToBottom()

      const assistantMessageId = toMessageId('assistant-stream')
      setStreamingMessageId(assistantMessageId)
      setIsStreaming(true)

      appendMessage(selectedClusterId, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        animate: !reduced,
      })

      const currentThreadId = threadIdByCluster[selectedClusterId] ?? null

      const updateStreamingContent = (delta: string) => {
        appendToMessage(selectedClusterId, assistantMessageId, delta)
        scrollToBottom()
      }

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const streamed = await streamAssistantReply({
          clusterId: selectedClusterId,
          question: trimmed,
          threadId: currentThreadId,
          onDelta: updateStreamingContent,
          signal: abortController.signal,
        })

        if (streamed.status === 'ok') {
          if (streamed.threadId) {
            setThreadId(selectedClusterId, streamed.threadId)
          }

          if (!streamed.answer.trim()) {
            setChatError('AI stream finished without content. Please retry.')
          }
        } else if (streamed.status === 'transport-error') {
          const response = (await chatMutation.mutateAsync({
            clusterId: selectedClusterId,
            question: trimmed,
          })) as FallbackChatResponse

          setClusterMessages(
            selectedClusterId,
            (useAiAssistantStore.getState().chatByCluster[selectedClusterId] ?? []).map(
              (message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: response.answer,
                    }
                  : message,
            ),
          )

          const canonicalFallbackThreadId = resolveCanonicalThreadId(response)
          if (canonicalFallbackThreadId) {
            setThreadId(selectedClusterId, canonicalFallbackThreadId)
          }
        } else {
          setChatError('AI stream protocol mismatch. Please retry.')
        }

        void syncHistory()
      } catch {
        setChatError('AI response failed. Please retry.')
        toast.error('AI response failed. Please retry.')

        setClusterMessages(
          selectedClusterId,
          (useAiAssistantStore.getState().chatByCluster[selectedClusterId] ?? []).map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content:
                    'I could not reach the AI backend right now. Please retry in a few seconds.',
                }
              : message,
          ),
        )
      } finally {
        setStreamingMessageId(null)
        setIsStreaming(false)
        abortRef.current = null
        scrollToBottom()
      }
    },
    [
      appendMessage,
      appendToMessage,
      chatMutation,
      isStreaming,
      reduced,
      scrollToBottom,
      selectedClusterId,
      setClusterMessages,
      setThreadId,
      syncHistory,
      threadIdByCluster,
    ],
  )

  useEffect(() => {
    void syncHistory()

    return () => {
      abortRef.current?.abort()
    }
  }, [syncHistory])

  useEffect(() => {
    if (!quickPrompt) return
    void sendPrompt(quickPrompt.text)
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

      {historyError && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/10 px-3 py-2 text-xs text-[var(--color-status-warning)]">
          <div className="inline-flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {historyError}
          </div>
          <button
            type="button"
            onClick={() => {
              void syncHistory()
            }}
            className="rounded-lg border border-[var(--color-status-warning)]/40 px-2 py-1 text-[11px] hover:bg-[var(--color-status-warning)]/10"
          >
            Retry
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop < 40) loadOlder()
        }}
        className="h-[440px] overflow-y-auto rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-bg-secondary)] p-3 sm:p-4"
      >
        <AnimatePresence initial={false}>
          <div className="space-y-3">
            {isHistoryLoading && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading conversation history...
              </div>
            )}

            {visibleMessages.map((message) => {
              const isUser = message.role === 'user'
              const isStreamingMessage = message.id === streamingMessageId

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
                      <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                        {message.content}
                        {isStreamingMessage && isStreaming && (
                          <span className="ml-1 inline-block animate-pulse text-[var(--color-text-dim)]">
                            ▋
                          </span>
                        )}
                      </p>
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

            {(chatMutation.isPending || isStreaming) && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI is analyzing cluster signals...
              </div>
            )}
          </div>
        </AnimatePresence>
      </div>

      {chatError && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-status-error)]/40 bg-[var(--color-status-error)]/10 px-3 py-2 text-xs text-[var(--color-status-error)]">
          <span>{chatError}</span>
          <button
            type="button"
            onClick={() => {
              if (lastPrompt) {
                void sendPrompt(lastPrompt)
              }
            }}
            disabled={!lastPrompt || isStreaming || chatMutation.isPending}
            className="rounded-lg border border-[var(--color-status-error)]/40 px-2 py-1 text-[11px] hover:bg-[var(--color-status-error)]/10 disabled:opacity-60"
          >
            Retry last prompt
          </button>
        </div>
      )}

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
          disabled={!selectedClusterId || isHistoryLoading}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!selectedClusterId || !draft.trim() || isStreaming || chatMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </form>
    </section>
  )
}
