import crypto from 'node:crypto'
import { db, user, userTokens } from '@voyager/db'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { appRouter } from '../routers/index.js'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function jsonRpcError(id: JsonRpcId, code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }
}

async function authenticateToken(request: FastifyRequest) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null

  const rawToken = authHeader.slice('Bearer '.length).trim()
  if (!rawToken.startsWith('vl_')) return null

  const tokenHash = sha256(rawToken)
  const [tokenRow] = await db
    .select({
      id: userTokens.id,
      userId: userTokens.userId,
      expiresAt: userTokens.expiresAt,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
    })
    .from(userTokens)
    .innerJoin(user, eq(user.id, userTokens.userId))
    .where(
      and(
        eq(userTokens.tokenHash, tokenHash),
        or(isNull(userTokens.expiresAt), sql`${userTokens.expiresAt} > now()`),
      ),
    )
    .limit(1)

  if (!tokenRow) return null

  await db.update(userTokens).set({ lastUsedAt: new Date() }).where(eq(userTokens.id, tokenRow.id))

  return {
    session: {
      userId: tokenRow.userId,
      expiresAt: tokenRow.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    user: {
      id: tokenRow.userId,
      email: tokenRow.userEmail,
      name: tokenRow.userName,
      role: tokenRow.userRole,
    },
  }
}

const mcpTools = [
  {
    name: 'get_logs',
    description: 'Get recent Kubernetes pod logs from one or more targets.',
    inputSchema: {
      type: 'object',
      properties: {
        targets: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              podName: { type: 'string' },
              namespace: { type: 'string' },
              container: { type: 'string' },
              clusterId: { type: 'string', format: 'uuid' },
            },
            required: ['podName', 'namespace'],
          },
        },
        tailLines: { type: 'integer', minimum: 1, maximum: 5000 },
        search: { type: 'string' },
        levels: {
          type: 'array',
          items: { type: 'string', enum: ['ERROR', 'WARN', 'INFO', 'DEBUG'] },
        },
      },
      required: ['targets'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_events',
    description: 'Get recent events.',
    inputSchema: {
      type: 'object',
      properties: {
        clusterId: { type: 'string', format: 'uuid' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_anomalies',
    description: 'Get recent anomalies for a cluster.',
    inputSchema: {
      type: 'object',
      properties: {
        clusterId: { type: 'string', format: 'uuid' },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['clusterId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_metrics',
    description: 'Get current cluster metrics snapshot.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_clusters',
    description: 'Get visible clusters for the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
]

export async function registerMcpRoute(app: FastifyInstance) {
  app.get('/mcp/sse', async (request, reply) => {
    const auth = await authenticateToken(request)
    if (!auth) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    const interval = setInterval(() => {
      reply.raw.write(': keepalive\n\n')
    }, 15_000)

    request.raw.on('close', () => {
      clearInterval(interval)
    })
  })

  app.post(
    '/mcp',
    async (request: FastifyRequest<{ Body: JsonRpcRequest }>, reply: FastifyReply) => {
      const auth = await authenticateToken(request)
      if (!auth) {
        reply.code(401).send({ error: 'Unauthorized' })
        return
      }

      const body = request.body ?? {}
      const id = body.id ?? null

      if (body.jsonrpc !== '2.0' || !body.method) {
        reply.send(jsonRpcError(id, -32600, 'Invalid Request'))
        return
      }

      const caller = appRouter.createCaller({
        db,
        ipAddress: request.ip,
        res: reply,
        session: auth.session,
        user: auth.user,
      })

      try {
        if (body.method === 'initialize') {
          reply.send({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'voyager-mcp', version: '1.0.0' },
              capabilities: { tools: { listChanged: false } },
            },
          })
          return
        }

        if (body.method === 'tools/list') {
          reply.send({ jsonrpc: '2.0', id, result: { tools: mcpTools } })
          return
        }

        if (body.method !== 'tools/call') {
          reply.send(jsonRpcError(id, -32601, 'Method not found'))
          return
        }

        const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
        const toolName = params.name
        const args = params.arguments ?? {}

        let data: unknown
        switch (toolName) {
          case 'get_logs':
            data = await caller.logs.tail({
              targets: Array.isArray(args.targets)
                ? (args.targets as Array<{
                    podName: string
                    namespace: string
                    container?: string
                    clusterId?: string
                  }>)
                : [],
              tailLines: typeof args.tailLines === 'number' ? args.tailLines : 200,
              search: typeof args.search === 'string' ? args.search : undefined,
              levels: Array.isArray(args.levels)
                ? (args.levels as Array<'ERROR' | 'WARN' | 'INFO' | 'DEBUG'>)
                : undefined,
            })
            break
          case 'get_events':
            data = await caller.events.list({
              clusterId: typeof args.clusterId === 'string' ? args.clusterId : undefined,
              limit: typeof args.limit === 'number' ? args.limit : undefined,
              offset: typeof args.offset === 'number' ? args.offset : undefined,
            })
            break
          case 'get_anomalies':
            data = await caller.anomalies.list({
              clusterId: String(args.clusterId),
              page: typeof args.page === 'number' ? args.page : 1,
              pageSize: typeof args.pageSize === 'number' ? args.pageSize : 20,
            })
            break
          case 'get_metrics':
            data = await caller.metrics.currentStats()
            break
          case 'get_clusters':
            data = await caller.clusters.list()
            break
          default:
            reply.send(jsonRpcError(id, -32602, 'Unknown tool'))
            return
        }

        reply.send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(data) }],
            structuredContent: data,
            isError: false,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool call failed'
        reply.send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: message }],
            isError: true,
          },
        })
      }
    },
  )
}
