'use client'

import { ConstellationLoader } from '@/components/animations/ConstellationLoader'

/** Constellation loader that replaces the old shimmer skeleton layout */
export function ResourceLoadingSkeleton({ label }: { label?: string }) {
  return <ConstellationLoader label={label ?? 'Loading resources...'} />
}

/** Constellation loader for table-style pages (Nodes, etc.) — rows/cols props kept for compatibility */
export function TableLoadingSkeleton({ label }: { rows?: number; cols?: number; label?: string }) {
  return <ConstellationLoader label={label ?? 'Loading resources...'} />
}

/** Constellation loader for section-based pages (RBAC, CRDs, etc.) — sections prop kept for compatibility */
export function SectionLoadingSkeleton({ label }: { sections?: number; label?: string }) {
  return <ConstellationLoader label={label ?? 'Loading resources...'} />
}
