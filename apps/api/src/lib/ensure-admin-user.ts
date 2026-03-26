import { db, user as userTable } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { ensureBootstrapUser } from './ensure-bootstrap-user.js'

const DEFAULT_ADMIN_EMAIL = 'admin@voyager.local'
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const DEFAULT_ADMIN_NAME = 'Voyager Admin'
const LEGACY_SEEDED_ADMIN_USER_ID = 'admin-001'

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

  try {
    const userId = await ensureBootstrapUser({
      email: adminEmail,
      password: adminPassword,
      name: adminName,
      desiredRole: 'admin',
      legacyUserId: LEGACY_SEEDED_ADMIN_USER_ID,
    })

    console.info('Bootstrap admin user ensured via Better-Auth', { adminEmail, userId })
  } catch (error) {
    console.error('Failed to ensure admin user', { adminEmail, error })
    throw error
  }
}
