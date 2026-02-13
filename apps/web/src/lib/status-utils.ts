/** Returns a CSS color variable string for cluster status */
export function getStatusColor(status: string): string {
  if (status === 'healthy') return 'var(--color-status-active)'
  if (status === 'warning') return 'var(--color-status-warning)'
  return 'var(--color-status-error)'
}

/** Returns a Tailwind bg class for cluster status dot */
export function getStatusDotClass(status: string): string {
  if (status === 'healthy') return 'bg-[var(--color-status-active)]'
  if (status === 'warning') return 'bg-[var(--color-status-warning)]'
  return 'bg-[var(--color-status-error)]'
}

/** Returns a Tailwind bg class for node status dot */
export function nodeStatusColor(status: string): string {
  if (status === 'Ready') return 'bg-[var(--color-status-active)]'
  if (status === 'NotReady') return 'bg-[var(--color-status-error)]'
  return 'bg-[var(--color-status-idle)]'
}

/** Returns a CSS color variable string for event severity */
export function severityColor(kind: string): string {
  if (kind === 'Warning') return 'var(--color-status-warning)'
  if (kind === 'Error') return 'var(--color-status-error)'
  return 'var(--color-accent)'
}
