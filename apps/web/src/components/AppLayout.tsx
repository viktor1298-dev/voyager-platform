'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AuthGuard } from './AuthGuard'
import { PresenceBar } from './PresenceBar'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function useDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(min-width: 768px)').matches
  })

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)

    setIsDesktop(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}

// Matches /clusters/[id]/tab patterns (id + optional tab segment)
const CLUSTER_DETAIL_RE = /^\/clusters\/[^/]+(?:\/[^/]+)?$/

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isDesktop = useDesktopLayout()
  // Remember the user's collapse preference before auto-collapse
  const prevCollapsedRef = useRef(false)
  const autoCollapsedRef = useRef(false)

  useEffect(() => {
    if (pathname) {
      setMobileOpen(false)
    }
  }, [pathname])

  useEffect(() => {
    if (isDesktop && mobileOpen) {
      setMobileOpen(false)
    }
  }, [isDesktop, mobileOpen])

  // Auto-collapse sidebar when entering /clusters/[id] pages
  useEffect(() => {
    if (!isDesktop) return

    const isClusterDetail = CLUSTER_DETAIL_RE.test(pathname ?? '')

    if (isClusterDetail && !autoCollapsedRef.current) {
      // Save current state and auto-collapse
      prevCollapsedRef.current = collapsed
      autoCollapsedRef.current = true
      setCollapsed(true)
    } else if (!isClusterDetail && autoCollapsedRef.current) {
      // Restore previous state
      autoCollapsedRef.current = false
      setCollapsed(prevCollapsedRef.current)
    }
  }, [pathname, isDesktop]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthGuard>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--color-accent)] focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <TopBar />

      {/* Mobile hamburger */}
      {!isDesktop && (
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="fixed top-3.5 left-3 z-50 flex items-center justify-center h-11 w-11 rounded-lg hover:bg-white/[0.06] transition-colors"
        >
          <Menu className="h-5 w-5 text-[var(--color-text-muted)]" />
        </button>
      )}

      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        isDesktop={isDesktop}
      />
      <main
        id="main"
        className={`pt-14 min-h-screen overflow-x-clip transition-all duration-200 ${
          isDesktop ? (collapsed ? 'ml-12' : 'ml-48') : 'ml-0'
        }`}
      >
        <PresenceBar />
        <div
          key={pathname}
          className="p-3 sm:p-6 max-w-[1400px] w-full max-w-[100vw] overflow-x-hidden bg-dot-grid min-h-full"
        >
          {children}
        </div>
      </main>
    </AuthGuard>
  )
}
