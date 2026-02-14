import { TRPCError } from '@trpc/server'
import { featureFlags } from '@voyager/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { logAudit } from '../lib/audit'
import { getConfiguredFeatureFlags, getFeatureFlag } from '../lib/feature-flags'
import { adminProcedure, protectedProcedure, router } from '../trpc'

const featureGetSchema = z.object({
  name: z.string().min(1).max(100),
})

export const featuresRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const [dbFlags, configuredFlags] = await Promise.all([
      ctx.db.select().from(featureFlags).orderBy(desc(featureFlags.updatedAt)),
      getConfiguredFeatureFlags(),
    ])

    const dbFlagNames = new Set(dbFlags.map((flag) => flag.name))

    const configuredOnly = await Promise.all(
      Object.entries(configuredFlags)
        .filter(([name]) => !dbFlagNames.has(name))
        .map(async ([name, value]) => ({
          name,
          description: 'From environment or feature-flags.json',
          enabled: typeof value === 'boolean' ? value : Boolean(value),
          targeting: {},
          source: 'config' as const,
          resolvedValue: await getFeatureFlag(name, value),
        })),
    )

    return {
      items: [
        ...dbFlags.map((flag) => ({
          ...flag,
          source: 'database' as const,
          resolvedValue: flag.enabled,
        })),
        ...configuredOnly,
      ],
    }
  }),

  get: protectedProcedure.input(featureGetSchema).query(async ({ ctx, input }) => {
    const [dbFlag] = await ctx.db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.name, input.name))
      .limit(1)

    if (dbFlag) {
      return {
        name: dbFlag.name,
        description: dbFlag.description,
        source: 'database' as const,
        enabled: dbFlag.enabled,
        targeting: dbFlag.targeting,
      }
    }

    const configuredFlags = await getConfiguredFeatureFlags()
    const configuredValue = configuredFlags[input.name]

    if (configuredValue === undefined) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Feature flag \"${input.name}\" not found` })
    }

    const resolvedValue = await getFeatureFlag(input.name, configuredValue)

    return {
      name: input.name,
      description: 'From environment or feature-flags.json',
      source: 'config' as const,
      enabled: typeof resolvedValue === 'boolean' ? resolvedValue : Boolean(resolvedValue),
      value: resolvedValue,
      targeting: {},
    }
  }),

  update: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        enabled: z.boolean(),
        description: z.string().max(500).optional(),
        targeting: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.name, input.name))
        .limit(1)

      const payload = {
        description: input.description ?? existing?.description ?? null,
        enabled: input.enabled,
        targeting: input.targeting ?? existing?.targeting ?? {},
        updatedAt: new Date(),
      }

      const [saved] = existing
        ? await ctx.db
            .update(featureFlags)
            .set(payload)
            .where(eq(featureFlags.name, input.name))
            .returning()
        : await ctx.db
            .insert(featureFlags)
            .values({
              name: input.name,
              ...payload,
              createdAt: new Date(),
            })
            .returning()

      await logAudit(ctx, 'feature-flag.update', 'feature_flag', saved.id, {
        name: saved.name,
        previousEnabled: existing?.enabled,
        enabled: saved.enabled,
        targeting: saved.targeting,
      })

      return saved
    }),
})
