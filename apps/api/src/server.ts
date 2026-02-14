import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Fastify from 'fastify'
import { fastifyTRPCOpenApiPlugin } from 'trpc-to-openapi'
import { auth } from './lib/auth'
import { generateOpenApiSpec } from './lib/openapi'
import { startMetricsPoller, startPodWatcher, stopAllWatchers } from './lib/k8s-watchers'
import { captureException, flushSentry, initSentry } from './lib/sentry'
import { shutdownTelemetry } from './lib/telemetry'
import { type AppRouter, appRouter } from './routers'
import { createContext } from './trpc'

// Initialize Sentry early
initSentry()

const app = Fastify({ logger: true })

app.register(compress, { global: true })

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})

// ALLOWED_ORIGINS: comma-separated list of allowed origins for CORS.
// Falls back to localhost:3000 for local development.
// In production, set to the actual frontend domain(s).
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
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

app.register(swagger, {
  mode: 'static',
  specification: {
    document: generateOpenApiSpec() as never,
  },
})

app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
})

app.get('/openapi.json', async (_request, reply) => {
  reply.send(generateOpenApiSpec())
})

// Better-Auth handler — all auth routes via /api/auth/*
// Stricter rate limiting on sign-in (5 req/min per IP)
const AUTH_SIGN_IN_MAX = Number.parseInt(process.env.AUTH_SIGN_IN_RATE_LIMIT || '5', 10)
app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  config: {
    rateLimit: {
      max: (req: { url: string }) => (req.url.includes('/sign-in/') ? AUTH_SIGN_IN_MAX : 100),
      timeWindow: '1 minute',
      keyGenerator: (req: { ip: string }) => req.ip,
    },
  },
  async handler(request, reply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`)
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
      reply.status(500).send({ error: 'Internal authentication error', code: 'AUTH_FAILURE' })
    }
  },
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

app.get('/health', async () => ({ status: 'ok' }))

const start = async () => {
  try {
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
