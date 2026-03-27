'use client'

import { useState } from 'react'
import { SlideIn } from '@/components/animations'
import { trpc } from '@/lib/trpc'
import { CHART_HEIGHT, METRICS_GC_TIME, METRICS_STALE_TIME, type TimeRange } from './chart-theme'
import { ClusterHealthChart } from './ClusterHealthChart'
import { ResourceUsageChart } from './ResourceUsageChart'
import { UptimeChart } from './UptimeChart'
import { AlertsTimelineChart } from './AlertsTimelineChart'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: 'Last 24h' },
  { value: '2d', label: 'Last 2 days' },
  { value: '7d', label: 'Last 7 days' },
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
  const uptime = trpc.metrics.uptimeHistory.useQuery({ range }, queryOpts)
  const alerts = trpc.metrics.alertsTimeline.useQuery({ range }, queryOpts)

  const healthData = (health.data ?? []).map((p) => ({
    timestamp: p.timestamp,
    healthy: Number(p.healthy ?? 0),
    degraded: Number(p.degraded ?? 0),
    offline: Number(p.offline ?? 0),
  }))
  const resourceData = (resources.data ?? []).map((p) => ({
    timestamp: p.timestamp,
    cpu: Number(p.cpu ?? 0),
    memory: Number(p.memory ?? 0),
  }))

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
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </nav>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SlideIn delay={0}>
          <ChartCard
            title="Cluster Health"
            loading={health.isLoading}
            error={health.error?.message}
          >
            {health.data && <ClusterHealthChart data={healthData} range={range} />}
          </ChartCard>
        </SlideIn>

        <SlideIn delay={0.05}>
          <ChartCard
            title="Resource Usage"
            loading={resources.isLoading}
            error={resources.error?.message}
          >
            {resources.data && <ResourceUsageChart data={resourceData} range={range} />}
          </ChartCard>
        </SlideIn>

        <SlideIn delay={0.1}>
          <ChartCard title="Request Rates" loading={false}>
            <div
              className="flex items-center justify-center text-sm text-muted-foreground"
              style={{ height: CHART_HEIGHT }}
            >
              🚧 Coming Soon — Real request rate metrics
            </div>
          </ChartCard>
        </SlideIn>

        <SlideIn delay={0.15}>
          <ChartCard
            title="Uptime by Cluster"
            loading={uptime.isLoading}
            error={uptime.error?.message}
          >
            {uptime.data && <UptimeChart data={uptime.data} />}
          </ChartCard>
        </SlideIn>

        <SlideIn delay={0.2} className="lg:col-span-2">
          <ChartCard
            title="Alerts Timeline"
            loading={alerts.isLoading}
            error={alerts.error?.message}
          >
            {alerts.data && <AlertsTimelineChart data={alerts.data} range={range} />}
          </ChartCard>
        </SlideIn>
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
    <article className="rounded-xl border bg-card p-4 shadow-sm" aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">{title}</h3>
      {loading ? (
        <div
          className="space-y-2 p-2"
          style={{ height: CHART_HEIGHT }}
          role="status"
          aria-label="Loading chart data"
        >
          <div className="skeleton-shimmer h-4 w-32 rounded" />
          <div className="skeleton-shimmer h-full w-full rounded-lg" />
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
