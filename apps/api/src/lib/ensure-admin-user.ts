import { account as accountTable, db, user as userTable } from '@voyager/db'
import { and, eq } from 'drizzle-orm'
import { auth } from './auth.js'
import { createBootstrapUser } from './auth-bootstrap.js'

const DEFAULT_ADMIN_EMAIL = 'admin@voyager.local'
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const DEFAULT_ADMIN_NAME = 'Voyager Admin'
const LEGACY_SEEDED_ADMIN_USER_ID = 'admin-001'

const internalHeaders = new Headers({ 'x-internal-seed': 'true' })

type EnsureAdminUserOptions = {
  /**
   * Allow local development fallback credentials.
   * Never enabled in runtime server startup path.
   */
  allowLocalDevDefaults?: boolean
}

type CredentialAccountRecord = {
  providerId: string | null
  password: string | null
}

type AuthApiError = {
  statusCode?: number
  status?: string
  message?: string
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

function isKnownLegacySeededAdminFingerprint(userId: string, email: string) {
  return userId === LEGACY_SEEDED_ADMIN_USER_ID && email === DEFAULT_ADMIN_EMAIL
}

function isLegacyCredentialHash(account: CredentialAccountRecord | null | undefined) {
  if (!account?.providerId || !account.password) return false
  if (account.providerId !== 'credential') return false

  // Legacy Helm SQL bootstrap inserted pgcrypto/bcrypt hashes that Better-Auth cannot parse.
  return /^\$2[aby]\$/.test(account.password)
}

function isUnauthorizedAuthApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const authError = error as AuthApiError
  return authError.statusCode === 401 || authError.status === 'UNAUTHORIZED'
}

async function setAdminRoleWithBootstrapFallback(userId: string, adminEmail: string): Promise<void> {
  try {
    await auth.api.setRole({
      headers: internalHeaders,
      body: { userId, role: 'admin' },
    })
  } catch (error) {
    if (!isUnauthorizedAuthApiError(error)) {
      throw error
    }

    console.warn('Better-Auth setRole unauthorized during bootstrap; applying scoped DB role fallback', {
      adminEmail,
      userId,
    })

    await db.update(userTable).set({ role: 'admin' }).where(eq(userTable.id, userId))
  }
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

  if (existingUserId && isKnownLegacySeededAdminFingerprint(existingUserId, adminEmail)) {
    const [credentialAccount] = await db
      .select({ providerId: accountTable.providerId, password: accountTable.password })
      .from(accountTable)
      .where(and(eq(accountTable.userId, existingUserId), eq(accountTable.providerId, 'credential')))
      .limit(1)

    if (isLegacyCredentialHash(credentialAccount)) {
      console.warn('Detected legacy SQL-seeded admin credential, replacing bootstrap admin record', {
        adminEmail,
        existingUserId,
      })
      await db.delete(userTable).where(eq(userTable.id, existingUserId))
      existingUserId = null
      existingUserRole = null
    }
  }

  if (existingUserId) {
    if (existingUserRole !== 'admin') {
      try {
        await setAdminRoleWithBootstrapFallback(existingUserId, adminEmail)
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

  if (!createdUserId) {
    throw new Error('Failed to create admin user — no user id returned')
  }

  try {
    await setAdminRoleWithBootstrapFallback(createdUserId, adminEmail)
    console.info('Bootstrap admin user ensured via Better-Auth', { adminEmail, createdUserId })
  } catch (error) {
    console.error('Failed to set admin role for created user', { adminEmail, createdUserId, error })
    throw error
  }
}
