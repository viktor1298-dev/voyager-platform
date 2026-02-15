import { ssoProviders } from '@voyager/db'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { adminProcedure, publicProcedure, router } from '../trpc.js'
import { getPublicSsoProviders, testEntraDiscovery, upsertEntraSsoConfig } from '../lib/sso.js'

const microsoftConfigSchema = z.object({
  provider: z.literal('microsoft'),
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  groupMappings: z.record(z.string(), z.string().uuid()).optional(),
})

export const ssoRouter = router({
  getProviders: publicProcedure.query(async ({ ctx }) => {
    return getPublicSsoProviders(ctx.db)
  }),

  configure: adminProcedure.input(microsoftConfigSchema).mutation(async ({ ctx, input }) => {
    const current = await ctx.db
      .select({ encryptedClientSecret: ssoProviders.encryptedClientSecret })
      .from(ssoProviders)
      .where(eq(ssoProviders.providerType, 'microsoft-entra-id'))
      .limit(1)

    if (!input.clientSecret && !current[0]?.encryptedClientSecret) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'clientSecret is required for initial provider setup' })
    }

    const saved = await upsertEntraSsoConfig(ctx.db, {
      tenantId: input.tenantId,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      enabled: input.enabled,
      groupMappings: input.groupMappings,
    })

    return {
      id: saved.id,
      provider: 'microsoft',
      enabled: saved.enabled,
    }
  }),

  testConnection: adminProcedure
    .input(
      z
        .object({
          provider: z.literal('microsoft').default('microsoft'),
          tenantId: z.string().min(1).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId =
        input?.tenantId ??
        (
          await ctx.db
            .select({ tenantId: ssoProviders.tenantId })
            .from(ssoProviders)
            .where(eq(ssoProviders.providerType, 'microsoft-entra-id'))
            .limit(1)
        )[0]?.tenantId

      if (!tenantId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No tenantId provided or configured' })
      }

      return testEntraDiscovery(tenantId)
    }),
})
