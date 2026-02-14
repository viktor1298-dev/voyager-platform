import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Fastify from 'fastify'
import { type AppRouter, appRouter } from './routers'
import { createContext } from './trpc'

const app = Fastify({ logger: true })

const REDIS_URL = process.env.REDIS_URL

const rateLimitConfig: Parameters<typeof rateLimit>[1] = {
  max: 100,
  timeWindow: '1 minute',
  ...(REDIS_URL
    ? {
        redis: {
          host: new URL(REDIS_URL).hostname,
          port: Number(new URL(REDIS_URL).port) || 6379,
        },
      }
    : {}),
}

app.register(rateLimit, rateLimitConfig)

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
