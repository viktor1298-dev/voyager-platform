import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { fastifyTRPCOpenApiPlugin } from 'trpc-to-openapi'
import { UNAUTHORIZED_RESPONSE, shouldRequireAuth } from './lib/auth-guard.js'
import { auth } from './lib/auth.js'
import { resolveExternalRequestUrl } from './lib/auth-request.js'
import { mapAuthRouteErrorToBody, mapAuthRouteErrorToStatus } from './lib/auth-error-mapping.js'
import { ensureAdminUser } from './lib/ensure-admin-user.js'
import { startMetricsPoller, startPodWatcher, stopAllWatchers } from './lib/k8s-watchers.js'
import { generateOpenApiSpec } from './lib/openapi.js'
import { captureException, flushSentry, initSentry } from './lib/sentry.js'
import { shutdownTelemetry } from './lib/telemetry.js'
import { type AppRouter, appRouter } from './routers/index.js'
import { registerAiStreamRoute } from './routes/ai-stream.js'
import { createContext } from './trpc.js'

// Initialize Sentry early
initSentry()

const app = Fastify({ logger: true })

app.register(compress, { global: true })

const DEFAULT_RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX || '200', 10)
const DEFAULT_RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_TIME_WINDOW || '1 minute'
const RATE_LIMIT_WHITELIST_PATHS = ['/api/auth/', '/health', '/system-health'] as const

app.register(rateLimit, {
  max: DEFAULT_RATE_LIMIT_MAX,
  timeWindow: DEFAULT_RATE_LIMIT_WINDOW,
  keyGenerator: (req) => req.ip,
  allowList: (request) => RATE_LIMIT_WHITELIST_PATHS.some((path) => request.url.startsWith(path)),
})

// ALLOWED_ORIGINS: comma-separated list of allowed origins for CORS.
// Falls back to localhost:3000 for local development.
// In production, set to the actual frontend domain(s).
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
})

app.addHook('onRequest', async (request, reply) => {
  if (!shouldRequireAuth(request.method, request.url)) {
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
    for (const [key, value] of response.headers.entries()) {
      reply.header(key, value)
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

app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))
app.get('/system-health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))

const start = async () => {
  try {
    await ensureAdminUser({ allowLocalDevDefaults: false })

    const PORT = Number.parseInt(process.env.PORT || '4000', 10)
    const HOST = process.env.HOST || '0.0.0.0'
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 API server running on http://${HOST}:${PORT}`)

    // Start K8s watchers for SSE subscriptions
    try {
      startPodWatcher()
      startMetricsPoller()
      app.log.info('K8s watchers started for SSE subscriptions')
    } catch (err) {
      app.log.warn('K8s watchers failed to start (K8s may not be configured): %s', err)
    }

    const signals = ['SIGTERM', 'SIGINT'] as const
    for (const signal of signals) {
      process.on(signal, async () => {
        app.log.info(`${signal} received, shutting down gracefully`)
        stopAllWatchers()
        await flushSentry()
        await shutdownTelemetry()
        await app.close()
        process.exit(0)
      })
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
