import type * as k8s from '@kubernetes/client-node'
import { LIMITS } from '@voyager/config'
import { events } from '@voyager/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { mapEvent } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const eventSchema = z
  .object({
    id: z.string(),
    clusterId: z.string(),
    namespace: z.string().nullable().optional(),
    kind: z.string(),
    reason: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    involvedObject: z.unknown().nullable().optional(),
    timestamp: z.union([z.string(), z.date()]),
  })
  .passthrough()

export const eventsRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/api/events', protect: true, tags: ['events'] } })
    .input(
      z
        .object({
          clusterId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional()
        .default({}),
    )
    .output(z.array(eventSchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(events)
        .where(input.clusterId ? eq(events.clusterId, input.clusterId) : undefined)
        .orderBy(desc(events.timestamp))
        .limit(input.limit ?? 50)
        .offset(input.offset ?? 0)

      return Array.isArray(rows) ? rows : []
    }),

  create: adminProcedure
    .meta({ openapi: { method: 'POST', path: '/api/events', protect: true, tags: ['events'] } })
    .input(
      z.object({
        clusterId: z.string().uuid(),
        namespace: z.string().max(LIMITS.NAME_MAX).optional(),
        kind: z.enum(['Warning', 'Normal']),
        reason: z.string().max(LIMITS.NAME_MAX).optional(),
        message: z.string().optional(),
        source: z.string().max(LIMITS.NAME_MAX).optional(),
        involvedObject: z.record(z.string(), z.string()).optional(),
        timestamp: z.string().datetime().optional(),
      }),
    )
    .output(eventSchema)
    .mutation(async ({ ctx, input }) => {
      const values = {
        ...input,
        timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
      }
      const [created] = await ctx.db.insert(events).values(values).returning()
      return created
    }),

  listLive: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ input }) => {
      // Read live K8s events from WatchManager in-memory store
      if (watchManager.isWatching(input.clusterId)) {
        const rawEvents = watchManager.getResources(input.clusterId, 'events') as k8s.CoreV1Event[]
        const mapped = rawEvents.map((e) => mapEvent(e))
        // Sort by timestamp descending and limit
        mapped.sort((a, b) => {
          const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0
          return bTime - aTime
        })
        return mapped.slice(0, input.limit ?? 50)
      }
      return []
    }),

  stats: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/api/events/stats/{clusterId}',
        protect: true,
        tags: ['events'],
      },
    })
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(z.object({ Normal: z.number().int(), Warning: z.number().int() }))
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
      return { Normal: result.Normal, Warning: result.Warning }
    }),
})
