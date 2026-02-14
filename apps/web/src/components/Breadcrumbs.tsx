'use client'

import { ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PATH_LABELS: Record<string, string> = {
  '': 'Dashboard',
  clusters: 'Clusters',
  events: 'Events',
  logs: 'Logs',
  settings: 'Settings',
}

export function Breadcrumbs() {
  const pathname = usePathname()
  if (!pathname || pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = [{ label: 'Dashboard', href: '/' }]

  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    const label = PATH_LABELS[segment] ?? segment
    crumbs.push({ label, href: currentPath })
  }

  return (
    <nav className="flex items-center gap-1.5 mb-4 text-[12px] font-mono">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--color-text-dim)]" />}
            {isLast ? (
              <span className="text-[var(--color-text-secondary)]">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                {i === 0 ? <Home className="h-3 w-3" /> : crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
