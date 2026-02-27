import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { webhooks, webhookDeliveries } from '@voyager/db'
import { desc, eq } from 'drizzle-orm'
import { logAudit } from '../lib/audit.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'
import crypto from 'node:crypto'

export const webhooksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(webhooks).orderBy(desc(webhooks.createdAt))
    const result = await Promise.all(rows.map(async (w) => {
      const deliveries = await ctx.db.select().from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, w.id))
        .orderBy(desc(webhookDeliveries.deliveredAt))
        .limit(10)
      const total = deliveries.length
      const successes = deliveries.filter(d => d.success).length
      return {
        ...w,
        deliveries,
        successRate: total > 0 ? Math.round((successes / total) * 100) : 100,
      }
    }))
    return result
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255).optional().default('Webhook'),
      url: z.string().url().max(1000),
      secret: z.string().max(255).nullable().optional(),
      events: z.array(z.string()).min(1),
      active: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(webhooks).values({
        name: input.name,
        url: input.url,
        secret: input.secret ?? null,
        events: input.events,
        enabled: input.active,
      }).returning()
      await logAudit(ctx, 'webhook.create', 'webhook', created.id, { url: input.url })
      return created
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(webhooks).where(eq(webhooks.id, input.id))
      await logAudit(ctx, 'webhook.delete', 'webhook', input.id)
      return { success: true }
    }),

  test: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [webhook] = await ctx.db.select().from(webhooks).where(eq(webhooks.id, input.id))
      if (!webhook) throw new TRPCError({ code: 'NOT_FOUND', message: 'Webhook not found' })

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'Test delivery from Voyager Platform' },
      }

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (webhook.secret) {
          const signature = crypto.createHmac('sha256', webhook.secret)
            .update(JSON.stringify(testPayload)).digest('hex')
          headers['X-Webhook-Signature'] = signature
        }

        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10000),
        })

        await ctx.db.insert(webhookDeliveries).values({
          webhookId: webhook.id,
          event: 'webhook.test',
          payload: testPayload,
          responseStatus: String(res.status),
          success: res.ok,
        })

        return { success: res.ok, status: res.status }
      } catch (err) {
        await ctx.db.insert(webhookDeliveries).values({
          webhookId: webhook.id,
          event: 'webhook.test',
          payload: testPayload,
          responseStatus: 'error',
          success: false,
        })
        return { success: false, status: 0, error: err instanceof Error ? err.message : 'Unknown' }
      }
    }),
})
