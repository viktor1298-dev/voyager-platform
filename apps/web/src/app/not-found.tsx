'use client'

import { m } from 'motion/react'
import { Compass, Home } from 'lucide-react'
import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <m.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center max-w-md"
      >
        <m.div
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <Compass className="h-16 w-16 text-[var(--color-accent)] mx-auto mb-6" />
        </m.div>
        <h1 className="text-6xl font-extrabold text-[var(--color-text-primary)] mb-2">404</h1>
        <h2 className="text-xl font-semibold text-[var(--color-text-secondary)] mb-3">Page Not Found</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </m.div>
    </div>
  )
}
