import { events } from '@voyager/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { adminProcedure, protectedProcedure, router } from '../trpc'

export const eventsRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/api/events', protect: true, tags: ['events'] } })
    .input(
      z.object({
        clusterId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(events)
        .where(input.clusterId ? eq(events.clusterId, input.clusterId) : undefined)
        .orderBy(desc(events.timestamp))
        .limit(input.limit)
        .offset(input.offset)
      return rows
    }),

  create: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        namespace: z.string().max(255).optional(),
        kind: z.enum(['Warning', 'Normal']),
        reason: z.string().max(255).optional(),
        message: z.string().optional(),
        source: z.string().max(255).optional(),
        involvedObject: z.record(z.unknown()).optional(),
        timestamp: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const values = {
        ...input,
        timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
      }
      const [created] = await ctx.db.insert(events).values(values).returning()
      return created
    }),

  stats: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const rows = await ctx.db
        .select({
          kind: events.kind,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(and(eq(events.clusterId, input.clusterId), gte(events.timestamp, since)))
        .groupBy(events.kind)
      const result: Record<string, number> = { Normal: 0, Warning: 0 }
      for (const row of rows) {
        result[row.kind] = row.count
      }
      return result
    }),
})
