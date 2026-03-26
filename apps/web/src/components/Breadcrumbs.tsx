'use client'

import { ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PATH_LABELS: Record<string, string> = {
  '': 'Dashboard',
  clusters: 'Clusters',
  dashboards: 'Dashboards',
  events: 'Events',
  logs: 'Logs',
  alerts: 'Alerts',
  settings: 'Settings',
  health: 'Health',
  'system-health': 'Health',
  features: 'Feature Flags',
  'feature-flags': 'Feature Flags',
  webhooks: 'Webhooks',
  users: 'Users',
  audit: 'Audit Log',
  deployments: 'Deployments',
  teams: 'Teams',
  permissions: 'Permissions',
  ai: 'AI Assistant',
  // Cluster tabs
  nodes: 'Nodes',
  pods: 'Pods',
  services: 'Services',
  namespaces: 'Namespaces',
  metrics: 'Metrics',
  autoscaling: 'Autoscaling',
  overview: 'Overview',
}

function formatSegmentLabel(segment: string, segmentLabels?: Record<string, string>) {
  // Check caller-supplied override first (e.g. cluster name for UUID segments)
  if (segmentLabels?.[segment]) return segmentLabels[segment]
  const known = PATH_LABELS[segment]
  if (known) return known
  if (segment.length > 24) return `${segment.slice(0, 8)}…${segment.slice(-6)}`
  return segment
}

/**
 * Renders a breadcrumb trail based on the current URL pathname.
 *
 * @param segmentLabels  Optional map of URL segment → display label.
 *                       Useful for dynamic segments like cluster IDs where
 *                       the page already has the human-readable name.
 *                       Example: `{ 'abc-123': 'live-minikube' }`
 */
export function Breadcrumbs({ segmentLabels }: { segmentLabels?: Record<string, string> } = {}) {
  const pathname = usePathname()
  if (!pathname || pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = [{ label: 'Dashboard', href: '/' }]

  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    crumbs.push({ label: formatSegmentLabel(segment, segmentLabels), href: currentPath })
  }

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-mono">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--color-text-dim)]" />}
            {isLast ? (
              <span
                className="max-w-[min(48vw,20rem)] truncate text-[var(--color-text-secondary)]"
                title={crumb.label}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)]"
                title={crumb.label}
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
