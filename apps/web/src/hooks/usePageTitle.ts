'use client'

import { useEffect } from 'react'

const SUFFIX = 'Voyager Platform'

/**
 * DA2-003: Set dynamic page title for client components.
 * Uses the metadata template format: "PageTitle — Voyager Platform"
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX
  }, [title])
}
