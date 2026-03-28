import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { CACHE_TTL } from '@voyager/config'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const resourceQuotaSchema = z.object({
  cpuLimit: z.string().nullable().optional(),
  memLimit: z.string().nullable().optional(),
  cpuUsed: z.string().nullable().optional(),
  memUsed: z.string().nullable().optional(),
})

const namespaceSummarySchema = z.object({
  name: z.string(),
  status: z.string().nullable().optional(),
  labels: z.record(z.string(), z.string()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).nullable().optional(),
  resourceQuota: resourceQuotaSchema.nullable().optional(),
})

export const namespacesRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(z.array(namespaceSummarySchema))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const [nsResponse, quotaResponse] = await Promise.all([
          cached(CACHE_KEYS.k8sNamespaces(input.clusterId), CACHE_TTL.K8S_RESOURCES_SEC, () =>
            coreV1.listNamespace(),
          ),
          cached(CACHE_KEYS.k8sResourceQuotas(input.clusterId), CACHE_TTL.K8S_RESOURCES_SEC, () =>
            coreV1.listResourceQuotaForAllNamespaces(),
          ).catch(() => ({ items: [] as k8s.V1ResourceQuota[] })),
        ])

        // Build a map of namespace → aggregated resource quota
        const quotaMap = new Map<
          string,
          {
            cpuLimit: string | null
            memLimit: string | null
            cpuUsed: string | null
            memUsed: string | null
          }
        >()
        for (const quota of quotaResponse.items ?? []) {
          const ns = quota.metadata?.namespace ?? ''
          if (!ns) continue
          const hard = quota.status?.hard ?? {}
          const used = quota.status?.used ?? {}
          // If multiple quotas exist per namespace, take the first one found
          if (!quotaMap.has(ns)) {
            quotaMap.set(ns, {
              cpuLimit: hard['limits.cpu'] ?? hard.cpu ?? null,
              memLimit: hard['limits.memory'] ?? hard.memory ?? null,
              cpuUsed: used['limits.cpu'] ?? used.cpu ?? null,
              memUsed: used['limits.memory'] ?? used.memory ?? null,
            })
          }
        }

        return nsResponse.items.map((ns) => {
          const name = ns.metadata?.name ?? ''
          return {
            name,
            status: ns.status?.phase ?? null,
            labels: (ns.metadata?.labels as Record<string, string>) ?? null,
            createdAt: ns.metadata?.creationTimestamp ?? null,
            resourceQuota: quotaMap.get(name) ?? null,
          }
        })
      } catch (error) {
        handleK8sError(error, 'list namespaces')
      }
    }),

  listDetail: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const [nsResponse, quotaResponse] = await Promise.all([
          cached(CACHE_KEYS.k8sNamespaces(input.clusterId), CACHE_TTL.K8S_RESOURCES_SEC, () =>
            coreV1.listNamespace(),
          ),
          cached(CACHE_KEYS.k8sResourceQuotas(input.clusterId), CACHE_TTL.K8S_RESOURCES_SEC, () =>
            coreV1.listResourceQuotaForAllNamespaces(),
          ).catch(() => ({ items: [] as k8s.V1ResourceQuota[] })),
        ])

        const quotaMap = new Map<
          string,
          {
            cpuLimit: string | null
            memLimit: string | null
            cpuUsed: string | null
            memUsed: string | null
          }
        >()
        for (const quota of quotaResponse.items ?? []) {
          const ns = quota.metadata?.namespace ?? ''
          if (!ns || quotaMap.has(ns)) continue
          const hard = quota.status?.hard ?? {}
          const used = quota.status?.used ?? {}
          quotaMap.set(ns, {
            cpuLimit: hard['limits.cpu'] ?? hard.cpu ?? null,
            memLimit: hard['limits.memory'] ?? hard.memory ?? null,
            cpuUsed: used['limits.cpu'] ?? used.cpu ?? null,
            memUsed: used['limits.memory'] ?? used.memory ?? null,
          })
        }

        return nsResponse.items.map((ns) => {
          const name = ns.metadata?.name ?? ''
          return {
            name,
            status: ns.status?.phase ?? null,
            labels: (ns.metadata?.labels as Record<string, string>) ?? {},
            annotations: (ns.metadata?.annotations as Record<string, string>) ?? {},
            createdAt: ns.metadata?.creationTimestamp
              ? new Date(ns.metadata.creationTimestamp as unknown as string).toISOString()
              : null,
            resourceQuota: quotaMap.get(name) ?? null,
          }
        })
      } catch (error) {
        handleK8sError(error, 'list namespaces detail')
      }
    }),

  create: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z
          .string()
          .min(1)
          .max(253)
          .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Invalid namespace name'),
      }),
    )
    .output(namespaceSummarySchema)
    .mutation(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const ns = await coreV1.createNamespace({
          body: { metadata: { name: input.name } },
        })

        return {
          name: ns.metadata?.name ?? '',
          status: ns.status?.phase ?? null,
          labels: (ns.metadata?.labels as Record<string, string>) ?? null,
          createdAt: ns.metadata?.creationTimestamp ?? null,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        const msg = error instanceof Error ? error.message : 'Unknown error'
        if (msg.includes('409') || msg.includes('already exists')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Namespace ${input.name} already exists`,
          })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create namespace: ${msg}`,
        })
      }
    }),

  delete: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string().min(1),
        confirm: z
          .string()
          .refine((v) => v === 'DELETE', { message: 'Must confirm with "DELETE"' }),
      }),
    )
    .output(z.object({ deleted: z.boolean(), name: z.string() }))
    .mutation(async ({ input }) => {
      const protectedNamespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
      if (protectedNamespaces.includes(input.name)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete protected namespace: ${input.name}`,
        })
      }

      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        await coreV1.deleteNamespace({ name: input.name })
        return { deleted: true, name: input.name }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        const msg = error instanceof Error ? error.message : 'Unknown error'
        if (msg.includes('404') || msg.includes('not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Namespace ${input.name} not found` })
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete namespace: ${msg}`,
        })
      }
    }),
})
