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

export const cronJobsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const batchV1 = kc.makeApiClient(k8s.BatchV1Api)

        const response = await cached(`k8s:${input.clusterId}:cronjobs`, 15, () =>
          batchV1.listCronJobForAllNamespaces(),
        )

        return response.items.map((cj) => {
          const lastSchedule = cj.status?.lastScheduleTime
            ? new Date(cj.status.lastScheduleTime as unknown as string).toISOString()
            : null
          const lastSuccess = cj.status?.lastSuccessfulTime
            ? new Date(cj.status.lastSuccessfulTime as unknown as string).toISOString()
            : null

          return {
            name: cj.metadata?.name ?? '',
            namespace: cj.metadata?.namespace ?? '',
            schedule: cj.spec?.schedule ?? '—',
            suspend: cj.spec?.suspend ?? false,
            lastScheduleTime: lastSchedule,
            lastSuccessfulTime: lastSuccess,
            age: computeAge(cj.metadata?.creationTimestamp),
            timezone: cj.spec?.timeZone ?? null,
            concurrencyPolicy: cj.spec?.concurrencyPolicy ?? 'Allow',
            startingDeadlineSeconds: cj.spec?.startingDeadlineSeconds ?? null,
            successfulJobsHistoryLimit: cj.spec?.successfulJobsHistoryLimit ?? 3,
            failedJobsHistoryLimit: cj.spec?.failedJobsHistoryLimit ?? 1,
            activeJobs: (cj.status?.active ?? []).length,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list cronjobs')
      }
    }),
})
