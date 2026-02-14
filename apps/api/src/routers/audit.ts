import { auditLog } from '@voyager/db'
import { and, count, desc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { adminProcedure, protectedProcedure, router } from '../trpc'

export const auditRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: 'GET', path: '/api/audit', protect: true, tags: ['audit'] } })
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
        action: z.string().max(100).optional(),
        resource: z.string().max(100).optional(),
        userId: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1
      const limit = input?.limit ?? 50
      const offset = (page - 1) * limit

      const conditions = []
      if (input?.action) conditions.push(eq(auditLog.action, input.action))
      if (input?.resource) conditions.push(eq(auditLog.resource, input.resource))
      if (input?.userId) conditions.push(eq(auditLog.userId, input.userId))
      if (input?.from) conditions.push(gte(auditLog.timestamp, new Date(input.from)))
      if (input?.to) conditions.push(lte(auditLog.timestamp, new Date(input.to)))

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const [rows, totalResult] = await Promise.all([
        ctx.db
          .select()
          .from(auditLog)
          .where(where)
          .orderBy(desc(auditLog.timestamp))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ count: count() })
          .from(auditLog)
          .where(where),
      ])

      const total = totalResult[0]?.count ?? 0

      return { items: rows, page, limit, total }
    }),

  getByResource: protectedProcedure
    .input(z.object({ resourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.resourceId, input.resourceId))
        .orderBy(desc(auditLog.timestamp))
    }),
})
