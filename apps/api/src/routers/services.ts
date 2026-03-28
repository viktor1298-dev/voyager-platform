import * as k8s from '@kubernetes/client-node'
import { CACHE_TTL } from '@voyager/config'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

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
        const cacheKey = CACHE_KEYS.k8sServices(input.clusterId, input.namespace)

        const response = await cached(cacheKey, CACHE_TTL.K8S_RESOURCES_SEC, () =>
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
        handleK8sError(error, 'list services')
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
        const cacheKey = CACHE_KEYS.k8sServices(input.clusterId, input.namespace)

        const response = await cached(cacheKey, CACHE_TTL.K8S_RESOURCES_SEC, () =>
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
        handleK8sError(error, 'list services')
      }
    }),

  listDetail: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const cacheKey = `${CACHE_KEYS.k8sServices(input.clusterId)}:detail`

        const response = await cached(cacheKey, CACHE_TTL.K8S_RESOURCES_SEC, () =>
          coreV1.listServiceForAllNamespaces(),
        )

        return response.items.map((svc) => ({
          name: svc.metadata?.name ?? '',
          namespace: svc.metadata?.namespace ?? '',
          type: svc.spec?.type ?? 'ClusterIP',
          clusterIP: svc.spec?.clusterIP ?? null,
          ports: mapPorts(svc.spec?.ports),
          createdAt: svc.metadata?.creationTimestamp
            ? new Date(svc.metadata.creationTimestamp as unknown as string).toISOString()
            : null,
          selector: (svc.spec?.selector as Record<string, string>) ?? {},
          externalTrafficPolicy: svc.spec?.externalTrafficPolicy ?? null,
          sessionAffinity: svc.spec?.sessionAffinity ?? 'None',
          loadBalancerIngress: (svc.status?.loadBalancer?.ingress ?? []).map((ing) => ({
            ip: ing.ip ?? null,
            hostname: ing.hostname ?? null,
          })),
          healthCheckNodePort: svc.spec?.healthCheckNodePort ?? null,
        }))
      } catch (error) {
        handleK8sError(error, 'list services detail')
      }
    }),

  get: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), name: z.string(), namespace: z.string() }))
    .output(serviceSummarySchema)
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const svc = await coreV1.readNamespacedService({
          name: input.name,
          namespace: input.namespace,
        })

        return {
          name: svc.metadata?.name ?? '',
          namespace: svc.metadata?.namespace ?? '',
          type: svc.spec?.type ?? 'ClusterIP',
          clusterIP: svc.spec?.clusterIP ?? null,
          ports: mapPorts(svc.spec?.ports),
          createdAt: svc.metadata?.creationTimestamp ?? null,
        }
      } catch (error) {
        handleK8sError(error, 'get service')
      }
    }),

  describe: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), name: z.string(), namespace: z.string() }))
    .output(serviceDetailSchema)
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const svc = await coreV1.readNamespacedService({
          name: input.name,
          namespace: input.namespace,
        })

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
        handleK8sError(error, 'describe service')
      }
    }),
})
