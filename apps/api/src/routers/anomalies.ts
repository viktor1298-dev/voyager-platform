import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { AnomalyService } from '../services/anomaly-service.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const severitySchema = z.enum(['critical', 'warning', 'info'])

const configureRuleSchema = z.object({
  metric: z.enum([
    'cpu_spike_percent',
    'cpu_spike_minutes',
    'memory_pressure_percent',
    'pod_restart_storm_count',
    'pod_restart_storm_minutes',
    'event_flood_count',
    'event_flood_minutes',
    'deployment_stuck_minutes',
  ]),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']).default('gt'),
  threshold: z.number().finite(),
  severity: severitySchema.default('warning'),
  enabled: z.boolean().default(true),
})

export const anomaliesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const service = new AnomalyService(ctx.db)
      return service.list(input.clusterId, input.page, input.pageSize)
    }),

  acknowledge: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const service = new AnomalyService(ctx.db)
      const updated = await service.acknowledge(input.id)

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Anomaly not found or already acknowledged' })
      }

      await logAudit(ctx, 'anomaly.acknowledge', 'anomaly', input.id, {
        acknowledgedAt: updated.acknowledgedAt,
      })

      return updated
    }),

  configure: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        rules: z.array(configureRuleSchema).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = new AnomalyService(ctx.db)
      const configured = await service.configure(input.clusterId, input.rules)

      await logAudit(ctx, 'anomaly.configure', 'cluster', input.clusterId, {
        rulesCount: configured.length,
      })

      return {
        clusterId: input.clusterId,
        rules: configured,
      }
    }),
})
