'use client'

import { Sparkles } from 'lucide-react'

export type InlineAiTriggerVariant = 'button' | 'icon' | 'banner'

interface InlineAiTriggerProps {
  label?: string
  variant?: InlineAiTriggerVariant
  onClick: () => void
  disabled?: boolean
  className?: string
}

export function InlineAiTrigger({
  label = 'Ask AI',
  variant = 'button',
  onClick,
  disabled,
  className,
}: InlineAiTriggerProps) {
  // BUG-192-001-v3 FIX: Removed trpc.ai.keySettingsStatus.useQuery from this component.
  // That query was batched by tRPC httpBatchLink with other critical queries
  // (events.list, clusters.live, etc.) into a combined URL like:
  //   /trpc/events.list,...,ai.keySettingsStatus?batch=1
  // The deployed Nginx proxy returned 404 for this long comma-separated batch path,
  // causing ALL batched queries to fail with retry loops that saturated React's
  // concurrent scheduler → navigation transitions from /anomalies never completed.
  //
  // Fix: Always show the trigger as enabled. If no AI key is configured, the
  // contextChat mutation returns a clear error message (handled in InlineAiPanel).
  const isDisabled = disabled

  const title = label

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        title={title}
        className={`inline-flex items-center justify-center h-6 w-6 rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ''}`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </button>
    )
  }

  if (variant === 'banner') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        title={title}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors border border-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ''}`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
    )
  }

  // Default: button
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ''}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  )
}
