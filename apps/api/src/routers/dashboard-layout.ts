import { dashboardLayouts } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc.js'

const widgetSchema = z.object({
  id: z.string(),
  type: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const layoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  minH: z.number().optional(),
})

const saveLayoutSchema = z.object({
  widgets: z.array(widgetSchema),
  layouts: z.record(z.string(), z.array(layoutItemSchema)),
})

export const dashboardLayoutRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.userId, ctx.user.id))
      .limit(1)
    return row?.layout ?? null
  }),

  save: protectedProcedure.input(saveLayoutSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .insert(dashboardLayouts)
      .values({
        userId: ctx.user.id,
        layout: input as { widgets: unknown[]; layouts: Record<string, unknown[]> },
      })
      .onConflictDoUpdate({
        target: dashboardLayouts.userId,
        set: {
          layout: input as { widgets: unknown[]; layouts: Record<string, unknown[]> },
          updatedAt: new Date(),
        },
      })
      .returning()
    return row
  }),
})
