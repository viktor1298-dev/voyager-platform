'use client'

import { m } from 'motion/react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[App Error]', error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="text-center max-w-md"
      >
        <m.div
          initial={{ rotate: -10 }}
          animate={{ rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <AlertTriangle className="h-16 w-16 text-[var(--color-status-error)] mx-auto mb-6" />
        </m.div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3">Something went wrong</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          Try Again
        </button>
      </m.div>
    </div>
  )
}
