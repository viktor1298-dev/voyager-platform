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
import { ConnectionLimiter, trackConnection } from '../lib/connection-tracker.js'
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
  lastEventId: z.coerce.number().int().positive().optional(),
})

const connectionLimiter = new ConnectionLimiter(
  MAX_RESOURCE_CONNECTIONS_PER_CLUSTER,
  MAX_RESOURCE_CONNECTIONS_GLOBAL,
)

// ── Per-Cluster Shared Replay Buffer ────────────────────────
// Shared across connections so reconnecting clients get events buffered
// during their absence. Capped at 100 events per cluster.
const REPLAY_BUFFER_MAX = 100
const clusterReplayBuffers = new Map<string, Array<{ id: number; raw: string }>>()
const clusterEventCounters = new Map<string, number>()

function getClusterReplayBuffer(clusterId: string): Array<{ id: number; raw: string }> {
  let buf = clusterReplayBuffers.get(clusterId)
  if (!buf) {
    buf = []
    clusterReplayBuffers.set(clusterId, buf)
  }
  return buf
}

function getNextEventId(clusterId: string): number {
  const current = clusterEventCounters.get(clusterId) ?? 0
  const next = current + 1
  clusterEventCounters.set(clusterId, next)
  return next
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

  // 4. Check connection limits (auto-purges destroyed sockets before checking)
  if (!connectionLimiter.add(clusterId, reply.raw)) {
    reply.code(429).send({ error: 'Too many connections' })
    return
  }

  // Per-cluster shared replay buffer so reconnecting clients get missed events
  const replayBuffer = getClusterReplayBuffer(clusterId)

  function writeEventWithId(eventType: string, data: string): void {
    const id = getNextEventId(clusterId)
    const raw = `event: ${eventType}\nid: ${id}\ndata: ${data}\n\n`
    replayBuffer.push({ id, raw })
    if (replayBuffer.length > REPLAY_BUFFER_MAX) replayBuffer.shift()
    try {
      reply.raw.write(raw)
    } catch {
      /* connection closed */
    }
  }

  // 5. Start SSE stream
  // CORS headers must be set manually because reply.raw.writeHead() bypasses
  // Fastify's onSend hook where @fastify/cors normally adds them.
  const origin = request.headers.origin
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  // Tell Fastify we're handling the response ourselves — without this,
  // Fastify tries to send its own response after the handler completes,
  // causing "invalid payload type" errors that kill the SSE connection.
  reply.hijack()

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
    'access-control-allow-origin': corsOrigin,
    'access-control-allow-credentials': 'true',
  })
  trackConnection(reply.raw)
  // Flush immediately so proxies/EventSource receive headers + initial data
  reply.raw.write(':connected\n\n')

  // 6. Register status listener BEFORE subscribe so events during initialization aren't lost
  const onWatchStatus = (event: WatchStatusEvent): void => {
    writeEventWithId('status', JSON.stringify(event))
  }
  voyagerEmitter.on(`watch-status:${clusterId}`, onWatchStatus)

  // 7. Subscribe to unified WatchManager (reference-counted informers)
  try {
    await watchManager.subscribe(clusterId)
  } catch (err) {
    // subscribe() can throw if credential decryption or client creation fails.
    // Headers are already sent, so write an error status event and let the
    // client's reconnect logic handle it.
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    writeEventWithId(
      'status',
      JSON.stringify({ clusterId, state: 'disconnected', error: errorMsg }),
    )
    console.error(`[resource-stream] WatchManager subscribe failed for ${clusterId}:`, errorMsg)
  }

  // 8. Check Last-Event-ID for reconnect replay (CONN-01)
  // Check both header (native EventSource auto-reconnect) and query param (custom reconnect)
  const lastEventIdHeader = request.headers['last-event-id']
  const lastEventId = lastEventIdHeader
    ? Number(lastEventIdHeader)
    : (parsed.data.lastEventId ?? NaN)
  let replayed = false

  if (!Number.isNaN(lastEventId) && lastEventId > 0) {
    const startIdx = replayBuffer.findIndex((e) => e.id > lastEventId)
    if (startIdx >= 0) {
      // Replay missed events — no snapshot needed
      for (let i = startIdx; i < replayBuffer.length; i++) {
        try {
          reply.raw.write(replayBuffer[i].raw)
        } catch {
          return
        }
      }
      replayed = true
    }
  }

  if (!replayed) {
    // Send full snapshot — either first connect or buffer overflow
    for (const def of RESOURCE_DEFS) {
      const resources = watchManager.getResources(clusterId, def.type)
      if (resources && resources.length > 0) {
        const mapped = resources.map((obj) => def.mapper(obj, clusterId))
        writeEventWithId('snapshot', JSON.stringify({ resourceType: def.type, items: mapped }))
      }
    }
  }

  // 9. Listen on watch-event:<clusterId> — immediate write (no batching)
  const onWatchEvent = (event: WatchEvent): void => {
    const payload: WatchEventBatch = {
      clusterId,
      events: [event],
      timestamp: new Date().toISOString(),
    }
    writeEventWithId('watch', JSON.stringify(payload))
  }
  voyagerEmitter.on(`watch-event:${clusterId}`, onWatchEvent)

  // 10. Send explicit connected status for already-subscribed clusters (reconnect case)
  // When this is a reconnect, subscribe() just increments the counter without emitting
  // any status event — the client needs to know the cluster is connected.
  if (watchManager.isConnected(clusterId)) {
    writeEventWithId('status', JSON.stringify({ clusterId, state: 'connected' }))
  }

  // 12. Heartbeat keepalive (named event so client JavaScript can listen)
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write('event: heartbeat\ndata: \n\n')
    } catch {
      // Connection may be closed
    }
  }, SSE_HEARTBEAT_INTERVAL_MS)

  // 13. Cleanup on disconnect
  request.raw.on('close', () => {
    clearInterval(heartbeat)
    voyagerEmitter.off(`watch-event:${clusterId}`, onWatchEvent)
    voyagerEmitter.off(`watch-status:${clusterId}`, onWatchStatus)
    watchManager.unsubscribe(clusterId)
    connectionLimiter.remove(clusterId, reply.raw)
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
