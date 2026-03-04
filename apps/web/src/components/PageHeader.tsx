'use client'

import type { ReactNode } from 'react'
import { Breadcrumbs } from '@/components/Breadcrumbs'

interface PageHeaderProps {
  title: string
  breadcrumb?: Array<{ label: string; href?: string }>
  description?: string
  actions?: ReactNode
  icon?: ReactNode
}

export function PageHeader({ title, breadcrumb, description, actions, icon }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {icon && <div className="text-[var(--color-accent)]">{icon}</div>}
        <div>
          <Breadcrumbs items={breadcrumb ?? [{ label: title }]} />
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 mt-2 sm:mt-0">{actions}</div>}
    </div>
  )
}
