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

function computeDuration(start?: Date | string, end?: Date | string): string | null {
  if (!start) return null
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const diff = endMs - startMs
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export const jobsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const batchV1 = kc.makeApiClient(k8s.BatchV1Api)

        const response = await cached(`k8s:${input.clusterId}:jobs`, 15, () =>
          batchV1.listJobForAllNamespaces(),
        )

        return response.items.map((job) => {
          const succeeded = job.status?.succeeded ?? 0
          const failed = job.status?.failed ?? 0
          const active = job.status?.active ?? 0
          const completions = job.spec?.completions ?? 1

          let status: string
          if (succeeded >= completions) status = 'Complete'
          else if (failed > 0 && active === 0) status = 'Failed'
          else if (active > 0) status = 'Running'
          else status = 'Pending'

          const conditions = (job.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          }))

          return {
            name: job.metadata?.name ?? '',
            namespace: job.metadata?.namespace ?? '',
            status,
            completions: `${succeeded}/${completions}`,
            succeeded,
            failed,
            active,
            parallelism: job.spec?.parallelism ?? 1,
            completionsTotal: completions,
            backoffLimit: job.spec?.backoffLimit ?? 6,
            activeDeadlineSeconds: job.spec?.activeDeadlineSeconds ?? null,
            ttlSecondsAfterFinished: job.spec?.ttlSecondsAfterFinished ?? null,
            startTime: job.status?.startTime
              ? new Date(job.status.startTime as unknown as string).toISOString()
              : null,
            completionTime: job.status?.completionTime
              ? new Date(job.status.completionTime as unknown as string).toISOString()
              : null,
            duration: computeDuration(
              job.status?.startTime as unknown as string,
              job.status?.completionTime as unknown as string,
            ),
            age: computeAge(job.metadata?.creationTimestamp),
            conditions,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list jobs')
      }
    }),
})
