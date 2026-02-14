'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <TopBar />

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
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
        className={`pt-14 min-h-screen transition-all duration-200 ${collapsed ? 'md:ml-12' : 'md:ml-48'}`}
      >
        <div className="p-6 max-w-[1400px] bg-dot-grid min-h-full">{children}</div>
      </main>
    </>
  )
}
