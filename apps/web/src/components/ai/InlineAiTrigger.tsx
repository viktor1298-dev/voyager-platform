'use client'

import { Sparkles } from 'lucide-react'
import { trpc } from '@/lib/trpc'

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
  const keysQuery = trpc.ai.keySettingsStatus.useQuery({ provider: undefined })
  const hasKey = (keysQuery.data?.length ?? 0) > 0
  const isDisabled = disabled || !hasKey || keysQuery.isLoading

  const title = !hasKey
    ? 'Configure an AI key in Settings → AI Keys to enable inline AI'
    : label

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
