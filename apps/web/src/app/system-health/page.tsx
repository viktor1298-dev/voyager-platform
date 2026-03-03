import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CheckCircle2, HeartPulse, ServerCrash } from 'lucide-react'

type SystemHealthResponse = {
  status?: string
  message?: string
  timestamp?: string
  uptime?: number
}

function getApiBaseUrl() {
  return process.env.API_URL || 'http://localhost:4000'
}

async function getSystemHealth(): Promise<SystemHealthResponse> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/health`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        status: 'error',
        message: `HTTP ${response.status}`,
      }
    }

    const data = (await response.json()) as SystemHealthResponse
    return data
  } catch {
    return {
      status: 'error',
      message: 'Unable to reach API',
    }
  }
}

export default async function HealthPage() {
  const health = await getSystemHealth()
  const normalized = (health.status ?? '').toLowerCase()
  const isHealthy = normalized === 'ok' || normalized === 'healthy'

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6 mt-2 flex items-center gap-3">
          <HeartPulse className="h-5 w-5 text-[var(--color-accent)]" />
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            System Health
          </h1>
        </div>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] p-6">
          <div className="mb-3 flex items-center gap-2">
            {isHealthy ? (
              <CheckCircle2 className="h-5 w-5 text-[var(--color-status-active)]" />
            ) : (
              <ServerCrash className="h-5 w-5 text-[var(--color-status-error)]" />
            )}
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              {isHealthy ? 'System Healthy' : 'System Unhealthy'}
            </h2>
          </div>

          <p className="text-sm text-[var(--color-text-secondary)]">
            API status:{' '}
            <span className="font-mono text-[var(--color-text-primary)]">
              {health.status ?? 'unknown'}
            </span>
          </p>

          {health.message ? (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">{health.message}</p>
          ) : null}

          {health.timestamp ? (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Checked at: {new Date(health.timestamp).toLocaleString()}
            </p>
          ) : null}
        </section>
      </PageTransition>
    </AppLayout>
  )
}
