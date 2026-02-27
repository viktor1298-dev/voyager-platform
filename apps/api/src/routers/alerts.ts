import { alertHistory, alerts } from '@voyager/db'
import { TRPCError } from '@trpc/server'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const METRIC_VALUES = ['cpu', 'memory', 'pods', 'restarts'] as const
const OPERATOR_VALUES = ['gt', 'lt', 'eq'] as const

const createAlertSchema = z.object({
  name: z.string().min(1).max(255),
  metric: z.enum(METRIC_VALUES),
  operator: z.enum(OPERATOR_VALUES),
  threshold: z.number(),
  clusterFilter: z.string().max(255).optional(),
  webhookUrl: z.string().url().max(1000).nullable().optional(),
})

const updateAlertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  metric: z.enum(METRIC_VALUES).optional(),
  operator: z.enum(OPERATOR_VALUES).optional(),
  threshold: z.number().optional(),
  clusterFilter: z.string().max(255).nullable().optional(),
  enabled: z.boolean().optional(),
  webhookUrl: z.string().url().max(1000).nullable().optional(),
})

export const alertsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(alerts).orderBy(desc(alerts.createdAt))
  }),

  create: adminProcedure.input(createAlertSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(alerts)
      .values({
        name: input.name,
        metric: input.metric,
        operator: input.operator,
        threshold: String(input.threshold),
        clusterFilter: input.clusterFilter ?? null,
        webhookUrl: input.webhookUrl ?? null,
      })
      .returning()
    await logAudit(ctx, 'alert.create', 'alert', created.id, { name: input.name })
    return created
  }),

  update: adminProcedure.input(updateAlertSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const updateData: Record<string, unknown> = {}
    if (fields.name !== undefined) updateData.name = fields.name
    if (fields.metric !== undefined) updateData.metric = fields.metric
    if (fields.operator !== undefined) updateData.operator = fields.operator
    if (fields.threshold !== undefined) updateData.threshold = String(fields.threshold)
    if (fields.clusterFilter !== undefined) updateData.clusterFilter = fields.clusterFilter
    if (fields.enabled !== undefined) updateData.enabled = fields.enabled
    if (fields.webhookUrl !== undefined) updateData.webhookUrl = fields.webhookUrl

    const [updated] = await ctx.db
      .update(alerts)
      .set(updateData)
      .where(eq(alerts.id, id))
      .returning()
    await logAudit(ctx, 'alert.update', 'alert', id, fields)
    return updated
  }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(alerts).where(eq(alerts.id, input.id))
      await logAudit(ctx, 'alert.delete', 'alert', input.id)
      return { success: true }
    }),

  evaluate: adminProcedure.mutation(async ({ ctx }) => {
    const enabledAlerts = await ctx.db.select().from(alerts).where(eq(alerts.enabled, true))
    return { alerts: enabledAlerts, count: enabledAlerts.length }
  }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50
      return ctx.db.select().from(alertHistory).orderBy(desc(alertHistory.triggeredAt)).limit(limit)
    }),

  acknowledge: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(alertHistory)
        .set({ acknowledged: true })
        .where(eq(alertHistory.id, input.id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Alert history entry not found' })
      await logAudit(ctx, 'alert.acknowledge', 'alertHistory', input.id)
      return updated
    }),

  unacknowledgedCount: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(alertHistory).where(eq(alertHistory.acknowledged, false))
    return result[0]?.count ?? 0
  }),
})
