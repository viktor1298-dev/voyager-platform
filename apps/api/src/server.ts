import compress from '@fastify/compress'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Fastify from 'fastify'
import { type AppRouter, appRouter } from './routers'
import { createContext } from './trpc'

const app = Fastify({ logger: true })

app.register(compress, { global: true })

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})

// In-memory fallback for login rate limiting when Redis is unavailable
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_RATE_LIMIT_MAX = 5
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000

// Stricter rate limit for auth.login: max 5 attempts per minute to prevent brute-force
app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/trpc/auth.login' && request.method === 'POST') {
    const key = `login:${request.ip}`
    const redis = await import('./lib/cache').then(m => m.getRedisClient()).catch(() => null)
    if (redis) {
      const attempts = await redis.incr(key)
      if (attempts === 1) await redis.expire(key, 60)
      if (attempts > LOGIN_RATE_LIMIT_MAX) {
        reply.code(429).send({ error: 'Too many login attempts. Try again in 1 minute.' })
      }
    } else {
      // Fallback: in-memory rate limiting
      app.log.warn('Redis unavailable — using in-memory login rate limit fallback')
      const now = Date.now()
      const entry = loginAttempts.get(key)
      if (!entry || now > entry.resetAt) {
        loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS })
      } else {
        entry.count++
        if (entry.count > LOGIN_RATE_LIMIT_MAX) {
          reply.code(429).send({ error: 'Too many login attempts. Try again in 1 minute.' })
        }
      }
    }
  }
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

app.get('/health', async () => ({ status: 'ok' }))

const start = async () => {
  try {
    const PORT = Number.parseInt(process.env.PORT || '4000', 10)
    const HOST = process.env.HOST || '0.0.0.0'
    await app.listen({ port: PORT, host: HOST })
    console.log(`🚀 API server running on http://${HOST}:${PORT}`)

    const signals = ['SIGTERM', 'SIGINT'] as const
    for (const signal of signals) {
      process.on(signal, async () => {
        app.log.info(`${signal} received, shutting down gracefully`)
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
