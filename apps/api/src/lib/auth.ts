import { db } from '@voyager/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, genericOAuth, microsoftEntraId } from 'better-auth/plugins'
import { getEntraAuthProvider, syncEntraGroupMembership } from './sso.js'

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:9000',
  'http://voyager-platform.voyagerlabs.co',
  'https://voyager-platform.voyagerlabs.co',
] as const

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [...DEFAULT_ALLOWED_ORIGINS]
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
