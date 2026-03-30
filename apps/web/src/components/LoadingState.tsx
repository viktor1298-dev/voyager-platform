'use client'

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-label={message}
      className="flex flex-col items-center justify-center py-24"
    >
      <div className="flex items-center gap-1.5 mb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: 'var(--color-accent)',
              animation: 'pulse-dot 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <span className="text-sm text-[var(--color-text-muted)] font-mono">{message}</span>
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
