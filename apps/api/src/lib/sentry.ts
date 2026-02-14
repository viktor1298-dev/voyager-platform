import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

const DSN = process.env.SENTRY_DSN

export function initSentry(): void {
  if (!DSN) return

  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: `voyager-api@${process.env.npm_package_version || '0.0.0'}`,
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()],
  })
}

export function captureException(error: unknown): void {
  if (!DSN) return
  Sentry.captureException(error)
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!DSN) return
  await Sentry.flush(timeoutMs)
}

export { Sentry }
