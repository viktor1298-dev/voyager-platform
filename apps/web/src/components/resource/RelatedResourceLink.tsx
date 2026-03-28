'use client'

import type { ReactNode } from 'react'
import { useResourceNavigation } from './CrossResourceNav'

interface RelatedResourceLinkProps {
  tab: string
  resourceKey: string
  label: string
  icon?: ReactNode
}

/**
 * Clickable hyperlink that navigates to a resource on another cluster tab.
 * Uses useResourceNavigation to build the URL with a highlight query param.
 */
export function RelatedResourceLink({ tab, resourceKey, label, icon }: RelatedResourceLinkProps) {
  const { navigateToResource } = useResourceNavigation()

  return (
    <button
      type="button"
      onClick={() => navigateToResource(tab, resourceKey)}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 hover:underline transition-colors cursor-pointer"
    >
      {icon}
      {label}
    </button>
  )
}
