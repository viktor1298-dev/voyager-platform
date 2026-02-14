import { db } from '@voyager/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000']
const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 // 24 hours

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
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
