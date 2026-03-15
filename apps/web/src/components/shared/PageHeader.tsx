'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  /** Breadcrumb items rendered above the title */
  breadcrumb?: BreadcrumbItem[]
  /** Actions / buttons rendered on the right */
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="opacity-40">/</span>}
              {itemotion.href ? (
                <a
                  href={itemotion.href}
                  className="hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {itemotion.label}
                </a>
              ) : (
                <span className={i === breadcrumb.length - 1 ? 'text-[var(--color-text-secondary)]' : ''}>
                  {itemotion.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] truncate">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  )
}
