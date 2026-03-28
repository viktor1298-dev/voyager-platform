import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { authorizedProcedure, router } from '../trpc.js'

export const ingressesRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api)

        const response = await cached(`k8s:${input.clusterId}:ingresses`, 15_000, () =>
          networkingV1.listIngressForAllNamespaces(),
        )

        return response.items.map((ing) => {
          const rules = (ing.spec?.rules ?? []).map((rule) => ({
            host: rule.host ?? '*',
            paths: (rule.http?.paths ?? []).map((p) => ({
              path: p.path ?? '/',
              pathType: p.pathType ?? 'Prefix',
              serviceName: p.backend?.service?.name ?? '',
              servicePort: p.backend?.service?.port?.number ?? p.backend?.service?.port?.name ?? '',
            })),
          }))

          const tls = (ing.spec?.tls ?? []).map((t) => ({
            hosts: t.hosts ?? [],
            secretName: t.secretName ?? '',
          }))

          const hosts = rules.map((r) => r.host).filter((h) => h !== '*')

          return {
            name: ing.metadata?.name ?? '',
            namespace: ing.metadata?.namespace ?? '',
            ingressClassName: ing.spec?.ingressClassName ?? null,
            hosts,
            ports: tls.length > 0 ? '80, 443' : '80',
            createdAt: ing.metadata?.creationTimestamp
              ? new Date(ing.metadata.creationTimestamp as unknown as string).toISOString()
              : null,
            rules,
            tls,
            annotations: (ing.metadata?.annotations as Record<string, string>) ?? {},
            defaultBackend: ing.spec?.defaultBackend
              ? {
                  serviceName: ing.spec.defaultBackend.service?.name ?? '',
                  servicePort:
                    ing.spec.defaultBackend.service?.port?.number ??
                    ing.spec.defaultBackend.service?.port?.name ??
                    '',
                }
              : null,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list ingresses')
      }
    }),
})
