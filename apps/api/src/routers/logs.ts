import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createAuthorizationService } from '../lib/authorization.js'
import { getCoreV1Api } from '../lib/k8s.js'
import { protectedProcedure, router } from '../trpc.js'

const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const

const logTargetSchema = z.object({
  podName: z.string().min(1),
  namespace: z.string().min(1),
  container: z.string().min(1).optional(),
  clusterId: z.string().uuid().optional(),
})

async function ensureClusterViewerAccess(params: {
  db: Parameters<typeof createAuthorizationService>[0]
  user: { id: string; role: string | null }
  clusterId: string | undefined
}): Promise<void> {
  if (params.user.role === 'admin') return

  if (!params.clusterId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'clusterId is required' })
  }

  const authz = createAuthorizationService(params.db)
  const canViewCluster = await authz.check(
    { type: 'user', id: params.user.id },
    'viewer',
    { type: 'cluster', id: params.clusterId },
  )

  if (!canViewCluster) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' })
  }
}

function normalizeLogResponse(response: unknown): string {
  if (typeof response === 'string') return response

  if (response instanceof Uint8Array) {
    return new TextDecoder().decode(response)
  }

  if (response && typeof response === 'object' && 'body' in response) {
    const body = (response as { body?: unknown }).body

    if (typeof body === 'string') return body
    if (body instanceof Uint8Array) return new TextDecoder().decode(body)
  }

  return String(response)
}

function normalizePodResponse(response: unknown): {
  spec?: { containers?: Array<{ name?: string }> }
} {
  if (response && typeof response === 'object' && 'body' in response) {
    return ((response as { body?: unknown }).body as { spec?: { containers?: Array<{ name?: string }> } }) ?? {}
  }

  return (response as { spec?: { containers?: Array<{ name?: string }> } }) ?? {}
}

function detectLogLevel(line: string): (typeof LOG_LEVELS)[number] {
  const normalized = line.toUpperCase()
  if (normalized.includes('ERROR') || normalized.includes('FATAL')) return 'ERROR'
  if (normalized.includes('WARN')) return 'WARN'
  if (normalized.includes('DEBUG') || normalized.includes('TRACE')) return 'DEBUG'
  return 'INFO'
}

export const logsRouter = router({
  pods: protectedProcedure
    .input(z.object({ namespace: z.string().optional(), clusterId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      await ensureClusterViewerAccess({
        db: ctx.db,
        user: ctx.user,
        clusterId: input?.clusterId,
      })

      const coreApi = getCoreV1Api()
      const ns = input?.namespace
      const response = ns
        ? await coreApi.listNamespacedPod({ namespace: ns })
        : await coreApi.listPodForAllNamespaces()

      const items =
        (response as { items?: Array<unknown>; body?: { items?: Array<unknown> } }).items ??
        (response as { body?: { items?: Array<unknown> } }).body?.items ??
        []

      return items.map((item) => {
        const pod = item as {
          metadata?: { name?: string; namespace?: string }
          status?: { phase?: string }
          spec?: { containers?: Array<{ name?: string }> }
        }

        return {
          name: pod.metadata?.name ?? '',
          namespace: pod.metadata?.namespace ?? '',
          status: pod.status?.phase ?? 'Unknown',
          containers: (pod.spec?.containers ?? []).map((c) => c.name ?? '').filter(Boolean),
        }
      })
    }),

  tail: protectedProcedure
    .input(
      z.object({
        targets: z.array(logTargetSchema).min(1),
        tailLines: z.number().int().positive().max(5000).default(200),
        search: z.string().optional(),
        levels: z.array(z.enum(LOG_LEVELS)).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && input.targets.some((target) => !target.clusterId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'clusterId is required' })
      }

      const uniqueClusterIds = [...new Set(input.targets.map((target) => target.clusterId).filter(Boolean))]
      await Promise.all(
        uniqueClusterIds.map((clusterId) =>
          ensureClusterViewerAccess({
            db: ctx.db,
            user: ctx.user,
            clusterId,
          }),
        ),
      )

      const coreApi = getCoreV1Api()
      const searchLower = input.search?.trim().toLowerCase()
      const allowedLevels = new Set(input.levels ?? LOG_LEVELS)

      const targetResults = await Promise.all(
        input.targets.map(async (target) => {
          try {
            const containers = target.container
              ? [target.container]
              : (normalizePodResponse(
                  await coreApi.readNamespacedPod({ name: target.podName, namespace: target.namespace }),
                ).spec?.containers ?? [])
                  .map((c) => c.name)
                  .filter((name): name is string => Boolean(name))

            if (containers.length === 0) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `No containers found for ${target.namespace}/${target.podName}`,
              })
            }

            const containerResults = await Promise.all(
              containers.map(async (containerName) => {
                const raw = await coreApi.readNamespacedPodLog({
                  name: target.podName,
                  namespace: target.namespace,
                  container: containerName,
                  tailLines: input.tailLines,
                  timestamps: true,
                })

                return { containerName, text: normalizeLogResponse(raw) }
              }),
            )

            const lines = containerResults
              .flatMap(({ containerName, text }) =>
                text
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => {
                    const firstSpaceIdx = line.indexOf(' ')
                    const timestamp =
                      firstSpaceIdx > 0 ? line.slice(0, firstSpaceIdx) : new Date().toISOString()
                    const message = firstSpaceIdx > 0 ? line.slice(firstSpaceIdx + 1) : line
                    const level = detectLogLevel(message)

                    return {
                      timestamp,
                      message,
                      level,
                      namespace: target.namespace,
                      podName: target.podName,
                      container: containerName,
                      raw: line,
                    }
                  }),
              )
              .filter((line) => {
                if (!allowedLevels.has(line.level)) return false
                if (!searchLower) return true
                return line.raw.toLowerCase().includes(searchLower)
              })

            return {
              target,
              lines,
              error: null as string | null,
            }
          } catch (error) {
            return {
              target,
              lines: [],
              error: error instanceof Error ? error.message : 'Failed to fetch logs',
            }
          }
        }),
      )

      const lines = targetResults
        .flatMap((result) => result.lines)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

      return {
        lines,
        targets: targetResults.map(({ target, error, lines: targetLines }) => ({
          ...target,
          lineCount: targetLines.length,
          error,
        })),
      }
    }),

  get: protectedProcedure
    .input(
      z.object({
        podName: z.string(),
        namespace: z.string(),
        container: z.string().optional(),
        tailLines: z.number().int().positive().default(100),
        clusterId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureClusterViewerAccess({
        db: ctx.db,
        user: ctx.user,
        clusterId: input.clusterId,
      })

      const coreApi = getCoreV1Api()
      const raw = await coreApi.readNamespacedPodLog({
        name: input.podName,
        namespace: input.namespace,
        container: input.container,
        tailLines: input.tailLines,
        timestamps: true,
      })

      return { logs: normalizeLogResponse(raw) }
    }),
})
