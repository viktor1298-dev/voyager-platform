import { z } from 'zod'
import { resolveRelations } from '../lib/relation-resolver.js'
import { watchManager } from '../lib/watch-manager.js'
import { protectedProcedure, router } from '../trpc.js'

export const relationsRouter = router({
  forResource: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        kind: z.string(),
        namespace: z.string(),
        name: z.string(),
      }),
    )
    .query(({ input }) => {
      const groups = resolveRelations(watchManager, input)
      return { groups }
    }),
})
