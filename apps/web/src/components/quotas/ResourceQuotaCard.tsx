'use client'

import { Cpu, HardDrive, Box, Database } from 'lucide-react'
import { ResourceBar } from '@/components/expandable'
import type { ReactNode } from 'react'

/** Parse K8s resource values to a numeric form for display */
function parseResourceValue(value: string, metric: string): { num: number; unit: string } {
  // CPU: millicores or cores
  if (metric === 'cpu' || metric.startsWith('limits.cpu') || metric.startsWith('requests.cpu')) {
    if (value.endsWith('m')) {
      return { num: Number.parseInt(value, 10) || 0, unit: 'm' }
    }
    const cores = Number.parseFloat(value)
    return { num: Number.isNaN(cores) ? 0 : Math.round(cores * 1000), unit: 'm' }
  }

  // Memory: Ki, Mi, Gi, or bytes
  if (
    metric === 'memory' ||
    metric.startsWith('limits.memory') ||
    metric.startsWith('requests.memory')
  ) {
    if (value.endsWith('Gi')) {
      return { num: Math.round((Number.parseFloat(value) || 0) * 1024), unit: 'Mi' }
    }
    if (value.endsWith('Mi')) {
      return { num: Number.parseInt(value, 10) || 0, unit: 'Mi' }
    }
    if (value.endsWith('Ki')) {
      return { num: Math.round((Number.parseInt(value, 10) || 0) / 1024), unit: 'Mi' }
    }
    const bytes = Number.parseInt(value, 10)
    if (!Number.isNaN(bytes)) {
      return { num: Math.round(bytes / (1024 * 1024)), unit: 'Mi' }
    }
    return { num: 0, unit: 'Mi' }
  }

  // Numeric values (pods, services, etc.)
  return { num: Number.parseInt(value, 10) || 0, unit: '' }
}

/** Pick an appropriate icon for the metric */
function getMetricIcon(metric: string): ReactNode {
  if (metric.includes('cpu')) return <Cpu className="h-3.5 w-3.5" />
  if (metric.includes('memory')) return <HardDrive className="h-3.5 w-3.5" />
  if (metric.includes('persistentvolumeclaims') || metric.includes('storage'))
    return <Database className="h-3.5 w-3.5" />
  return <Box className="h-3.5 w-3.5" />
}

/** Format metric name for display */
function formatMetricName(metric: string): string {
  return metric
    .replace('limits.', 'Limit: ')
    .replace('requests.', 'Request: ')
    .replace('persistentvolumeclaims', 'PVCs')
    .replace('configmaps', 'ConfigMaps')
    .replace('replicationcontrollers', 'ReplicationControllers')
    .replace(/^[a-z]/, (ch) => ch.toUpperCase())
}

interface ResourceQuotaCardProps {
  quotaName: string
  hard: Record<string, string>
  used: Record<string, string>
}

export function ResourceQuotaCard({ quotaName, hard, used }: ResourceQuotaCardProps) {
  const metrics = Object.keys(hard).filter((key) => hard[key])

  if (metrics.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <p className="text-[12px] font-mono font-bold text-[var(--color-text-primary)] mb-2">
          {quotaName}
        </p>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          No resource quotas configured for this namespace.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
      <p className="text-[12px] font-mono font-bold text-[var(--color-text-primary)]">
        {quotaName}
      </p>
      <div className="space-y-2.5">
        {metrics.map((metric) => {
          const hardVal = parseResourceValue(hard[metric] ?? '0', metric)
          const usedVal = parseResourceValue(used[metric] ?? '0', metric)

          return (
            <ResourceBar
              key={metric}
              label={formatMetricName(metric)}
              icon={getMetricIcon(metric)}
              used={usedVal.num}
              total={hardVal.num}
              unit={hardVal.unit || undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
