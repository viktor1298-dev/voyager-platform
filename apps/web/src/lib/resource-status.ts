import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CircleCheck,
  CircleCheckBig,
  HelpCircle,
  Loader2,
  MinusCircle,
  XCircle,
  Zap,
} from 'lucide-react'

export type ResourceStatusCategory =
  | 'healthy'
  | 'completed'
  | 'transitional'
  | 'draining'
  | 'error'
  | 'critical'
  | 'fatal'
  | 'unknown'

export interface ResourceStatusConfig {
  category: ResourceStatusCategory
  colorVar: string
  Icon: LucideIcon
  animation: 'none' | 'spin' | 'glow-critical' | 'glow-fatal'
}

/** Category visual config — references CSS variables only, no hardcoded colors */
const CATEGORY_CONFIG: Record<ResourceStatusCategory, Omit<ResourceStatusConfig, 'category'>> = {
  healthy: {
    colorVar: 'var(--color-status-active)',
    Icon: CircleCheck,
    animation: 'none',
  },
  completed: {
    colorVar: 'var(--color-status-healthy)',
    Icon: CircleCheckBig,
    animation: 'none',
  },
  transitional: {
    colorVar: 'var(--color-status-warning)',
    Icon: Loader2,
    animation: 'spin',
  },
  draining: {
    colorVar: 'var(--color-status-info)',
    Icon: MinusCircle,
    animation: 'spin',
  },
  error: {
    colorVar: 'var(--color-status-error)',
    Icon: XCircle,
    animation: 'none',
  },
  critical: {
    colorVar: 'var(--color-status-error)',
    Icon: AlertTriangle,
    animation: 'glow-critical',
  },
  fatal: {
    colorVar: 'var(--color-status-error)',
    Icon: Zap,
    animation: 'glow-fatal',
  },
  unknown: {
    colorVar: 'var(--color-status-idle)',
    Icon: HelpCircle,
    animation: 'none',
  },
}

/** Case-insensitive exact-match lookup: lowercase status string → category */
const STATUS_LOOKUP: Record<string, ResourceStatusCategory> = {
  // Healthy
  running: 'healthy',
  ready: 'healthy',
  active: 'healthy',
  bound: 'healthy',
  // Completed
  succeeded: 'completed',
  complete: 'completed',
  // Transitional
  pending: 'transitional',
  scaling: 'transitional',
  // Draining
  terminating: 'draining',
  suspended: 'draining',
  // Error
  failed: 'error',
  notready: 'error',
  lost: 'error',
  // Critical
  crashloopbackoff: 'critical',
  // Fatal
  oomkilled: 'fatal',
  // Unknown handled by fallback
}

/** Resolve any raw K8s status string to its category + visual config */
export function resolveResourceStatus(raw: string | null | undefined): ResourceStatusConfig {
  const key = (raw ?? '').toLowerCase()
  const category = STATUS_LOOKUP[key] ?? 'unknown'
  return { category, ...CATEGORY_CONFIG[category] }
}
