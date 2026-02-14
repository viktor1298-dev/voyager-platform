'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import type { TimeRange } from './chart-theme'
import { ClusterHealthChart } from './ClusterHealthChart'
import { ResourceUsageChart } from './ResourceUsageChart'
import { RequestRateChart } from './RequestRateChart'
import { UptimeChart } from './UptimeChart'
import { AlertsTimelineChart } from './AlertsTimelineChart'

const METRICS_STALE_TIME = 60_000
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

export function DashboardCharts() {
  const [range, setRange] = useState<TimeRange>('24h')

  const queryOpts = { staleTime: METRICS_STALE_TIME, refetchOnWindowFocus: true } as const

  const health = trpc.metrics.clusterHealth.useQuery({ range }, queryOpts)
  const resources = trpc.metrics.resourceUsage.useQuery({ range }, queryOpts)
  const requests = trpc.metrics.requestRates.useQuery({ range }, queryOpts)
  const uptime = trpc.metrics.uptimeHistory.useQuery({ range }, queryOpts)
  const alerts = trpc.metrics.alertsTimeline.useQuery({ range }, queryOpts)

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center gap-2">
        {TIME_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              range === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Cluster Health" loading={health.isLoading}>
          {health.data && <ClusterHealthChart data={health.data} range={range} />}
        </ChartCard>

        <ChartCard title="Resource Usage" loading={resources.isLoading}>
          {resources.data && <ResourceUsageChart data={resources.data} range={range} />}
        </ChartCard>

        <ChartCard title="Request Rates" loading={requests.isLoading}>
          {requests.data && <RequestRateChart data={requests.data} range={range} />}
        </ChartCard>

        <ChartCard title="Uptime by Cluster" loading={uptime.isLoading}>
          {uptime.data && <UptimeChart data={uptime.data} />}
        </ChartCard>

        <ChartCard title="Alerts Timeline" loading={alerts.isLoading} className="lg:col-span-2">
          {alerts.data && <AlertsTimelineChart data={alerts.data} range={range} />}
        </ChartCard>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  loading,
  className,
  children,
}: {
  title: string
  loading: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${className ?? ''}`}>
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">{title}</h3>
      {loading ? (
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}
