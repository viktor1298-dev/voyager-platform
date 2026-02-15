import {
  karpenterEC2NodeClassSchema,
  karpenterMetricsSchema,
  karpenterNodePoolSchema,
  karpenterTopologySchema,
} from '@voyager/types'
import { z } from 'zod'
import { createKarpenterService } from '../lib/karpenter-service.js'
import { authorizedProcedure, router } from '../trpc.js'

const clusterInputSchema = z.object({ clusterId: z.string().uuid() })

export const karpenterRouter = router({
  listNodePools: authorizedProcedure('cluster', 'viewer')
    .meta({
      openapi: {
        method: 'GET',
        path: '/api/karpenter/{clusterId}/nodepools',
        protect: true,
        tags: ['karpenter'],
      },
    })
    .input(clusterInputSchema)
    .output(z.array(karpenterNodePoolSchema))
    .query(async ({ ctx, input }) => {
      const service = createKarpenterService(ctx.db)
      return service.listNodePools(input.clusterId)
    }),

  listEC2NodeClasses: authorizedProcedure('cluster', 'viewer')
    .meta({
      openapi: {
        method: 'GET',
        path: '/api/karpenter/{clusterId}/ec2nodeclasses',
        protect: true,
        tags: ['karpenter'],
      },
    })
    .input(clusterInputSchema)
    .output(z.array(karpenterEC2NodeClassSchema))
    .query(async ({ ctx, input }) => {
      const service = createKarpenterService(ctx.db)
      return service.listEC2NodeClasses(input.clusterId)
    }),

  getMetrics: authorizedProcedure('cluster', 'viewer')
    .meta({
      openapi: {
        method: 'GET',
        path: '/api/karpenter/{clusterId}/metrics',
        protect: true,
        tags: ['karpenter'],
      },
    })
    .input(clusterInputSchema)
    .output(karpenterMetricsSchema)
    .query(async ({ ctx, input }) => {
      const service = createKarpenterService(ctx.db)
      return service.getMetrics(input.clusterId)
    }),

  getTopology: authorizedProcedure('cluster', 'viewer')
    .meta({
      openapi: {
        method: 'GET',
        path: '/api/karpenter/{clusterId}/topology',
        protect: true,
        tags: ['karpenter'],
      },
    })
    .input(clusterInputSchema)
    .output(karpenterTopologySchema)
    .query(async ({ ctx, input }) => {
      const service = createKarpenterService(ctx.db)
      return service.getTopology(input.clusterId)
    }),
})
