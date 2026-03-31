// migrate import removed — schema handled by Helm sql/init.sql on postgres startup

import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { RATE_LIMIT_BYPASS_PATHS } from '@voyager/config'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { fastifyTRPCOpenApiPlugin } from 'trpc-to-openapi'
import { startAlertEvaluator, stopAlertEvaluator } from './jobs/alert-evaluator.js'
import { startDeploySmokeTest, stopDeploySmokeTest } from './jobs/deploy-smoke-test.js'
import {
  startMetricsHistoryCollector,
  stopMetricsHistoryCollector,
} from './jobs/metrics-history-collector.js'
import { metricsStreamJob } from './jobs/metrics-stream-job.js'
import { closeDatabase } from '@voyager/db'
import { auth } from './lib/auth.js'
import { mapAuthRouteErrorToBody, mapAuthRouteErrorToStatus } from './lib/auth-error-mapping.js'
import { shouldRequireAuth, UNAUTHORIZED_RESPONSE } from './lib/auth-guard.js'
import { closeRedis } from './lib/cache.js'
import { resolveExternalRequestUrl } from './lib/auth-request.js'
import { ensureAdminUser } from './lib/ensure-admin-user.js'
import { stopPresenceSweep } from './lib/presence.js'
import { ensureViewerUser } from './lib/ensure-viewer-user.js'
import { watchManager } from './lib/watch-manager.js'
import { startWatchDbWriter, stopWatchDbWriter } from './lib/watch-db-writer.js'
import { generateOpenApiSpec } from './lib/openapi.js'
import { captureException, flushSentry, initSentry } from './lib/sentry.js'
import { shutdownTelemetry } from './lib/telemetry.js'
import { type AppRouter, appRouter } from './routers/index.js'
import { registerAiStreamRoute } from './routes/ai-stream.js'
import { registerMcpRoute } from './routes/mcp.js'
import { registerLogStreamRoute } from './routes/log-stream.js'
import { registerMetricsStreamRoute } from './routes/metrics-stream.js'
import { registerPodTerminalRoute } from './routes/pod-terminal.js'
import { registerResourceStreamRoute } from './routes/resource-stream.js'
import { registerWatchHealthRoute } from './routes/watch-health.js'
import { drainConnections } from './lib/connection-tracker.js'
import { createContext } from './trpc.js'

// Validate CLUSTER_CRED_ENCRYPTION_KEY (64-char hex = 32 bytes AES-256 key)
const CLUSTER_CRED_ENCRYPTION_KEY = process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
if (!/^[0-9a-fA-F]{64}$/.test(CLUSTER_CRED_ENCRYPTION_KEY)) {
  console.warn(
    '⚠️  CLUSTER_CRED_ENCRYPTION_KEY is missing or invalid (expected 64-char hex string). Credential encryption will fail.',
  )
}
if (CLUSTER_CRED_ENCRYPTION_KEY === '0'.repeat(64)) {
  throw new Error(
    'CLUSTER_CRED_ENCRYPTION_KEY must not be all zeros — generate with: openssl rand -hex 32',
  )
}

if (process.env.NODE_ENV === 'production') {
  if (process.env.JWT_SECRET === 'change-me-in-production') {
    throw new Error('JWT_SECRET must be changed in production')
  }
  if (process.env.ADMIN_PASSWORD === 'admin123') {
    throw new Error('ADMIN_PASSWORD must be changed in production')
  }
}

// Initialize Sentry early
initSentry()

const app = Fastify({ logger: true })

app.register(compress, { global: true })

const DEFAULT_RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX || '200', 10)
const DEFAULT_RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_TIME_WINDOW || '1 minute'
app.register(rateLimit, {
  max: DEFAULT_RATE_LIMIT_MAX,
  timeWindow: DEFAULT_RATE_LIMIT_WINDOW,
  keyGenerator: (req) => req.ip,
  allowList: (request) => RATE_LIMIT_BYPASS_PATHS.some((path) => request.url.startsWith(path)),
})

