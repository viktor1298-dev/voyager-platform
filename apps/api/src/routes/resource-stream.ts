/**
 * SSE endpoint for live K8s resource data streaming.
 *
 * Phase 11 redesign: immediate flush (no batch buffer), snapshot event on
 * connect, compression disabled. Replaces the Phase 10 batched approach.
 *
 * Event types:
 *   - `snapshot` — full informer cache per resource type (sent on connect)
 *   - `watch`    — individual resource changes (WatchEventBatch with 1 event)
 *   - `status`   — connection health changes (WatchStatusEvent, immediate)
 */
import {
  MAX_RESOURCE_CONNECTIONS_GLOBAL,
  MAX_RESOURCE_CONNECTIONS_PER_CLUSTER,
  SSE_HEARTBEAT_INTERVAL_MS,
} from '@voyager/config/sse'
import { clusters, db } from '@voyager/db'
import type { WatchEvent, WatchEventBatch, WatchStatusEvent } from '@voyager/types'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { RESOURCE_DEFS, watchManager } from '../lib/watch-manager.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
})

// ── Connection Limits ────────────────────────────────────────

const connectionCounts = new Map<string, number>()
let globalConnections = 0

function incrementConnections(clusterId: string): boolean {
  if (globalConnections >= MAX_RESOURCE_CONNECTIONS_GLOBAL) return false
  const current = connectionCounts.get(clusterId) ?? 0
  if (current >= MAX_RESOURCE_CONNECTIONS_PER_CLUSTER) return false
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

// ── Route Handler ────────────────────────────────────────────

export async function handleResourceStream(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
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

  // 5. Start SSE stream
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
  })
  // Flush immediately so proxies/EventSource receive headers + initial data
  reply.raw.write(':connected\n\n')

  // 6. Subscribe to unified WatchManager (reference-counted informers)
  await watchManager.subscribe(clusterId)

  // 7. Send snapshot — current informer state for each resource type
  for (const def of RESOURCE_DEFS) {
    const resources = watchManager.getResources(clusterId, def.type)
    if (resources && resources.length > 0) {
      const mapped = resources.map((obj) => def.mapper(obj, clusterId))
      try {
        reply.raw.write(
          `event: snapshot\ndata: ${JSON.stringify({ resourceType: def.type, items: mapped })}\n\n`,
        )
      } catch {
        /* connection closed */
      }
    }
  }

  // 8. Listen on watch-event:<clusterId> — immediate write (no batching)
  const onWatchEvent = (event: WatchEvent): void => {
    const payload: WatchEventBatch = {
      clusterId,
      events: [event],
      timestamp: new Date().toISOString(),
    }
    try {
      reply.raw.write(`event: watch\ndata: ${JSON.stringify(payload)}\n\n`)
    } catch {
      /* connection closed */
    }
  }
  voyagerEmitter.on(`watch-event:${clusterId}`, onWatchEvent)

  // 9. Listen on watch-status:<clusterId> — write immediately
  const onWatchStatus = (event: WatchStatusEvent): void => {
    try {
      reply.raw.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`)
    } catch {
      // Connection may be closed
    }
  }
  voyagerEmitter.on(`watch-status:${clusterId}`, onWatchStatus)

  // 10. Heartbeat keepalive
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(':heartbeat\n\n')
    } catch {
      // Connection may be closed
    }
  }, SSE_HEARTBEAT_INTERVAL_MS)

  // 11. Cleanup on disconnect
  request.raw.on('close', () => {
    clearInterval(heartbeat)
    voyagerEmitter.off(`watch-event:${clusterId}`, onWatchEvent)
    voyagerEmitter.off(`watch-status:${clusterId}`, onWatchStatus)
    watchManager.unsubscribe(clusterId)
    decrementConnections(clusterId)
    try {
      reply.raw.end()
    } catch {
      // Already ended
    }
  })
}

export async function registerResourceStreamRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/resources/stream', { config: { compress: false } }, handleResourceStream)
}
