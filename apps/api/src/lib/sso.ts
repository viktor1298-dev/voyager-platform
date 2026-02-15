import { account, ssoProviders, teamMembers, type Database } from '@voyager/db'
import { and, eq, inArray } from 'drizzle-orm'
import { createDecipheriv, createCipheriv, createHash, randomBytes } from 'node:crypto'

const MICROSOFT_PROVIDER_TYPE = 'microsoft-entra-id'
const ENTRA_DISCOVERY_URL = 'https://login.microsoftonline.com/%TENANT_ID%/v2.0/.well-known/openid-configuration'

export interface EntraSsoConfigInput {
  tenantId: string
  clientId: string
  clientSecret?: string
  enabled?: boolean
  groupMappings?: Record<string, string>
}

function getSsoEncryptionKey(): Buffer {
  const configured = process.env.SSO_ENCRYPTION_KEY
  if (configured) {
    return Buffer.from(configured, 'base64')
  }

  const fallbackSecret = process.env.BETTER_AUTH_SECRET ?? 'voyager-dev-better-auth-secret-change-in-prod'
  return createHash('sha256').update(fallbackSecret).digest()
}

export function encryptSsoSecret(value: string): string {
  const key = getSsoEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSsoSecret(value: string): string {
  const [ivBase64, authTagBase64, payloadBase64] = value.split(':')
  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new Error('Invalid encrypted secret format')
  }

  const key = getSsoEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payloadBase64, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

function getDiscoveryUrl(tenantId: string): string {
  return ENTRA_DISCOVERY_URL.replace('%TENANT_ID%', tenantId)
}

export async function testEntraDiscovery(tenantId: string): Promise<{ ok: boolean; issuer?: string; error?: string }> {
  try {
    const response = await fetch(getDiscoveryUrl(tenantId))
    if (!response.ok) {
      return { ok: false, error: `Discovery endpoint returned HTTP ${response.status}` }
    }

    const payload = await response.json()
    return { ok: true, issuer: payload.issuer }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to reach discovery endpoint' }
  }
}

export async function upsertEntraSsoConfig(db: Database, input: EntraSsoConfigInput) {
  const [existing] = await db
    .select({ id: ssoProviders.id, encryptedClientSecret: ssoProviders.encryptedClientSecret })
    .from(ssoProviders)
    .where(eq(ssoProviders.providerType, MICROSOFT_PROVIDER_TYPE))

  const encryptedSecret = input.clientSecret
    ? encryptSsoSecret(input.clientSecret)
    : (existing?.encryptedClientSecret ?? null)

  const values = {
    providerType: MICROSOFT_PROVIDER_TYPE,
    tenantId: input.tenantId,
    clientId: input.clientId,
    encryptedClientSecret: encryptedSecret,
    enabled: input.enabled ?? true,
    groupMappings: input.groupMappings ?? {},
  }

  if (existing) {
    const [updated] = await db
      .update(ssoProviders)
      .set(values)
      .where(eq(ssoProviders.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db.insert(ssoProviders).values(values).returning()
  return created
}

export async function getPublicSsoProviders(db: Database) {
  const rows = await db
    .select({ providerType: ssoProviders.providerType, enabled: ssoProviders.enabled })
    .from(ssoProviders)

  return rows.map((row) => ({
    id: row.providerType,
    provider: row.providerType === MICROSOFT_PROVIDER_TYPE ? 'microsoft' : row.providerType,
    enabled: row.enabled,
  }))
}

export async function getEntraAuthProvider(db: Database) {
  const [row] = await db
    .select({
      tenantId: ssoProviders.tenantId,
      clientId: ssoProviders.clientId,
      encryptedClientSecret: ssoProviders.encryptedClientSecret,
      enabled: ssoProviders.enabled,
    })
    .from(ssoProviders)
    .where(eq(ssoProviders.providerType, MICROSOFT_PROVIDER_TYPE))

  if (!row?.enabled || !row.encryptedClientSecret) {
    return null
  }

  return {
    tenantId: row.tenantId,
    clientId: row.clientId,
    clientSecret: decryptSsoSecret(row.encryptedClientSecret),
  }
}

export async function syncEntraGroupMembership(db: Database, userId: string) {
  const [provider] = await db
    .select({ groupMappings: ssoProviders.groupMappings })
    .from(ssoProviders)
    .where(and(eq(ssoProviders.providerType, MICROSOFT_PROVIDER_TYPE), eq(ssoProviders.enabled, true)))

  const mappings = provider?.groupMappings ?? {}
  const mappedTeamIds = Array.from(new Set(Object.values(mappings).filter(Boolean)))
  if (mappedTeamIds.length === 0) return

  const userAccounts = await db
    .select({ idToken: account.idToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, MICROSOFT_PROVIDER_TYPE)))

  const idToken = userAccounts.find((item) => item.idToken)?.idToken
  if (!idToken) return

  const payload = idToken.split('.')[1]
  if (!payload) return

  let groupIds: string[] = []
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { groups?: string[] }
    groupIds = parsed.groups ?? []
  } catch {
    return
  }

  const desiredTeamIds = Array.from(new Set(groupIds.map((groupId) => mappings[groupId]).filter(Boolean)))

  const existingMemberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, mappedTeamIds)))

  const existingSet = new Set(existingMemberships.map((m) => m.teamId))
  const desiredSet = new Set(desiredTeamIds)

  const toInsert = desiredTeamIds.filter((teamId) => !existingSet.has(teamId))
  const toDelete = mappedTeamIds.filter((teamId) => existingSet.has(teamId) && !desiredSet.has(teamId))

  if (toInsert.length > 0) {
    await db
      .insert(teamMembers)
      .values(toInsert.map((teamId) => ({ teamId, userId, role: 'member' as const })))
      .onConflictDoNothing()
  }

  if (toDelete.length > 0) {
    await db.delete(teamMembers).where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, toDelete)))
  }
}
