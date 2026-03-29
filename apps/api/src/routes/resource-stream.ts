import crypto from 'node:crypto'
import {
  MAX_RESOURCE_CONNECTIONS_GLOBAL,
  MAX_RESOURCE_CONNECTIONS_PER_CLUSTER,
  RESOURCE_STREAM_BUFFER_MS,
  SSE_HEARTBEAT_INTERVAL_MS,
} from '@voyager/config/sse'
import { clusters, db } from '@voyager/db'
import type { ResourceChangeEvent } from '@voyager/types'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { resourceWatchManager } from '../lib/resource-watch-manager.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
})

/** Per-cluster and global connection limits */
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

export async function registerResourceStreamRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/resources/stream', async (request: FastifyRequest, reply: FastifyReply) => {
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

    const connectionId = crypto.randomUUID()

    // 6. Subscribe to resource watch manager (reference-counted)
    resourceWatchManager.subscribe(clusterId, connectionId)

    // 7. Buffer events for RESOURCE_STREAM_BUFFER_MS before flushing
    let eventBuffer: ResourceChangeEvent[] = []
    let bufferTimer: ReturnType<typeof setTimeout> | null = null

    function flushBuffer() {
      if (eventBuffer.length === 0) return
      const batch = eventBuffer
      eventBuffer = []
      try {
        reply.raw.write(`event: resource-change\ndata: ${JSON.stringify(batch)}\n\n`)
      } catch {
        // Connection may be closed — ignore write errors
      }
    }

    // 8. Listen to resource-change events for this cluster
    const resourceHandler = (event: ResourceChangeEvent) => {
      eventBuffer.push(event)
      if (!bufferTimer) {
        bufferTimer = setTimeout(() => {
          bufferTimer = null
          flushBuffer()
        }, RESOURCE_STREAM_BUFFER_MS)
      }
    }
    voyagerEmitter.on(`resource-change:${clusterId}`, resourceHandler)

    // 9. Also bridge existing ClusterWatchManager events (pods, deployments, nodes)
    // These are already watched by ClusterWatchManager but we re-emit as ResourceChangeEvent
    const podHandler = (podEvent: {
      clusterId: string
      type: string
      name: string
      namespace: string
    }) => {
      if (podEvent.clusterId !== clusterId) return
      const event: ResourceChangeEvent = {
        clusterId,
        resourceType: 'pods',
        changeType: podEvent.type as ResourceChangeEvent['changeType'],
        name: podEvent.name,
        namespace: podEvent.namespace,
        timestamp: new Date().toISOString(),
      }
      eventBuffer.push(event)
      if (!bufferTimer) {
        bufferTimer = setTimeout(() => {
          bufferTimer = null
          flushBuffer()
        }, RESOURCE_STREAM_BUFFER_MS)
      }
    }
    voyagerEmitter.on('pod-event', podHandler)

    const deploymentHandler = (depEvent: {
      type: string
      clusterId: string
      data: { metadata?: { name?: string; namespace?: string } }
    }) => {
      if (depEvent.clusterId !== clusterId) return
      const event: ResourceChangeEvent = {
        clusterId,
        resourceType: 'deployments',
        changeType: depEvent.type as ResourceChangeEvent['changeType'],
        name: depEvent.data?.metadata?.name ?? 'unknown',
        namespace: depEvent.data?.metadata?.namespace ?? null,
        timestamp: new Date().toISOString(),
      }
      eventBuffer.push(event)
      if (!bufferTimer) {
        bufferTimer = setTimeout(() => {
          bufferTimer = null
          flushBuffer()
        }, RESOURCE_STREAM_BUFFER_MS)
      }
    }
    voyagerEmitter.on('deployment-event', deploymentHandler)

    const nodeHandler = (nodeEvent: {
      type: string
      clusterId: string
      data: { metadata?: { name?: string } }
    }) => {
      if (nodeEvent.clusterId !== clusterId) return
      const event: ResourceChangeEvent = {
        clusterId,
        resourceType: 'nodes',
        changeType: nodeEvent.type as ResourceChangeEvent['changeType'],
        name: nodeEvent.data?.metadata?.name ?? 'unknown',
        namespace: null,
        timestamp: new Date().toISOString(),
      }
      eventBuffer.push(event)
      if (!bufferTimer) {
        bufferTimer = setTimeout(() => {
          bufferTimer = null
          flushBuffer()
        }, RESOURCE_STREAM_BUFFER_MS)
      }
    }
    voyagerEmitter.on('node-event', nodeHandler)

    // 10. Heartbeat keepalive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n')
      } catch {
        // Connection may be closed
      }
    }, SSE_HEARTBEAT_INTERVAL_MS)

    // 11. Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      if (bufferTimer) {
        clearTimeout(bufferTimer)
        bufferTimer = null
      }
      voyagerEmitter.off(`resource-change:${clusterId}`, resourceHandler)
      voyagerEmitter.off('pod-event', podHandler)
      voyagerEmitter.off('deployment-event', deploymentHandler)
      voyagerEmitter.off('node-event', nodeHandler)
      resourceWatchManager.unsubscribe(clusterId, connectionId)
      decrementConnections(clusterId)
      try {
        reply.raw.end()
      } catch {
        // Already ended
      }
    })
  })
}
