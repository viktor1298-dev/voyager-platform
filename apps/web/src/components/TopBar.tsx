'use client'

import { Search } from 'lucide-react'
import { NotificationsPanel } from './NotificationsPanel'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/clusters': 'Clusters',
  '/alerts': 'Alerts',
  '/events': 'Events',
  '/logs': 'Logs',
  '/settings': 'Settings',
}

export function TopBar() {
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] ?? PAGE_TITLES[`/${pathname.split('/')[1]}`] ?? ''

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-3 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 backdrop-blur-lg">
      {/* Left — Logo + Page Title */}
      <div className="flex items-center gap-2.5 group">
        <img
          src="/logo-mark.svg"
          alt="Voyager"
          className="h-8 w-8 object-contain"
          aria-hidden="true"
        />
        <span className="text-[13px] font-bold tracking-widest text-[var(--color-text-secondary)] transition-colors duration-200 group-hover:text-[var(--color-text-primary)]">
          VOYAGER
        </span>
        {pageTitle && (
          <>
            <span className="hidden sm:block text-[var(--color-border)] text-xs">/</span>
            <span className="hidden sm:block text-[13px] font-semibold text-[var(--color-text-primary)]">
              {pageTitle}
            </span>
          </>
        )}
      </div>

      {/* Right — Controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          }
          className="hidden sm:flex items-center gap-2 px-2.5 h-8 rounded-lg border border-transparent text-[var(--color-text-muted)] transition-all duration-150 hover:border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)]"
          title="Command Palette (⌘K)"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="text-[11px] font-medium font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 px-1.5 py-0.5 rounded transition-colors duration-150">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
        <NotificationsPanel />
        <UserMenu />
      </div>
    </header>
  )
}
