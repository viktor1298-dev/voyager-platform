import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { cached } from '../lib/cache.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const K8S_CACHE_TTL = 30

const namespaceSummarySchema = z.object({
  name: z.string(),
  status: z.string().nullable().optional(),
  labels: z.record(z.string(), z.string()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).nullable().optional(),
})

export const namespacesRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(z.array(namespaceSummarySchema))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const response = await cached(`k8s:${input.clusterId}:namespaces`, K8S_CACHE_TTL, () =>
          coreV1.listNamespace(),
        )

        return response.items.map((ns) => ({
          name: ns.metadata?.name ?? '',
          status: ns.status?.phase ?? null,
          labels: (ns.metadata?.labels as Record<string, string>) ?? null,
          createdAt: ns.metadata?.creationTimestamp ?? null,
        }))
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list namespaces: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  create: adminProcedure
    .input(z.object({ clusterId: z.string().uuid(), name: z.string().min(1).max(253).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Invalid namespace name') }))
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
          throw new TRPCError({ code: 'CONFLICT', message: `Namespace ${input.name} already exists` })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to create namespace: ${msg}` })
      }
    }),

  delete: adminProcedure
    .input(z.object({
      clusterId: z.string().uuid(),
      name: z.string().min(1),
      confirm: z.string().refine((v) => v === 'DELETE', { message: 'Must confirm with "DELETE"' }),
    }))
    .output(z.object({ deleted: z.boolean(), name: z.string() }))
    .mutation(async ({ input }) => {
      const protectedNamespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
      if (protectedNamespaces.includes(input.name)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot delete protected namespace: ${input.name}` })
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
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to delete namespace: ${msg}` })
      }
    }),
})
