import { auditLog, db, user } from '@voyager/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, genericOAuth, microsoftEntraId } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { resolveTrustedOrigins } from './auth-origins.js'
import { getEntraAuthProvider, syncEntraGroupMembership } from './sso.js'

const ALLOWED_ORIGINS = resolveTrustedOrigins(process.env)
const SESSION_EXPIRY_SECONDS = Number.parseInt(process.env.SESSION_EXPIRY_SECONDS || '86400', 10)

const microsoftFromEnv =
  process.env.ENTRA_TENANT_ID && process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET
    ? {
        tenantId: process.env.ENTRA_TENANT_ID,
        clientId: process.env.ENTRA_CLIENT_ID,
        clientSecret: process.env.ENTRA_CLIENT_SECRET,
      }
    : null

const microsoftFromDb = await getEntraAuthProvider(db)
const microsoftProviderConfig = microsoftFromEnv ?? microsoftFromDb

const microsoftPlugin = microsoftProviderConfig
  ? genericOAuth({
      config: [
        microsoftEntraId({
          tenantId: microsoftProviderConfig.tenantId,
          clientId: microsoftProviderConfig.clientId,
          clientSecret: microsoftProviderConfig.clientSecret,
          scopes: ['openid', 'profile', 'email'],
        }),
      ],
    })
  : null

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [admin(), ...(microsoftPlugin ? [microsoftPlugin] : [])],
  databaseHooks: {
    session: {
      create: {
        async after(session) {
          if (!session?.userId) return
          await syncEntraGroupMembership(db, session.userId)

          // Audit: log user login event
          try {
            const [userData] = await db
              .select({ id: user.id, email: user.email })
              .from(user)
              .where(eq(user.id, session.userId))
              .limit(1)

            if (userData) {
              await db.insert(auditLog).values({
                userId: userData.id,
                userEmail: userData.email,
                action: 'user.login',
                resource: 'session',
                resourceId: session.id,
                ipAddress: (session as { ipAddress?: string | null }).ipAddress ?? null,
              })
            }
          } catch (err) {
            console.error('[audit] Failed to log login event:', err)
          }
        },
      },
    },
  },
  session: {
    expiresIn: SESSION_EXPIRY_SECONDS,
  },
  trustedOrigins: ALLOWED_ORIGINS,
  basePath: '/api/auth',
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? (() => {
          throw new Error('BETTER_AUTH_SECRET required in production')
        })()
      : 'voyager-dev-better-auth-secret-change-in-prod'),
})
