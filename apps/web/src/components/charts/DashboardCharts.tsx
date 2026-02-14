'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { CHART_HEIGHT, METRICS_GC_TIME, METRICS_STALE_TIME, type TimeRange } from './chart-theme'
import { ClusterHealthChart } from './ClusterHealthChart'
import { ResourceUsageChart } from './ResourceUsageChart'
import { RequestRateChart } from './RequestRateChart'
import { UptimeChart } from './UptimeChart'
import { AlertsTimelineChart } from './AlertsTimelineChart'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

export function DashboardCharts() {
  const [range, setRange] = useState<TimeRange>('24h')

  const queryOpts = {
    staleTime: METRICS_STALE_TIME,
    gcTime: METRICS_GC_TIME,
    refetchOnWindowFocus: true,
  } as const

  const health = trpc.metrics.clusterHealth.useQuery({ range }, queryOpts)
  const resources = trpc.metrics.resourceUsage.useQuery({ range }, queryOpts)
  const requests = trpc.metrics.requestRates.useQuery({ range }, queryOpts)
  const uptime = trpc.metrics.uptimeHistory.useQuery({ range }, queryOpts)
  const alerts = trpc.metrics.alertsTimeline.useQuery({ range }, queryOpts)

  return (
    <section className="space-y-6" aria-label="Metrics Dashboard">
      {/* Time Range Selector */}
      <nav className="flex items-center gap-2" aria-label="Time range selector">
        {TIME_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            aria-pressed={range === opt.value}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              range === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </nav>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Cluster Health" loading={health.isLoading} error={health.error?.message}>
          {health.data && <ClusterHealthChart data={health.data} range={range} />}
        </ChartCard>

        <ChartCard title="Resource Usage" loading={resources.isLoading} error={resources.error?.message}>
          {resources.data && <ResourceUsageChart data={resources.data} range={range} />}
        </ChartCard>

        <ChartCard title="Request Rates" loading={requests.isLoading} error={requests.error?.message}>
          {requests.data && <RequestRateChart data={requests.data} range={range} />}
        </ChartCard>

        <ChartCard title="Uptime by Cluster" loading={uptime.isLoading} error={uptime.error?.message}>
          {uptime.data && <UptimeChart data={uptime.data} />}
        </ChartCard>

        <ChartCard
          title="Alerts Timeline"
          loading={alerts.isLoading}
          error={alerts.error?.message}
          className="lg:col-span-2"
        >
          {alerts.data && <AlertsTimelineChart data={alerts.data} range={range} />}
        </ChartCard>
      </div>
    </section>
  )
}

interface ChartCardProps {
  title: string
  loading: boolean
  error?: string
  className?: string
  children: React.ReactNode
}

function ChartCard({ title, loading, error, className, children }: ChartCardProps) {
  return (
    <article className={`rounded-xl border bg-card p-4 shadow-sm ${className ?? ''}`} aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">{title}</h3>
      {loading ? (
        <div className={`flex items-center justify-center`} style={{ height: CHART_HEIGHT }}>
          <div
            className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"
            role="status"
            aria-label="Loading chart data"
          />
        </div>
      ) : error ? (
        <div
          className="flex items-center justify-center text-sm text-destructive"
          style={{ height: CHART_HEIGHT }}
          role="alert"
        >
          Failed to load data: {error}
        </div>
      ) : (
        children
      )}
    </article>
  )
}
