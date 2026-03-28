import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import { TRPCError } from '@trpc/server'
import { LIMITS } from '@voyager/config'
import { webhookDeliveries, webhooks } from '@voyager/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { adminProcedure, router } from '../trpc.js'

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return !net.isIPv4(ip) // block non-IPv4 (incl. IPv6)
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0)
  )
}

async function validateWebhookUrl(url: string): Promise<void> {
  const parsed = new URL(url)
  const hostname = parsed.hostname
  if (hostname === 'localhost' || hostname === '[::1]') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Webhook URL cannot target localhost' })
  }
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Webhook URL cannot target private/internal IPs',
      })
    }
    return
  }
  // Resolve DNS and check resolved IPs
  const { address } = await dns.lookup(hostname)
  if (isPrivateIP(address)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Webhook URL resolves to a private/internal IP',
    })
  }
}

export const webhooksRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(webhooks).orderBy(desc(webhooks.createdAt))
    const result = await Promise.all(
      rows.map(async (w) => {
        const deliveries = await ctx.db
          .select()
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.webhookId, w.id))
          .orderBy(desc(webhookDeliveries.deliveredAt))
          .limit(10)
        const total = deliveries.length
        const successes = deliveries.filter((d) => d.success).length
        const { secret: _secret, ...safeWebhook } = w
        return {
          ...safeWebhook,
          secret: w.secret ? 'wh_****' : null,
          deliveries,
          successRate: total > 0 ? Math.round((successes / total) * 100) : 100,
        }
      }),
    )
    return result
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(LIMITS.NAME_MAX).optional().default('Webhook'),
        url: z.string().url().max(LIMITS.URL_MAX),
        secret: z.string().max(LIMITS.NAME_MAX).nullable().optional(),
        events: z.array(z.string()).min(1),
        active: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(webhooks)
        .values({
          name: input.name,
          url: input.url,
          secret: input.secret ?? null,
          events: input.events,
          enabled: input.active,
        })
        .returning()
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

      await validateWebhookUrl(webhook.url)

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'Test delivery from Voyager Platform' },
      }

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (webhook.secret) {
          const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(JSON.stringify(testPayload))
            .digest('hex')
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
