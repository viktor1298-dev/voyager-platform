import { auth } from '../lib/auth.js'
import { db } from '@voyager/db'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AIService, clusterSnapshotSchema } from '../services/ai-service.js'
import { AI_CONFIG } from '@voyager/config'

const aiStreamBodySchema = z.object({
  clusterId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  snapshot: clusterSnapshotSchema.optional(),
  threadId: z.string().uuid().optional(),
})

export async function registerAiStreamRoute(app: FastifyInstance): Promise<void> {
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

    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    const heartbeat = setInterval(() => {
      reply.raw.write(':keepalive\n\n')
    }, AI_CONFIG.STREAM_HEARTBEAT_MS)

    try {
      const aiService = new AIService({ db })
      const result = await aiService.answerQuestionStream(
        {
          clusterId: parsed.data.clusterId,
          question: parsed.data.question,
          snapshot: parsed.data.snapshot,
          threadId: parsed.data.threadId,
          userId: sessionResult.user.id,
        },
        (token) => {
          writeEvent('token', { token })
        },
      )

      writeEvent('done', {
        threadId: result.threadId,
        provider: result.provider,
        model: result.model,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI streaming failed'
      writeEvent('error', { message })
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })
}
