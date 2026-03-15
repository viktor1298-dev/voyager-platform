'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'

const TABS = [
  { label: 'General', href: '/settings' },
  { label: 'Users', href: '/settings/users' },
  { label: 'Teams', href: '/settings/teams' },
  { label: 'Permissions', href: '/settings/permissions' },
  { label: 'Webhooks', href: '/settings/webhooks' },
  { label: 'Feature Flags', href: '/settings/features' },
  { label: 'Audit Log', href: '/settings/audit' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Settings
          </h1>
          <p className="text-[12px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
            Platform configuration &amp; administration
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-[var(--color-border)] mb-6">
          <nav
            className="flex gap-1 overflow-x-auto scrollbar-none -mb-px"
            aria-label="Settings tabs"
            data-testid="settings-tabs"
          >
            {TABS.map((tab) => {
              const isActive =
                tab.href === '/settings'
                  ? pathname === '/settings'
                  : pathname.startsWith(tab.href)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={[
                    'whitespace-nowrap px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2',
                    isActive
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border)]',
                  ].join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {children}
      </PageTransition>
    </AppLayout>
  )
}
