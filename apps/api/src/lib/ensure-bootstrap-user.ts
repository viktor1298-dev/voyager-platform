import { account as accountTable, db, user as userTable } from '@voyager/db'
import { and, eq } from 'drizzle-orm'
import { auth } from './auth.js'
import { createBootstrapUser } from './auth-bootstrap.js'
import { createComponentLogger } from './logger.js'

const log = createComponentLogger('bootstrap')

export type EnsureBootstrapUserInput = {
  email: string
  password: string
  name: string
  desiredRole: 'admin' | 'viewer'
  legacyUserId?: string
}

type CredentialAccountRecord = {
  providerId: string | null
  password: string | null
}

type ExistingBootstrapState = {
  shouldReplaceUser: boolean
  reason: 'missing-credential' | 'legacy-credential-hash' | null
}

type AuthApiError = {
  statusCode?: number
  status?: string | number
  message?: string
  code?: string | number
  cause?: unknown
  response?: unknown
}

const internalHeaders = new Headers({ 'x-internal-seed': 'true' })

function isKnownLegacySeededUserFingerprint(userId: string, email: string, legacyUserId?: string) {
  return Boolean(legacyUserId && userId === legacyUserId && email)
}

function isLegacyCredentialHash(account: CredentialAccountRecord | null | undefined) {
  if (!account?.providerId || !account.password) return false
  if (account.providerId !== 'credential') return false

  // Legacy Helm SQL bootstrap inserted pgcrypto/bcrypt hashes that Better-Auth cannot parse.
  return /^\$2[aby]\$/.test(account.password)
}

function getExistingBootstrapState(params: {
  userId: string
  email: string
  credentialAccount: CredentialAccountRecord | null | undefined
  legacyUserId?: string
}): ExistingBootstrapState {
  const { userId, email, credentialAccount, legacyUserId } = params

  if (!credentialAccount?.providerId || !credentialAccount.password) {
    return { shouldReplaceUser: true, reason: 'missing-credential' }
  }

  if (
    isKnownLegacySeededUserFingerprint(userId, email, legacyUserId) &&
    isLegacyCredentialHash(credentialAccount)
  ) {
    return { shouldReplaceUser: true, reason: 'legacy-credential-hash' }
  }

  return { shouldReplaceUser: false, reason: null }
}

function isUnauthorizedAuthApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const queue: unknown[] = [error]
  const visited = new Set<unknown>()

  while (queue.length > 0 && visited.size < 20) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)

    const authError = current as AuthApiError
    const record = current as Record<string, unknown>

    const message = typeof authError.message === 'string' ? authError.message.toLowerCase() : ''
    const statusLike = [authError.statusCode, authError.status, authError.code, record.httpStatus]

    if (
      statusLike.includes(401) ||
      statusLike.includes('UNAUTHORIZED') ||
      statusLike.includes('AUTH_UNAUTHORIZED') ||
      message.includes('unauthorized') ||
      message.includes('not authorized') ||
      message.includes('status code 401')
    ) {
      return true
    }

    if (authError.cause) queue.push(authError.cause)
    if (authError.response) queue.push(authError.response)
    if (record.error) queue.push(record.error)
    if (record.data) queue.push(record.data)
    if (record.body) queue.push(record.body)
  }

  return false
}

async function setBootstrapRoleWithFallback(
  userId: string,
  email: string,
  desiredRole: 'admin' | 'viewer',
): Promise<void> {
  try {
    await auth.api.setRole({
      headers: internalHeaders,
      body: { userId, role: desiredRole === 'viewer' ? 'user' : desiredRole },
    })
  } catch (error) {
    if (!isUnauthorizedAuthApiError(error)) {
      throw error
    }

    log.warn({ email, userId, desiredRole }, 'Better-Auth setRole unauthorized during bootstrap; applying scoped DB role fallback')

    await db.update(userTable).set({ role: desiredRole }).where(eq(userTable.id, userId))

    const [updatedUser] = await db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1)

    if (updatedUser?.role !== desiredRole) {
      throw new Error(
        `Bootstrap fallback failed to verify ${desiredRole} role assignment for user ${userId} (${email})`,
      )
    }
  }
}

export async function ensureBootstrapUser(input: EnsureBootstrapUserInput): Promise<string> {
  const { email, password, name, desiredRole, legacyUserId } = input

  let existingUserId: string | null = null
  let existingUserRole: string | null = null

  const [existingUser] = await db
    .select({ id: userTable.id, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1)

  existingUserId = existingUser?.id ?? null
  existingUserRole = existingUser?.role ?? null

  if (existingUserId) {
    const [credentialAccount] = await db
      .select({ providerId: accountTable.providerId, password: accountTable.password })
      .from(accountTable)
      .where(
        and(eq(accountTable.userId, existingUserId), eq(accountTable.providerId, 'credential')),
      )
      .limit(1)

    const existingState = getExistingBootstrapState({
      userId: existingUserId,
      email,
      credentialAccount,
      legacyUserId,
    })

    if (existingState.shouldReplaceUser) {
      log.warn({ email, existingUserId, desiredRole, reason: existingState.reason }, 'Detected bootstrap user without valid credential; replacing record')
      await db.delete(userTable).where(eq(userTable.id, existingUserId))
      existingUserId = null
      existingUserRole = null
    } else {
      // Credential exists — verify password still matches env var
      try {
        await auth.api.signInEmail({
          body: { email, password },
          headers: internalHeaders,
        })
      } catch {
        // Password mismatch — delete and recreate with correct password
        log.warn(
          { email, existingUserId },
          'Bootstrap user password mismatch with env var; recreating credential',
        )
        await db.delete(userTable).where(eq(userTable.id, existingUserId))
        existingUserId = null
        existingUserRole = null
      }
    }
  }

  if (!existingUserId) {
    existingUserId = await createBootstrapUser({ email, password, name })
  }

  if (!existingUserId) {
    throw new Error(`Failed to ensure bootstrap user for ${email} — no user id returned`)
  }

  if (existingUserRole !== desiredRole || !existingUser) {
    await setBootstrapRoleWithFallback(existingUserId, email, desiredRole)
  }

  return existingUserId
}
