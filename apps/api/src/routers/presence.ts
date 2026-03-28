import { z } from 'zod'
import { getOnlineUsers, heartbeatPresence, subscribeToPresence } from '../lib/presence.js'
import { protectedProcedure, router } from '../trpc.js'

const PRESENCE_ONE_SHOT_ENV_KEYS = ['PLAYWRIGHT', 'E2E'] as const

function shouldUseOneShotPresenceStream() {
  if (process.env.DISABLE_PRESENCE_STREAM === 'true') return true
  if (process.env.NODE_ENV === 'test') return true

  return PRESENCE_ONE_SHOT_ENV_KEYS.some((key) => process.env[key] === 'true')
}

export const presenceRouter = router({
  getOnlineUsers: protectedProcedure.query(async () => {
    return getOnlineUsers()
  }),

  heartbeat: protectedProcedure
    .input(
      z.object({
        currentPage: z.string().min(1).max(512),
        avatar: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = heartbeatPresence({
        id: ctx.user.id,
        name: ctx.user.name,
        avatar: input.avatar ?? null,
        currentPage: input.currentPage,
      })

      return {
        ok: true,
        user: updated,
      }
    }),

  subscribe: protectedProcedure.subscription(async function* ({ signal }) {
    const stream = subscribeToPresence(signal)
    const oneShot = shouldUseOneShotPresenceStream()

    try {
      for await (const update of stream) {
        yield update

        if (oneShot) {
          return
        }
      }
    } catch (err: unknown) {
      // Suppress AbortError — normal SSE disconnect (tab close, navigation)
      if (err instanceof Error && err.name === 'AbortError') return
      // Log unexpected errors but don't crash the server
      console.error('[presence] subscription error:', err)
    } finally {
      // Ensure iterator cleanup on any exit path
      await stream.return?.()
    }
  }),
})
