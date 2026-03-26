'use client'

import { motion } from 'motion/react'
import { Compass, Home, Search, BarChart3, Server, Bell, Settings, Activity } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { AppLayout } from '@/components/AppLayout'
import { useAuthStore } from '@/stores/auth'

const POPULAR_PAGES = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/clusters', label: 'Clusters', icon: Server },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/events', label: 'Events', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function NotFoundContent() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    router.push(`/?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <div className="flex items-center justify-center px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center max-w-md w-full"
      >
        <motion.div
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <Compass className="h-16 w-16 text-[var(--color-accent)] mx-auto mb-6" />
        </motion.div>
        <h1 className="text-6xl font-extrabold text-[var(--color-text-primary)] mb-2">404</h1>
        <h2 className="text-xl font-semibold text-[var(--color-text-secondary)] mb-3">Page Not Found</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Search input */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a page…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
        </form>

        {/* Popular pages */}
        <div className="mb-8">
          <p className="text-xs text-[var(--color-text-dim)] font-mono uppercase tracking-wider mb-3">Popular pages</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {POPULAR_PAGES.map((page) => {
              const Icon = page.icon
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5 transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{page.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </motion.div>
    </div>
  )
}

export default function NotFoundPage() {
  usePageTitle('404 — Not Found')

  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)

  // While checking auth, show a minimal loading state
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg-primary)' }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]" />
      </div>
    )
  }

  // Authenticated → render inside AppLayout (with sidebar)
  if (user) {
    return (
      <AppLayout>
        <NotFoundContent />
      </AppLayout>
    )
  }

  // Not authenticated → standalone full-screen 404
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <NotFoundContent />
    </div>
  )
}
