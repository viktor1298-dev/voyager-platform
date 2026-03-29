import crypto from 'node:crypto'
import { SSE_HEARTBEAT_INTERVAL_MS } from '@voyager/config'
import { clusters, db } from '@voyager/db'
import type { MetricsStreamEvent } from '@voyager/types'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { metricsStreamJob } from '../jobs/metrics-stream-job.js'
import { auth } from '../lib/auth.js'
import { voyagerEmitter } from '../lib/event-emitter.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
})

/** Per-cluster and global connection limits to prevent resource exhaustion */
const MAX_CONNECTIONS_PER_CLUSTER = 10
const MAX_CONNECTIONS_GLOBAL = 50
const connectionCounts = new Map<string, number>()
let globalConnections = 0

function incrementConnections(clusterId: string): boolean {
  if (globalConnections >= MAX_CONNECTIONS_GLOBAL) return false
  const current = connectionCounts.get(clusterId) ?? 0
  if (current >= MAX_CONNECTIONS_PER_CLUSTER) return false
  connectionCounts.set(clusterId, current + 1)
  globalConnections++
  return true
}

function decrementConnections(clusterId: string): void {
  const current = connectionCounts.get(clusterId) ?? 0
  if (current > 0) connectionCounts.set(clusterId, current - 1)
  if (current <= 1) connectionCounts.delete(clusterId)
  if (globalConnections > 0) globalConnections--
}

export async function registerMetricsStreamRoute(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/metrics/stream',
    { config: { compress: false } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Validate input
      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        reply.code(400).send({ error: 'Invalid clusterId' })
        return
      }

      // 2. Authenticate
      const headers = new Headers()
      for (const [key, value] of Object.entries(request.headers)) {
        if (value) headers.append(key, String(value))
      }
      const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
      if (!sessionResult?.session || !sessionResult.user) {
        reply.code(401).send({ error: 'Unauthorized' })
        return
      }

      // 3. Verify cluster exists
      const { clusterId } = parsed.data
      const [cluster] = await db
        .select({ id: clusters.id })
        .from(clusters)
        .where(eq(clusters.id, clusterId))
      if (!cluster) {
        reply.code(404).send({ error: 'Cluster not found' })
        return
      }

      // 4. Check connection limits
      if (!incrementConnections(clusterId)) {
        reply.code(429).send({ error: 'Too many connections' })
        return
      }

      // 5. Start SSE stream (CORS headers added manually — writeHead bypasses @fastify/cors)
      const origin = request.headers.origin
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
      const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        connection: 'keep-alive',
        'access-control-allow-origin': corsOrigin,
        'access-control-allow-credentials': 'true',
      })
      reply.raw.write(':connected\n\n')

      const connectionId = crypto.randomUUID()

      // 6. Subscribe to metrics events for this cluster
      const handler = (event: MetricsStreamEvent) => {
        reply.raw.write(`event: metrics\ndata: ${JSON.stringify(event)}\n\n`)
      }
      voyagerEmitter.on(`metrics-stream:${clusterId}`, handler)
      metricsStreamJob.subscribe(clusterId, connectionId)

      // 7. Heartbeat keepalive
      const heartbeat = setInterval(() => {
        reply.raw.write(':keepalive\n\n')
      }, SSE_HEARTBEAT_INTERVAL_MS)

      // 8. Cleanup on disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeat)
        voyagerEmitter.off(`metrics-stream:${clusterId}`, handler)
        metricsStreamJob.unsubscribe(clusterId, connectionId)
        decrementConnections(clusterId)
        reply.raw.end()
      })
    },
  )
}
