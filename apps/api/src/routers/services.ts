import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { cached } from '../lib/cache.js'
import { protectedProcedure, router } from '../trpc.js'

const K8S_CACHE_TTL = 30

const servicePortSchema = z.object({
  name: z.string().nullable().optional(),
  protocol: z.string().nullable().optional(),
  port: z.number(),
  targetPort: z.union([z.string(), z.number()]).nullable().optional(),
  nodePort: z.number().nullable().optional(),
})

const serviceSummarySchema = z.object({
  name: z.string(),
  namespace: z.string(),
  type: z.string(),
  clusterIP: z.string().nullable().optional(),
  ports: z.array(servicePortSchema),
  createdAt: z.union([z.string(), z.date()]).nullable().optional(),
})

const serviceDetailSchema = serviceSummarySchema.extend({
  selector: z.record(z.string(), z.string()).nullable().optional(),
  externalIPs: z.array(z.string()),
  loadBalancerIP: z.string().nullable().optional(),
  sessionAffinity: z.string().nullable().optional(),
  labels: z.record(z.string(), z.string()).nullable().optional(),
  annotations: z.record(z.string(), z.string()).nullable().optional(),
})

function mapPorts(ports: k8s.V1ServicePort[] | undefined) {
  return (ports ?? []).map((p) => ({
    name: p.name ?? null,
    protocol: p.protocol ?? null,
    port: p.port,
    targetPort: p.targetPort ?? null,
    nodePort: p.nodePort ?? null,
  }))
}

export const servicesRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), namespace: z.string().optional() }))
    .output(z.array(serviceSummarySchema))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const cacheKey = `k8s:${input.clusterId}:services:${input.namespace ?? 'all'}`

        const response = await cached(cacheKey, K8S_CACHE_TTL, () =>
          input.namespace
            ? coreV1.listNamespacedService({ namespace: input.namespace })
            : coreV1.listServiceForAllNamespaces(),
        )

        return response.items.map((svc) => ({
          name: svc.metadata?.name ?? '',
          namespace: svc.metadata?.namespace ?? '',
          type: svc.spec?.type ?? 'ClusterIP',
          clusterIP: svc.spec?.clusterIP ?? null,
          ports: mapPorts(svc.spec?.ports),
          createdAt: svc.metadata?.creationTimestamp ?? null,
        }))
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list services: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  // Alias for consistency with BOARD naming convention (P2-002)
  listByCluster: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), namespace: z.string().optional() }))
    .output(z.array(serviceSummarySchema))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const cacheKey = `k8s:${input.clusterId}:services:${input.namespace ?? 'all'}`

        const response = await cached(cacheKey, K8S_CACHE_TTL, () =>
          input.namespace
            ? coreV1.listNamespacedService({ namespace: input.namespace })
            : coreV1.listServiceForAllNamespaces(),
        )

        return response.items.map((svc) => ({
          name: svc.metadata?.name ?? '',
          namespace: svc.metadata?.namespace ?? '',
          type: svc.spec?.type ?? 'ClusterIP',
          clusterIP: svc.spec?.clusterIP ?? null,
          ports: mapPorts(svc.spec?.ports),
          createdAt: svc.metadata?.creationTimestamp ?? null,
        }))
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list services: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  get: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), name: z.string(), namespace: z.string() }))
    .output(serviceSummarySchema)
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const svc = await coreV1.readNamespacedService({ name: input.name, namespace: input.namespace })

        return {
          name: svc.metadata?.name ?? '',
          namespace: svc.metadata?.namespace ?? '',
          type: svc.spec?.type ?? 'ClusterIP',
          clusterIP: svc.spec?.clusterIP ?? null,
          ports: mapPorts(svc.spec?.ports),
          createdAt: svc.metadata?.creationTimestamp ?? null,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        const msg = error instanceof Error ? error.message : 'Unknown error'
        if (msg.includes('404') || msg.includes('not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Service ${input.name} not found` })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to get service: ${msg}` })
      }
    }),

  describe: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), name: z.string(), namespace: z.string() }))
    .output(serviceDetailSchema)
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const svc = await coreV1.readNamespacedService({ name: input.name, namespace: input.namespace })

        return {
          name: svc.metadata?.name ?? '',
          namespace: svc.metadata?.namespace ?? '',
          type: svc.spec?.type ?? 'ClusterIP',
          clusterIP: svc.spec?.clusterIP ?? null,
          ports: mapPorts(svc.spec?.ports),
          createdAt: svc.metadata?.creationTimestamp ?? null,
          selector: svc.spec?.selector ?? null,
          externalIPs: svc.spec?.externalIPs ?? [],
          loadBalancerIP: svc.status?.loadBalancer?.ingress?.[0]?.ip ?? null,
          sessionAffinity: svc.spec?.sessionAffinity ?? null,
          labels: (svc.metadata?.labels as Record<string, string>) ?? null,
          annotations: (svc.metadata?.annotations as Record<string, string>) ?? null,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        const msg = error instanceof Error ? error.message : 'Unknown error'
        if (msg.includes('404') || msg.includes('not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Service ${input.name} not found` })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to describe service: ${msg}` })
      }
    }),
})