// ALLOWED_ORIGINS: comma-separated list of allowed origins for CORS.
// Falls back to localhost:3000 for local development.
// In production, set to the actual frontend domain(s).
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
})

// WebSocket support — must be registered before WebSocket routes
await app.register(websocket)

app.addHook('onRequest', async (request, reply) => {
  if (!shouldRequireAuth(request.method, request.url)) {
    return
  }

  // Skip auth guard for tRPC routes — tRPC handles its own auth via
  // protectedProcedure/adminProcedure in createContext(). Doubling up causes:
  //   1. Redundant getSession() DB calls on every request (perf hit)
  //   2. Non-tRPC-formatted 401 responses that break the tRPC client error handler
  //   3. Race conditions under concurrent background polling (multiple parallel getSession calls)
  // Also check /api/trpc/* — requests from ingress arrive with /api prefix
  if (request.url.startsWith('/trpc') || request.url.startsWith('/api/trpc')) {
    return
  }

  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value) {
      headers.append(key, String(value))
    }
  }

  const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
  if (!sessionResult?.session || !sessionResult.user) {
    reply.code(401).send(UNAUTHORIZED_RESPONSE)
    return reply
  }
})

app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
})

// Fix SSE Content-Type for tRPC subscription routes (presence.subscribe, podEvents, etc.)
// The tRPC Fastify adapter may omit Content-Type or set text/plain for SSE streams.
// BUG-002 fix: apply to any subscription route that doesn't already declare text/event-stream.
app.addHook('onSend', async (request, reply, payload) => {
  if (
    request.url.startsWith('/trpc/') &&
    /\.subscribe(\?|$)/.test(request.url) &&
    !reply.getHeader('content-type')?.toString().startsWith('text/event-stream')
  ) {
    reply.header('content-type', 'text/event-stream; charset=utf-8')
    reply.header('cache-control', 'no-cache, no-transform')
    reply.header('connection', 'keep-alive')
  }
  return payload
})

app.register(fastifyTRPCOpenApiPlugin, {
  basePath: '/api',
  router: appRouter,
  createContext,
})

// OpenAPI + Swagger UI (encapsulated so failures don't crash API bootstrap)
app.register(async (instance) => {
  try {
    const spec = generateOpenApiSpec()
    instance.log.info(`[OpenAPI] Generated spec with ${Object.keys(spec.paths ?? {}).length} paths`)

    await instance.register(swagger, {
      mode: 'static',
      specification: { document: spec as never },
    })

    await instance.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    })

    instance.get('/openapi.json', async (_request, reply) => {
      reply.send(spec)
    })
  } catch (error) {
    instance.log.warn({ err: error }, '[OpenAPI] Swagger registration failed; /docs unavailable')
  }
})

// Better-Auth handler — all auth routes via /api/auth/*
const handleAuthRoute = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const url = resolveExternalRequestUrl(request.url, {
      headers: request.headers,
      trustedProtocol: request.protocol,
      trustedHost: request.host,
      trustForwardedHeaders: Array.isArray(request.ips) && request.ips.length > 0,
    })
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, value.toString())
    }
    const req = new Request(url.toString(), {
      method: request.method,
      headers,
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    })
    const response = await auth.handler(req)
    reply.status(response.status)

    // Forward all response headers except Set-Cookie (handled separately below).
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') continue
      reply.header(key, value)
    }

    // Forward Set-Cookie headers individually via getSetCookie().
    // Better Auth sign-out emits multiple Set-Cookie values (one per
    // cookie variant: session_token, __Secure-*, __Host-*).
    // Headers.entries() in some environments joins them into a single
    // comma-separated string which browsers parse incorrectly.
    // getSetCookie() guarantees each cookie is forwarded as a distinct
    // Set-Cookie header so the browser clears all session cookies on logout.
    const setCookies = response.headers.getSetCookie?.()
    if (setCookies && setCookies.length > 0) {
      for (const cookie of setCookies) {
        reply.header('set-cookie', cookie)
      }
    }

    reply.send(response.body ? await response.text() : null)
  } catch (error) {
    app.log.error(error, 'Authentication Error')
    const status = mapAuthRouteErrorToStatus(request.url, error)
    const body = mapAuthRouteErrorToBody(request.url, error)
    reply.status(status).send(body)
  }
}

