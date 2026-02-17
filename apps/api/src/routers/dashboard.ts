import { TRPCError } from '@trpc/server'
import { type Database, dashboardCollaborators, sharedDashboards } from '@voyager/db'
import { and, desc, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc.js'

const dashboardConfigSchema = z.object({
  layout: z.unknown().optional(),
  widgets: z.unknown().optional(),
  filters: z.unknown().optional(),
})

const visibilitySchema = z.enum(['private', 'team', 'public'])
const collaboratorRoleSchema = z.enum(['viewer', 'editor', 'owner'])

const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  config: dashboardConfigSchema,
  visibility: visibilitySchema.default('private'),
})

const getDashboardSchema = z.object({
  id: z.string().uuid(),
})

const updateDashboardSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  config: dashboardConfigSchema.optional(),
  visibility: visibilitySchema.optional(),
})

const shareDashboardSchema = z.object({
  dashboardId: z.string().uuid(),
  userId: z.string().min(1),
  role: collaboratorRoleSchema.default('viewer'),
})

const deleteDashboardSchema = z.object({
  id: z.string().uuid(),
})

async function getCollaboratorRole(db: Database, dashboardId: string, userId: string) {
  const [row] = await db
    .select({ role: dashboardCollaborators.role })
    .from(dashboardCollaborators)
    .where(and(eq(dashboardCollaborators.dashboardId, dashboardId), eq(dashboardCollaborators.userId, userId)))
    .limit(1)
  return row?.role ?? null
}

export const dashboardRouter = router({
  create: protectedProcedure.input(createDashboardSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(sharedDashboards)
      .values({
        name: input.name,
        description: input.description ?? null,
        createdBy: ctx.user.id,
        config: input.config,
        visibility: input.visibility,
      })
      .returning()

    await ctx.db.insert(dashboardCollaborators).values({
      dashboardId: created.id,
      userId: ctx.user.id,
      role: 'owner',
    })

    return created
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(sharedDashboards)
      .leftJoin(
        dashboardCollaborators,
        and(
          eq(dashboardCollaborators.dashboardId, sharedDashboards.id),
          eq(dashboardCollaborators.userId, ctx.user.id),
        ),
      )
      .where(
        or(
          eq(sharedDashboards.createdBy, ctx.user.id),
          eq(dashboardCollaborators.userId, ctx.user.id),
          eq(sharedDashboards.visibility, 'team'),
          eq(sharedDashboards.visibility, 'public'),
        ),
      )
      .orderBy(desc(sharedDashboards.updatedAt))
      .then((rows) => rows.map((row) => row.shared_dashboards))
  }),

  get: protectedProcedure.input(getDashboardSchema).query(async ({ ctx, input }) => {
    const [dashboard] = await ctx.db
      .select()
      .from(sharedDashboards)
      .where(eq(sharedDashboards.id, input.id))
      .limit(1)

    if (!dashboard) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard not found' })
    }

    const role = await getCollaboratorRole(ctx.db, input.id, ctx.user.id)
    const isAllowed =
      dashboard.createdBy === ctx.user.id ||
      role !== null ||
      dashboard.visibility === 'team' ||
      dashboard.visibility === 'public'

    if (!isAllowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this dashboard' })
    }

    return dashboard
  }),

  update: protectedProcedure.input(updateDashboardSchema).mutation(async ({ ctx, input }) => {
    const [dashboard] = await ctx.db
      .select()
      .from(sharedDashboards)
      .where(eq(sharedDashboards.id, input.id))
      .limit(1)

    if (!dashboard) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard not found' })
    }

    const role = await getCollaboratorRole(ctx.db, input.id, ctx.user.id)
    const isOwner = dashboard.createdBy === ctx.user.id || role === 'owner'
    const isEditor = role === 'editor'

    if (!isOwner && !isEditor) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only owners and editors can update dashboard' })
    }

    if ((input.visibility !== undefined || input.name !== undefined || input.description !== undefined) && !isOwner) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only owner can update visibility, name, or description',
      })
    }

    if (input.config === undefined && !isOwner) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Editors can only update config' })
    }

    const { id, ...fields } = input
    const [updated] = await ctx.db
      .update(sharedDashboards)
      .set({
        ...fields,
        updatedAt: new Date(),
      })
      .where(eq(sharedDashboards.id, id))
      .returning()

    return updated
  }),

  share: protectedProcedure.input(shareDashboardSchema).mutation(async ({ ctx, input }) => {
    const [dashboard] = await ctx.db
      .select()
      .from(sharedDashboards)
      .where(eq(sharedDashboards.id, input.dashboardId))
      .limit(1)

    if (!dashboard) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard not found' })
    }

    const role = await getCollaboratorRole(ctx.db, input.dashboardId, ctx.user.id)
    const isOwner = dashboard.createdBy === ctx.user.id || role === 'owner'

    if (!isOwner) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only owner can share dashboard' })
    }

    const [collaborator] = await ctx.db
      .insert(dashboardCollaborators)
      .values({
        dashboardId: input.dashboardId,
        userId: input.userId,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: [dashboardCollaborators.dashboardId, dashboardCollaborators.userId],
        set: { role: input.role },
      })
      .returning()

    return collaborator
  }),

  delete: protectedProcedure.input(deleteDashboardSchema).mutation(async ({ ctx, input }) => {
    const [dashboard] = await ctx.db
      .select()
      .from(sharedDashboards)
      .where(eq(sharedDashboards.id, input.id))
      .limit(1)

    if (!dashboard) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard not found' })
    }

    const role = await getCollaboratorRole(ctx.db, input.id, ctx.user.id)
    const isOwner = dashboard.createdBy === ctx.user.id || role === 'owner'

    if (!isOwner) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only owner can delete dashboard' })
    }

    await ctx.db.delete(sharedDashboards).where(eq(sharedDashboards.id, input.id))
    return { success: true }
  }),
})
