'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthGuard } from './AuthGuard'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  return (
    <AuthGuard>
      <TopBar />

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        className="fixed top-3.5 left-3 z-50 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-white/[0.06] transition-colors md:hidden"
      >
        <Menu className="h-5 w-5 text-[var(--color-text-muted)]" />
      </button>

      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main
        className={`pt-14 min-h-screen overflow-x-clip transition-all duration-200 ${collapsed ? 'md:ml-12' : 'md:ml-48'}`}
      >
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
