'use client'

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin mb-4" />
      <span className="text-sm text-[var(--color-text-muted)] font-mono">{message}</span>
    </div>
  )
}
