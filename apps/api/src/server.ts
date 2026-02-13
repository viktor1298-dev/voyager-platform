import cors from '@fastify/cors'
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Fastify from 'fastify'
import { type AppRouter, appRouter } from './routers'
import { createContext } from './trpc'

const app = Fastify({ logger: true })

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
    await app.listen({ port: 4000, host: '0.0.0.0' })
    console.log('🚀 API server running on http://localhost:4000')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
