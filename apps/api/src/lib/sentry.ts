import { createRequire } from 'node:module'
import * as Sentry from '@sentry/node'

const DSN = process.env.SENTRY_DSN
const require = createRequire(import.meta.url)

function getProfilingIntegration(): unknown {
  if (process.env.SENTRY_ENABLE_PROFILING !== 'true') return undefined

  try {
    const moduleName = '@sentry/profiling-node'
    const sentryProfiling = require(moduleName) as {
      nodeProfilingIntegration: () => unknown
    }

    return sentryProfiling.nodeProfilingIntegration()
  } catch (error) {
    console.warn('Sentry profiling integration is unavailable, continuing without profiling', error)
    return undefined
  }
}

export function initSentry(): void {
  if (!DSN) return

  const profilingIntegration = getProfilingIntegration()

  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: `voyager-api@${process.env.npm_package_version || '0.0.0'}`,
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    ...(profilingIntegration
      ? {
          profilesSampleRate: Number.parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
          integrations: [profilingIntegration] as never,
        }
      : {}),
  } as never)
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
