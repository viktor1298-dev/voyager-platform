import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { getCoreV1Api } from '../lib/k8s.js'
import { adminProcedure, router } from '../trpc.js'

export const podsRouter = router({
  delete: adminProcedure
    .input(z.object({
      namespace: z.string(),
      podName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const coreApi = getCoreV1Api()
        await coreApi.deleteNamespacedPod({ name: input.podName, namespace: input.namespace })
        await logAudit(ctx, 'pod.delete', 'pod', `${input.namespace}/${input.podName}`, {
          namespace: input.namespace,
          podName: input.podName,
        })
        return { success: true, podName: input.podName }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete pod ${input.podName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
