import { TRPCError } from '@trpc/server'
import { type Database, dashboardCollaborators, sharedDashboards } from '@voyager/db'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc.js'

const MAX_DASHBOARD_CONFIG_BYTES = 100_000
const DEFAULT_ORG_SCOPE_ID = 'org:default'
const MAX_LIST_LIMIT = 100
const DEFAULT_LIST_LIMIT = 20

const dashboardConfigSchema = z
  .object({
    layout: z.array(z.unknown()).optional(),
    widgets: z.array(z.unknown()).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const sizeInBytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    if (sizeInBytes > MAX_DASHBOARD_CONFIG_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Dashboard config too large (max ${MAX_DASHBOARD_CONFIG_BYTES} bytes)`,
      })
    }
  })

const visibilitySchema = z.enum(['private', 'team', 'public'])
const collaboratorRoleSchema = z.enum(['viewer', 'editor', 'owner'])

const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  config: dashboardConfigSchema,
  visibility: visibilitySchema.default('private'),
})

const listDashboardsSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
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

function getUserTeamScope(user: { id: string; organizationId?: string | null }) {
  return user.organizationId ?? DEFAULT_ORG_SCOPE_ID
}

export const dashboardRouter = router({
  create: protectedProcedure.input(createDashboardSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(sharedDashboards)
      .values({
        name: input.name,
        description: input.description ?? null,
        createdBy: ctx.user.id,
        teamId: getUserTeamScope(ctx.user),
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

  list: protectedProcedure.input(listDashboardsSchema).query(async ({ ctx, input }) => {
    const userTeamScopeId = getUserTeamScope(ctx.user)

    const accessCondition = and(
      eq(sharedDashboards.teamId, userTeamScopeId),
      or(
        eq(sharedDashboards.createdBy, ctx.user.id),
        eq(dashboardCollaborators.userId, ctx.user.id),
        eq(sharedDashboards.visibility, 'team'),
        eq(sharedDashboards.visibility, 'public'),
      ),
    )

    let cursorCondition: ReturnType<typeof or> | undefined
    if (input.cursor) {
      const [cursorDashboard] = await ctx.db
        .select({ id: sharedDashboards.id, updatedAt: sharedDashboards.updatedAt })
        .from(sharedDashboards)
        .where(eq(sharedDashboards.id, input.cursor))
        .limit(1)

      if (!cursorDashboard) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cursor' })
      }

      cursorCondition = or(
        lt(sharedDashboards.updatedAt, cursorDashboard.updatedAt),
        and(eq(sharedDashboards.updatedAt, cursorDashboard.updatedAt), lt(sharedDashboards.id, cursorDashboard.id)),
      )
    }

    const whereCondition = cursorCondition ? and(accessCondition, cursorCondition) : accessCondition

    const rows = await ctx.db
      .select()
      .from(sharedDashboards)
      .leftJoin(
        dashboardCollaborators,
        and(
          eq(dashboardCollaborators.dashboardId, sharedDashboards.id),
          eq(dashboardCollaborators.userId, ctx.user.id),
        ),
      )
      .where(whereCondition)
      .orderBy(desc(sharedDashboards.updatedAt), desc(sharedDashboards.id))
      .limit(input.limit + 1)

    const dashboards = rows.map((row) => row.shared_dashboards)
    const hasMore = dashboards.length > input.limit
    const items = hasMore ? dashboards.slice(0, input.limit) : dashboards
    const nextCursor = hasMore ? items.at(-1)?.id ?? null : null

    return { items, nextCursor }
  }),

  get: protectedProcedure.input(getDashboardSchema).query(async ({ ctx, input }) => {
    const userTeamScopeId = getUserTeamScope(ctx.user)

    const [dashboard] = await ctx.db
      .select()
      .from(sharedDashboards)
      .where(and(eq(sharedDashboards.id, input.id), eq(sharedDashboards.teamId, userTeamScopeId)))
      .limit(1)

    if (!dashboard) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard not found' })
    }

    const role = await getCollaboratorRole(ctx.db, input.id, ctx.user.id)
    const isTeamVisibleToUser =
      dashboard.visibility === 'team' && dashboard.teamId === getUserTeamScope(ctx.user)
    const isAllowed = dashboard.createdBy === ctx.user.id || role !== null || isTeamVisibleToUser || dashboard.visibility === 'public'

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
