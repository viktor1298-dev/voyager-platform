import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { LIMITS } from '@voyager/config'
import { clusters, db } from '@voyager/db'
import { z } from 'zod'
import { createAuthorizationService } from '../lib/authorization.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const

const logTargetSchema = z.object({
  podName: z.string().min(1),
  namespace: z.string().min(1),
  container: z.string().min(1).optional(),
  clusterId: z.string().uuid().optional(),
})

async function getDefaultClusterId(): Promise<string> {
  const [first] = await db.select({ id: clusters.id }).from(clusters).limit(1)
  if (!first) throw new TRPCError({ code: 'NOT_FOUND', message: 'No clusters registered' })
  return first.id
}

async function getCoreApiForCluster(clusterId?: string): Promise<k8s.CoreV1Api> {
  const resolvedId = clusterId ?? (await getDefaultClusterId())
  const kc = await clusterClientPool.getClient(resolvedId)
  return kc.makeApiClient(k8s.CoreV1Api)
}

async function listAccessibleClusterIds(params: {
  db: Parameters<typeof createAuthorizationService>[0]
  user: { id: string; role: string | null }
}): Promise<string[]> {
  const allClusterIds = (await params.db.select({ id: clusters.id }).from(clusters)).map(
    (cluster) => cluster.id,
  )
  if (allClusterIds.length === 0) return []

  const authz = createAuthorizationService(params.db)
  const allowedClusterIds = await authz.checkBatch(
    { type: 'user', id: params.user.id },
    'cluster',
    allClusterIds,
    'viewer',
  )

  return allClusterIds.filter((clusterId) => allowedClusterIds.has(clusterId))
}

async function resolveClusterIdForNonAdmin(params: {
  db: Parameters<typeof createAuthorizationService>[0]
  user: { id: string; role: string | null }
  clusterId: string | undefined
}): Promise<string> {
  const authz = createAuthorizationService(params.db)

  if (params.clusterId) {
    const canViewCluster = await authz.check({ type: 'user', id: params.user.id }, 'viewer', {
      type: 'cluster',
      id: params.clusterId,
    })

    if (!canViewCluster) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' })
    }

    return params.clusterId
  }

  const accessibleClusterIds = await listAccessibleClusterIds({ db: params.db, user: params.user })

  if (accessibleClusterIds.length === 1) {
    return accessibleClusterIds[0]!
  }

  if (accessibleClusterIds.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' })
  }

  throw new TRPCError({ code: 'BAD_REQUEST', message: 'clusterId is required' })
}

function normalizeLogResponse(response: unknown): string {
  if (typeof response === 'string') return response
  if (response instanceof Uint8Array) return new TextDecoder().decode(response)
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
    return (
      ((response as { body?: unknown }).body as {
        spec?: { containers?: Array<{ name?: string }> }
      }) ?? {}
    )
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
    .input(
      z
        .object({ namespace: z.string().optional(), clusterId: z.string().uuid().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await resolveClusterIdForNonAdmin({
          db: ctx.db,
          user: ctx.user,
          clusterId: input?.clusterId,
        })
      }

      const coreApi = await getCoreApiForCluster(input?.clusterId)
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
        tailLines: z
          .number()
          .int()
          .positive()
          .max(LIMITS.LOG_TAIL_MAX)
          .default(LIMITS.LOG_TAIL_DEFAULT),
        search: z.string().optional(),
        levels: z.array(z.enum(LOG_LEVELS)).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hasMissingClusterIdTargets = input.targets.some((target) => !target.clusterId)

      if (ctx.user.role !== 'admin' && hasMissingClusterIdTargets) {
        await resolveClusterIdForNonAdmin({
          db: ctx.db,
          user: ctx.user,
          clusterId: undefined,
        })
      }

      if (ctx.user.role !== 'admin') {
        const explicitClusterIds = [
          ...new Set(
            input.targets
              .map((target) => target.clusterId)
              .filter((clusterId): clusterId is string => Boolean(clusterId)),
          ),
        ]

        await Promise.all(
          explicitClusterIds.map((clusterId) =>
            resolveClusterIdForNonAdmin({
              db: ctx.db,
              user: ctx.user,
              clusterId,
            }),
          ),
        )
      }

      const coreApi = await getCoreApiForCluster(input.targets[0]?.clusterId)
      const searchLower = input.search?.trim().toLowerCase()
      const allowedLevels = new Set(input.levels ?? LOG_LEVELS)

      const targetResults = await Promise.all(
        input.targets.map(async (target) => {
          try {
            // Use per-target clusterId if available
            const targetCoreApi = target.clusterId
              ? await getCoreApiForCluster(target.clusterId)
              : coreApi

            const containers = target.container
              ? [target.container]
              : (
                  normalizePodResponse(
                    await targetCoreApi.readNamespacedPod({
                      name: target.podName,
                      namespace: target.namespace,
                    }),
                  ).spec?.containers ?? []
                )
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
                const raw = await targetCoreApi.readNamespacedPodLog({
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

            return { target, lines, error: null as string | null }
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

  stream: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        podName: z.string().min(1),
        namespace: z.string().min(1),
        container: z.string().optional(),
        tailLines: z.number().int().positive().max(LIMITS.LOG_TAIL_MAX).default(500),
      }),
    )
    .output(
      z.object({
        lines: z.array(z.string()),
        podName: z.string(),
        container: z.string().nullable(),
        timestamp: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await resolveClusterIdForNonAdmin({
          db: ctx.db,
          user: ctx.user,
          clusterId: input.clusterId,
        })
      }

      try {
        const coreApi = await getCoreApiForCluster(input.clusterId)

        // If no container specified, resolve from pod spec
        let container = input.container
        if (!container) {
          const pod = normalizePodResponse(
            await coreApi.readNamespacedPod({ name: input.podName, namespace: input.namespace }),
          )
          const containers = (pod.spec?.containers ?? []).map((c) => c.name).filter(Boolean)
          container = containers[0] ?? undefined
        }

        const raw = await coreApi.readNamespacedPodLog({
          name: input.podName,
          namespace: input.namespace,
          container,
          tailLines: input.tailLines,
          follow: false,
          timestamps: true,
        })

        const text = normalizeLogResponse(raw)
        const lines = text.split('\n').filter(Boolean)

        return {
          lines,
          podName: input.podName,
          container: container ?? null,
          timestamp: new Date().toISOString(),
        }
      } catch (error) {
        handleK8sError(error, 'stream logs')
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
      if (ctx.user.role !== 'admin') {
        await resolveClusterIdForNonAdmin({
          db: ctx.db,
          user: ctx.user,
          clusterId: input.clusterId,
        })
      }

      try {
        const coreApi = await getCoreApiForCluster(input.clusterId)
        const raw = await coreApi.readNamespacedPodLog({
          name: input.podName,
          namespace: input.namespace,
          container: input.container,
          tailLines: input.tailLines,
          timestamps: true,
        })

        return { logs: normalizeLogResponse(raw) }
      } catch (error) {
        throw handleK8sError(error, 'get pod logs')
      }
    }),
})
