import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'
import { getCoreV1Api } from '../lib/k8s'

export const logsRouter = router({
  pods: protectedProcedure
    .input(z.object({ namespace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const coreApi = getCoreV1Api()
      const ns = input?.namespace
      const response = ns
        ? await coreApi.listNamespacedPod({ namespace: ns })
        : await coreApi.listPodForAllNamespaces()

      return (response.items ?? []).map((pod) => ({
        name: pod.metadata?.name ?? '',
        namespace: pod.metadata?.namespace ?? '',
        status: pod.status?.phase ?? 'Unknown',
        containers: (pod.spec?.containers ?? []).map((c) => c.name),
      }))
    }),

  get: protectedProcedure
    .input(
      z.object({
        podName: z.string(),
        namespace: z.string(),
        container: z.string().optional(),
        tailLines: z.number().int().positive().default(100),
      }),
    )
    .query(async ({ input }) => {
      const coreApi = getCoreV1Api()
      const response = await coreApi.readNamespacedPodLog({
        name: input.podName,
        namespace: input.namespace,
        container: input.container,
        tailLines: input.tailLines,
      })
      return { logs: typeof response === 'string' ? response : String(response) }
    }),
})
