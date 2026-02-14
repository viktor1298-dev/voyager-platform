import { TRPCError } from '@trpc/server'
import { nodes } from '@voyager/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { publicProcedure, protectedProcedure, router } from '../trpc'

export const nodesRouter = router({
  list: publicProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(nodes).where(eq(nodes.clusterId, input.clusterId))
    }),

  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [node] = await ctx.db.select().from(nodes).where(eq(nodes.id, input.id))
    if (!node) throw new TRPCError({ code: 'NOT_FOUND', message: 'Node not found' })
    return node
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string().min(1).max(255),
        status: z.string().max(50).optional(),
        role: z.string().max(50).optional(),
        cpuCapacity: z.number().int().optional(),
        cpuAllocatable: z.number().int().optional(),
        memoryCapacity: z.number().optional(),
        memoryAllocatable: z.number().optional(),
        podsCount: z.number().int().optional(),
        k8sVersion: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(nodes)
        .where(and(eq(nodes.clusterId, input.clusterId), eq(nodes.name, input.name)))
      if (existing.length > 0) {
        const [updated] = await ctx.db
          .update(nodes)
          .set(input)
          .where(eq(nodes.id, existing[0].id))
          .returning()
        return updated
      }
      const [created] = await ctx.db.insert(nodes).values(input).returning()
      return created
    }),
})
