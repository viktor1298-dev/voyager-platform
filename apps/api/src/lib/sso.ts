import { account, ssoProviders, teamMembers, type Database } from '@voyager/db'
import { and, eq, inArray } from 'drizzle-orm'
import { createDecipheriv, createCipheriv, createHash, randomBytes } from 'node:crypto'

const MICROSOFT_PROVIDER_TYPE = 'microsoft-entra-id'
const ENTRA_DISCOVERY_URL = 'https://login.microsoftonline.com/%TENANT_ID%/v2.0/.well-known/openid-configuration'
const DEFAULT_SSO_PROVIDER_CACHE_TTL_MS = 60_000

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
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SSO_ENCRYPTION_KEY is required in production')
  }

  console.warn('[SSO] SSO_ENCRYPTION_KEY is not set. Falling back to BETTER_AUTH_SECRET-derived key (dev only).')
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

let cachedProvider: { value: Awaited<ReturnType<typeof getEntraAuthProvider>>; expiresAt: number } | null = null

export async function getCachedEntraAuthProvider(db: Database) {
  const ttlMs = Number.parseInt(process.env.SSO_PROVIDER_CACHE_TTL_MS ?? `${DEFAULT_SSO_PROVIDER_CACHE_TTL_MS}`, 10)
  const now = Date.now()

  if (cachedProvider && cachedProvider.expiresAt > now) {
    return cachedProvider.value
  }

  const value = await getEntraAuthProvider(db)
  cachedProvider = { value, expiresAt: now + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_SSO_PROVIDER_CACHE_TTL_MS) }
  return value
}

const MAX_GRAPH_PAGES = 50

async function fetchEntraGroupIds(accessToken: string): Promise<string[]> {
  const groups: string[] = []
  let url: string | null = 'https://graph.microsoft.com/v1.0/me/memberOf'

  for (let page = 0; url && page < MAX_GRAPH_PAGES; page++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      throw new Error(`Graph API memberOf returned HTTP ${response.status}`)
    }

    const data = (await response.json()) as {
      value?: Array<{ id?: string; '@odata.type'?: string }>
      '@odata.nextLink'?: string
    }

    for (const entry of data.value ?? []) {
      if (entry['@odata.type'] === '#microsoft.graph.group' && typeof entry.id === 'string') {
        groups.push(entry.id)
      }
    }

    url = data['@odata.nextLink'] ?? null
  }

  return groups
}

export async function syncEntraGroupMembership(db: Database, userId: string) {
  const [provider] = await db
    .select({
      groupMappings: ssoProviders.groupMappings,
    })
    .from(ssoProviders)
    .where(and(eq(ssoProviders.providerType, MICROSOFT_PROVIDER_TYPE), eq(ssoProviders.enabled, true)))

  const mappings = provider?.groupMappings ?? {}
  const mappedTeamIds = Array.from(new Set(Object.values(mappings).filter(Boolean)))
  if (mappedTeamIds.length === 0) return

  const userAccounts = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, MICROSOFT_PROVIDER_TYPE)))

  const accessToken = userAccounts.find((item) => item.accessToken)?.accessToken
  if (!accessToken) return

  let groupIds: string[] = []
  try {
    groupIds = await fetchEntraGroupIds(accessToken)
  } catch (error) {
    console.warn('[SSO] Failed to fetch Entra group membership via Graph API', error)
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
