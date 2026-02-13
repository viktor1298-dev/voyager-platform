'use client'

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div className="text-center">
        <h2 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h2>
        <p className="text-[var(--color-text-muted)] mb-4">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
