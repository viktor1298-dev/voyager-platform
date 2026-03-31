import { TRPCError } from '@trpc/server'
import { AI_CONFIG } from '@voyager/config'
import { db } from '@voyager/db'
import { trackConnection } from '../lib/connection-tracker.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { AIService, clusterSnapshotSchema } from '../services/ai-service.js'

const aiStreamBodySchema = z.object({
  clusterId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  snapshot: clusterSnapshotSchema.optional(),
  threadId: z.string().uuid().optional(),
  provider: z.enum(['openai', 'claude']).optional(),
})

const aiHistoryQuerySchema = z.object({
  clusterId: z.string().uuid(),
  messageLimit: z.coerce.number().int().min(1).max(500).optional(),
})

const SSE_PROTOCOL_VERSION = 'v1'

export async function registerAiStreamRoute(app: FastifyInstance): Promise<void> {
  const handleHistoryRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = aiHistoryQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.code(400).send({ error: 'Invalid request query' })
      return
    }

    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, String(value))
    }

    const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
    if (!sessionResult?.session || !sessionResult.user) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }

    try {
      const aiService = new AIService({ db })
      const history = await aiService.getLatestThreadHistory({
        clusterId: parsed.data.clusterId,
        userId: sessionResult.user.id,
        messageLimit: parsed.data.messageLimit,
      })

      if (!history) {
        reply.code(404).send({ error: 'No conversation history found' })
        return
      }

      reply.code(200).send(history)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch conversation history'
      reply.code(500).send({ error: message })
    }
  }

  app.get('/api/ai/conversations/latest', handleHistoryRequest)
  app.get('/api/ai/conversations', handleHistoryRequest)

  app.post('/api/ai/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = aiStreamBodySchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400).send({ error: 'Invalid request payload' })
      return
    }

    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, String(value))
    }

    const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
    if (!sessionResult?.session || !sessionResult.user) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    trackConnection(reply.raw)

    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      try {
        reply.raw.write(`event: ${event}\n`)
        reply.raw.write(
          `data: ${JSON.stringify({ ...payload, protocolVersion: SSE_PROTOCOL_VERSION })}\n\n`,
        )
      } catch {
        /* connection closed */
      }
    }

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n')
      } catch {
        /* connection closed */
      }
    }, AI_CONFIG.STREAM_HEARTBEAT_MS)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
    })

    try {
      const aiService = new AIService({ db })
      const result = await aiService.answerQuestionStream(
        {
          clusterId: parsed.data.clusterId,
          question: parsed.data.question,
          snapshot: parsed.data.snapshot,
          threadId: parsed.data.threadId,
          userId: sessionResult.user.id,
          provider: parsed.data.provider,
        },
        (token) => {
          writeEvent('token', { delta: token })
        },
      )

      writeEvent('done', {
        done: true,
        threadId: result.threadId,
        provider: result.provider,
        model: result.model,
      })
    } catch (error) {
      const normalizedError =
        error instanceof TRPCError
          ? {
              code: error.code,
              message: error.message,
            }
          : {
              code: 'AI_STREAM_ERROR',
              message: error instanceof Error ? error.message : 'AI streaming failed',
            }

      writeEvent('error', normalizedError)
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })
}
