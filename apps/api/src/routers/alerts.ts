import { alerts, alertHistory } from '@voyager/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const METRIC_VALUES = ['cpu', 'memory', 'pods', 'restarts'] as const
const OPERATOR_VALUES = ['gt', 'lt', 'eq'] as const

const createAlertSchema = z.object({
  name: z.string().min(1).max(255),
  metric: z.enum(METRIC_VALUES),
  operator: z.enum(OPERATOR_VALUES),
  threshold: z.number(),
  clusterFilter: z.string().max(255).optional(),
})

const updateAlertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  metric: z.enum(METRIC_VALUES).optional(),
  operator: z.enum(OPERATOR_VALUES).optional(),
  threshold: z.number().optional(),
  clusterFilter: z.string().max(255).nullable().optional(),
  enabled: z.boolean().optional(),
})

export const alertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(alerts).orderBy(desc(alerts.createdAt))
  }),

  create: protectedProcedure.input(createAlertSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(alerts)
      .values({
        name: input.name,
        metric: input.metric,
        operator: input.operator,
        threshold: String(input.threshold),
        clusterFilter: input.clusterFilter ?? null,
      })
      .returning()
    return created
  }),

  update: protectedProcedure.input(updateAlertSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const updateData: Record<string, unknown> = {}
    if (fields.name !== undefined) updateData.name = fields.name
    if (fields.metric !== undefined) updateData.metric = fields.metric
    if (fields.operator !== undefined) updateData.operator = fields.operator
    if (fields.threshold !== undefined) updateData.threshold = String(fields.threshold)
    if (fields.clusterFilter !== undefined) updateData.clusterFilter = fields.clusterFilter
    if (fields.enabled !== undefined) updateData.enabled = fields.enabled

    const [updated] = await ctx.db.update(alerts).set(updateData).where(eq(alerts.id, id)).returning()
    return updated
  }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(alerts).where(eq(alerts.id, input.id))
    return { success: true }
  }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50
      return ctx.db.select().from(alertHistory).orderBy(desc(alertHistory.triggeredAt)).limit(limit)
    }),
})
