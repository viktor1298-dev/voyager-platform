import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { createAuthorizationService } from '../lib/authorization.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const subjectSchema = z.object({
  type: z.enum(['user', 'team', 'role']),
  id: z.string().min(1),
})

const objectSchema = z.object({
  type: z.enum(['cluster', 'deployment', 'namespace', 'alert']),
  id: z.string().min(1),
})

const relationSchema = z.enum(['owner', 'admin', 'editor', 'viewer'])

export const authorizationRouter = router({
  check: protectedProcedure
    .input(z.object({ subject: subjectSchema, relation: relationSchema, object: objectSchema }))
    .query(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      const allowed = await service.check(input.subject, input.relation, input.object)
      return { allowed }
    }),

  grant: adminProcedure
    .input(z.object({ subject: subjectSchema, relation: relationSchema, object: objectSchema }))
    .mutation(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      await service.grant(input.subject, input.relation, input.object, ctx.user.id)
      await logAudit(ctx, 'authorization.grant', input.object.type, input.object.id, {
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        relation: input.relation,
      })
      return { success: true }
    }),

  revoke: adminProcedure
    .input(z.object({ subject: subjectSchema, relation: relationSchema, object: objectSchema }))
    .mutation(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      const removed = await service.revoke(input.subject, input.relation, input.object)
      await logAudit(ctx, 'authorization.revoke', input.object.type, input.object.id, {
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        relation: input.relation,
        removed,
      })
      return { success: removed }
    }),

  listForResource: protectedProcedure
    .input(z.object({ object: objectSchema }))
    .query(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      return service.listSubjects(input.object)
    }),

  listForUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin' && ctx.user.id !== input.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Permission denied' })
      }

      const service = createAuthorizationService(ctx.db)
      return service.listPermissions({ type: 'user', id: input.userId })
    }),
})

export const teamsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const service = createAuthorizationService(ctx.db)
    return service.listTeams()
  }),

  create: adminProcedure
    .input(
      z.object({ name: z.string().min(1).max(255), description: z.string().max(1000).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      const team = await service.createTeam(input)
      await logAudit(ctx, 'team.create', 'team', team.id, {
        name: team.name,
        description: team.description,
      })
      return team
    }),

  addMember: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        userId: z.string().min(1),
        role: z.enum(['admin', 'member']).default('member'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      await service.addTeamMember(input)
      await logAudit(ctx, 'team.add_member', 'team', input.teamId, {
        userId: input.userId,
        role: input.role,
      })
      return { success: true }
    }),

  removeMember: adminProcedure
    .input(z.object({ teamId: z.string().uuid(), userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const service = createAuthorizationService(ctx.db)
      await service.removeTeamMember(input)
      await logAudit(ctx, 'team.remove_member', 'team', input.teamId, {
        userId: input.userId,
      })
      return { success: true }
    }),
})
