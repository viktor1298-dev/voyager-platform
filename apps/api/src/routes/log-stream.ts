import { PassThrough } from 'node:stream'
import { Log } from '@kubernetes/client-node'
import { SSE_HEARTBEAT_INTERVAL_MS } from '@voyager/config'
import { trackConnection } from '../lib/connection-tracker.js'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
  podName: z.string().min(1),
  namespace: z.string().min(1),
  container: z.string().optional(),
  tailLines: z.coerce.number().int().min(1).max(10000).optional().default(100),
})

/** Per-cluster and global connection limits to prevent resource exhaustion */
const MAX_CONNECTIONS_PER_CLUSTER = 10
const MAX_CONNECTIONS_GLOBAL = 50
const connectionCounts = new Map<string, number>()
let globalConnections = 0

/** Maximum log lines before auto-closing stream to prevent memory exhaustion */
const MAX_LOG_LINES = 10_000

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

export async function registerLogStreamRoute(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/logs/stream',
    { config: { compress: false } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Validate input
      const parsed = querySchema.safeParse(request.query)
      if (!parsed.success) {
        reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.format() })
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
      const { clusterId, podName, namespace, container, tailLines } = parsed.data
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
        reply.code(429).send({ error: 'Too many log stream connections' })
        return
      }

      // 5. Get K8s client
      let kc
      try {
        kc = await clusterClientPool.getClient(clusterId)
      } catch (err) {
        decrementConnections(clusterId)
        reply.code(502).send({ error: 'Failed to connect to cluster' })
        return
      }

      // 6. Start SSE stream (CORS headers added manually — writeHead bypasses @fastify/cors)
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
      trackConnection(reply.raw)
      reply.raw.write(':connected\n\n')

      let lineCount = 0
      let abortController: AbortController | null = null
      const logStream = new PassThrough()

      // 7. Pipe K8s log data to SSE events
      let buffer = ''
      const safeWrite = (data: string) => {
        try {
          reply.raw.write(data)
        } catch {
          /* connection closed */
        }
      }

      logStream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        // Keep last partial line in buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line) continue
          lineCount++

          safeWrite(`event: log\ndata: ${JSON.stringify({ line, timestamp: Date.now() })}\n\n`)

          if (lineCount >= MAX_LOG_LINES) {
            safeWrite(
              `event: error\ndata: ${JSON.stringify({ message: 'Maximum log lines reached', code: 'MAX_LINES' })}\n\n`,
            )
            logStream.destroy()
            return
          }
        }
      })

      logStream.on('error', (err) => {
        safeWrite(
          `event: error\ndata: ${JSON.stringify({ message: err.message || 'Log stream error', code: 'STREAM_ERROR' })}\n\n`,
        )
        cleanup()
      })

      logStream.on('end', () => {
        // Flush remaining buffer
        if (buffer) {
          safeWrite(
            `event: log\ndata: ${JSON.stringify({ line: buffer, timestamp: Date.now() })}\n\n`,
          )
        }
        safeWrite(
          `event: error\ndata: ${JSON.stringify({ message: 'Log stream ended', code: 'STREAM_END' })}\n\n`,
        )
      })

      // 8. Heartbeat keepalive
      const heartbeat = setInterval(() => {
        safeWrite(':heartbeat\n\n')
      }, SSE_HEARTBEAT_INTERVAL_MS)

      // 9. Cleanup function
      const cleanup = () => {
        clearInterval(heartbeat)
        logStream.destroy()
        if (abortController) {
          try {
            abortController.abort()
          } catch {
            // Ignore abort errors
          }
        }
        decrementConnections(clusterId)
        try {
          reply.raw.end()
        } catch {
          /* already ended */
        }
      }

      // 10. Cleanup on client disconnect
      request.raw.on('close', cleanup)

      // 11. Start K8s log follow
      try {
        const log = new Log(kc)
        // Resolve container — use provided or default to first available
        const containerName = container ?? ''
        abortController = await log.log(namespace, podName, containerName, logStream, {
          follow: true,
          tailLines,
          timestamps: true,
          pretty: false,
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start log stream'
        safeWrite(
          `event: error\ndata: ${JSON.stringify({ message: errorMessage, code: 'START_ERROR' })}\n\n`,
        )
        cleanup()
      }
    },
  )
}
