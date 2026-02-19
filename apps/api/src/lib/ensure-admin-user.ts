import { db, user as userTable } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { auth } from './auth.js'
import { createBootstrapUser } from './auth-bootstrap.js'

const DEFAULT_ADMIN_EMAIL = 'admin@voyager.local'
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const DEFAULT_ADMIN_NAME = 'Voyager Admin'

const internalHeaders = new Headers({ 'x-internal-seed': 'true' })

type EnsureAdminUserOptions = {
  /**
   * Allow local development fallback credentials.
   * Never enabled in runtime server startup path.
   */
  allowLocalDevDefaults?: boolean
}

function getAdminCredentials(options: EnsureAdminUserOptions) {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const adminName = process.env.ADMIN_NAME ?? DEFAULT_ADMIN_NAME
  const isProduction = process.env.NODE_ENV === 'production'

  if (adminEmail && adminPassword) {
    return { adminEmail, adminPassword, adminName }
  }

  if (isProduction) {
    throw new Error('Missing required ADMIN_EMAIL and ADMIN_PASSWORD in production')
  }

  if (options.allowLocalDevDefaults) {
    return {
      adminEmail: adminEmail ?? DEFAULT_ADMIN_EMAIL,
      adminPassword: adminPassword ?? DEFAULT_ADMIN_PASSWORD,
      adminName,
    }
  }

  throw new Error(
    'Missing ADMIN_EMAIL and ADMIN_PASSWORD for runtime admin bootstrap (defaults are only allowed for local seed path)',
  )
}

export async function ensureAdminUser(options: EnsureAdminUserOptions = {}): Promise<void> {
  const { adminEmail, adminPassword, adminName } = getAdminCredentials(options)

  let existingUserId: string | null = null
  let existingUserRole: string | null = null

  try {
    const [existingUser] = await db
      .select({ id: userTable.id, role: userTable.role })
      .from(userTable)
      .where(eq(userTable.email, adminEmail))
      .limit(1)

    existingUserId = existingUser?.id ?? null
    existingUserRole = existingUser?.role ?? null
  } catch (error) {
    console.error('Failed to query admin user by email', { adminEmail, error })
    throw error
  }

  if (existingUserId) {
    if (existingUserRole !== 'admin') {
      try {
        await auth.api.setRole({
          headers: internalHeaders,
          body: { userId: existingUserId, role: 'admin' },
        })
      } catch (error) {
        console.error('Failed to set admin role for existing user', { adminEmail, existingUserId, error })
        throw error
      }
    }
    return
  }

  let createdUserId: string | null = null
  try {
    createdUserId = await createBootstrapUser({
      email: adminEmail,
      password: adminPassword,
      name: adminName,
    })
  } catch (error) {
    console.error('Failed to create admin user', { adminEmail, error })
    throw error
  }

  try {
    await auth.api.setRole({
      headers: internalHeaders,
      body: { userId: createdUserId, role: 'admin' },
    })
  } catch (error) {
    console.error('Failed to set admin role for created user', { adminEmail, createdUserId, error })
    throw error
  }
}
