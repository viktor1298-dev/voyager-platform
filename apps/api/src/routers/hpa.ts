import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { authorizedProcedure, router } from '../trpc.js'

function computeAge(ts: Date | string | undefined): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export const hpaRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const autoscalingV2 = kc.makeApiClient(k8s.AutoscalingV2Api)

        const response = await cached(`k8s:${input.clusterId}:hpa`, 15, () =>
          autoscalingV2.listHorizontalPodAutoscalerForAllNamespaces(),
        )

        return response.items.map((hpa) => {
          const ref = hpa.spec?.scaleTargetRef
          const refStr = ref ? `${ref.kind}/${ref.name}` : '—'

          const metrics = (hpa.spec?.metrics ?? []).map((m) => {
            if (m.type === 'Resource' && m.resource) {
              const current = (hpa.status?.currentMetrics ?? []).find(
                (cm) => cm.type === 'Resource' && cm.resource?.name === m.resource?.name,
              )
              return {
                type: 'Resource' as const,
                name: m.resource.name ?? '',
                targetType: m.resource.target?.type ?? 'Utilization',
                targetValue:
                  m.resource.target?.averageUtilization ?? m.resource.target?.averageValue ?? '—',
                currentValue:
                  current?.resource?.current?.averageUtilization ??
                  current?.resource?.current?.averageValue ??
                  null,
              }
            }
            return {
              type: (m.type ?? 'Unknown') as string,
              name: ((m as unknown as Record<string, unknown>)['name'] as string) ?? 'custom',
              targetType: 'Value',
              targetValue: '—' as string | number,
              currentValue: null as string | number | null,
            }
          })

          const conditions = (hpa.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          }))

          const behavior = hpa.spec?.behavior
          const scaleUp =
            behavior?.scaleUp?.policies?.map((p) => ({
              type: p.type ?? '',
              value: p.value ?? 0,
              periodSeconds: p.periodSeconds ?? 0,
            })) ?? []
          const scaleDown =
            behavior?.scaleDown?.policies?.map((p) => ({
              type: p.type ?? '',
              value: p.value ?? 0,
              periodSeconds: p.periodSeconds ?? 0,
            })) ?? []

          return {
            name: hpa.metadata?.name ?? '',
            namespace: hpa.metadata?.namespace ?? '',
            reference: refStr,
            minReplicas: hpa.spec?.minReplicas ?? 1,
            maxReplicas: hpa.spec?.maxReplicas ?? 0,
            currentReplicas: hpa.status?.currentReplicas ?? 0,
            desiredReplicas: hpa.status?.desiredReplicas ?? 0,
            age: computeAge(hpa.metadata?.creationTimestamp),
            metrics,
            conditions,
            scaleUpPolicies: scaleUp,
            scaleDownPolicies: scaleDown,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list hpa')
      }
    }),
})