app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/sign-in/*',
  config: {
    rateLimit: false,
  },
  handler: handleAuthRoute,
})

app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/get-session',
  config: {
    rateLimit: false,
  },
  handler: handleAuthRoute,
})

app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  config: {
    rateLimit: false,
  },
  handler: handleAuthRoute,
})

// Capture unhandled Fastify errors to Sentry
app.setErrorHandler((error, _request, reply) => {
  captureException(error)
  const errorWithStatus = error as { message?: string; statusCode?: number }
  reply.status(errorWithStatus.statusCode ?? 500).send({
    error: errorWithStatus.message || 'Internal Server Error',
    statusCode: errorWithStatus.statusCode ?? 500,
  })
})

await registerAiStreamRoute(app)
await registerLogStreamRoute(app)
await registerMcpRoute(app)
await registerMetricsStreamRoute(app)
await registerPodTerminalRoute(app)
await registerResourceStreamRoute(app)
await registerWatchHealthRoute(app)

app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))

/** Public health endpoint — intentionally unauthenticated. Returns collector running status. */
app.get('/health/metrics-collector', { config: { rateLimit: false } }, async () => {
  const { getCollectorStatus } = await import('./jobs/metrics-history-collector.js')
  return getCollectorStatus()
})

const start = async () => {
  try {
    // Schema is initialized by Helm sql/init.sql on postgres startup (no migrate() needed)

    await ensureAdminUser({ allowLocalDevDefaults: false })
    await ensureViewerUser()

    const PORT = Number.parseInt(process.env.PORT || '4000', 10)
    const HOST = process.env.HOST || '0.0.0.0'
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 API server running on http://${HOST}:${PORT}`)

    const k8sEnabled = process.env.K8S_ENABLED !== 'false'

    // Initialize WatchManager (Lens-style live data pipeline)
    // Watches are started on-demand when SSE clients subscribe
    console.log('[server] WatchManager ready (watches start on first subscriber)')

    // Start watch-db-writer — persists watch data to PostgreSQL (replaces legacy sync jobs)
    startWatchDbWriter()
    console.log('[server] WatchDbWriter started')

    // Start remaining background jobs (alert evaluator, metrics collector)
    startAlertEvaluator()
    startMetricsHistoryCollector()

    if (k8sEnabled) {
      startDeploySmokeTest()
      app.log.info(
        'Background jobs started (watch-manager, watch-db-writer, alert-evaluator, metrics, deploy-smoke-test)',
      )
    } else {
      app.log.info(
        'K8s watchers disabled (K8S_ENABLED=false) — WatchManager and jobs running for registered clusters',
      )
    }

    const signals = ['SIGTERM', 'SIGINT'] as const
    for (const signal of signals) {
      process.on(signal, async () => {
        const forceExitTimer = setTimeout(() => {
          console.error('[shutdown] Force exit after 25s timeout')
          process.exit(1)
        }, 25_000)
        forceExitTimer.unref()

        app.log.info(`${signal} received, shutting down gracefully`)
        try {
          drainConnections()
          watchManager.stopAll()
          stopWatchDbWriter()
          stopAlertEvaluator()
          stopMetricsHistoryCollector()
          metricsStreamJob.stopAll()
          if (k8sEnabled) {
            stopDeploySmokeTest()
          }
          stopPresenceSweep()
          await closeDatabase()
          await closeRedis()
          await flushSentry()
          await shutdownTelemetry()
          await app.close()
        } catch (shutdownErr) {
          app.log.error(shutdownErr, 'Error during graceful shutdown')
        }
        process.exit(0)
      })
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Global error handlers — prevent unhandled errors from silently crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason)
  captureException(reason instanceof Error ? reason : new Error(String(reason)))
})

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
  captureException(err)
  // Give Sentry time to flush, then exit
  setTimeout(() => process.exit(1), 2000)
})

start()
