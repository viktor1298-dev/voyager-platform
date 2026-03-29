/**
 * SSE endpoint for live K8s resource data streaming.
 *
 * Carries full transformed resource objects (D-01) in 1-second batched
 * WatchEventBatch payloads (D-02). Replaces the old signal-only approach
 * that required clients to refetch via tRPC.
 *
 * Event types:
 *   - `watch`  — batched resource changes (WatchEventBatch)
 *   - `status` — connection health changes (WatchStatusEvent, immediate)
 */
import {
  MAX_RESOURCE_CONNECTIONS_GLOBAL,
  MAX_RESOURCE_CONNECTIONS_PER_CLUSTER,
  RESOURCE_STREAM_BUFFER_MS,
  SSE_HEARTBEAT_INTERVAL_MS,
} from '@voyager/config/sse'
import { clusters, db } from '@voyager/db'
import type { WatchEvent, WatchEventBatch, WatchStatusEvent } from '@voyager/types'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { watchManager } from '../lib/watch-manager.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
})

/** Initial load window in ms — suppress ADDED events from informer list replay */
const INITIAL_LOAD_WINDOW_MS = 5_000

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

  // 7. Initial load window — suppress ADDED events from informer list replay
  //    (D-04: tRPC query provides initial data, SSE only carries live updates)
  let initialLoadWindow = true
  const initialLoadTimer = setTimeout(() => {
    initialLoadWindow = false
  }, INITIAL_LOAD_WINDOW_MS)

  // 8. Event batch buffer (D-02: 1-second server-side batching)
  let batch: WatchEvent[] = []
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  function flushBatch(): void {
    if (batch.length === 0) return
    const payload: WatchEventBatch = {
      clusterId,
      events: batch,
      timestamp: new Date().toISOString(),
    }
    batch = []
    batchTimer = null
    try {
      reply.raw.write(`event: watch\ndata: ${JSON.stringify(payload)}\n\n`)
    } catch {
      // Connection may be closed — ignore write errors
    }
  }

  // 9. Listen on watch-event:<clusterId> for resource changes
  const onWatchEvent = (event: WatchEvent): void => {
    // Suppress initial list replay (D-04)
    if (initialLoadWindow && event.type === 'ADDED') return

    batch.push(event)
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, RESOURCE_STREAM_BUFFER_MS)
    }
  }
  voyagerEmitter.on(`watch-event:${clusterId}`, onWatchEvent)

  // 10. Listen on watch-status:<clusterId> — write immediately (no batching)
  const onWatchStatus = (event: WatchStatusEvent): void => {
    try {
      reply.raw.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`)
    } catch {
      // Connection may be closed
    }
  }
  voyagerEmitter.on(`watch-status:${clusterId}`, onWatchStatus)

  // 11. Heartbeat keepalive
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(':heartbeat\n\n')
    } catch {
      // Connection may be closed
    }
  }, SSE_HEARTBEAT_INTERVAL_MS)

  // 12. Cleanup on disconnect
  request.raw.on('close', () => {
    clearTimeout(initialLoadTimer)
    clearInterval(heartbeat)
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
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
  app.get('/api/resources/stream', handleResourceStream)
}
