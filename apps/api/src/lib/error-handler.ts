import { TRPCError } from '@trpc/server'

/**
 * Standard error handler for K8s API operations in tRPC routers.
 * Re-throws TRPCErrors as-is. Maps 404s to NOT_FOUND. Everything else becomes INTERNAL_SERVER_ERROR.
 */
export function handleK8sError(error: unknown, operation: string): never {
  if (error instanceof TRPCError) throw error
  const msg = error instanceof Error ? error.message : 'Unknown error'
  if (msg.includes('404') || msg.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `${operation} not found` })
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${operation}: ${msg}`,
  })
}

// ---------------------------------------------------------------------------
// Database constraint error mapping
// ---------------------------------------------------------------------------

/** Duck-type check for pg DatabaseError (avoids importing pg-protocol internals) */
interface PgDatabaseError extends Error {
  code: string
  severity: string
  constraint?: string
  detail?: string
  table?: string
}

function isPgDatabaseError(error: unknown): error is PgDatabaseError {
  return (
    error instanceof Error &&
    'code' in error &&
    'severity' in error &&
    typeof (error as PgDatabaseError).code === 'string' &&
    typeof (error as PgDatabaseError).severity === 'string'
  )
}

/** Extract the conflicting value from PostgreSQL detail string.
 *  e.g. "Key (name)=(my-cluster) already exists." → "my-cluster" */
function extractValueFromDetail(detail: string): string | undefined {
  const match = detail.match(/\(([^)]+)\)=\(([^)]+)\)/)
  return match?.[2]
}

/** Map of PostgreSQL unique constraint names → user-friendly messages.
 *  Constraint names come from init.sql (source of truth). */
const UNIQUE_CONSTRAINT_MESSAGES: Record<string, (value?: string) => string> = {
  clusters_name_key: (v) =>
    v ? `A cluster named '${v}' already exists` : 'A cluster with this name already exists',
  teams_name_unique: (v) =>
    v ? `A team named '${v}' already exists` : 'A team with this name already exists',
  feature_flags_name_key: () => 'A feature flag with this name already exists',
  nodes_cluster_name_unique: () => 'A node with this name already exists in this cluster',
  sso_providers_provider_type_unq: () => 'This SSO provider type is already configured',
  uidx_user_ai_keys_user_provider: () => 'You already have a key configured for this AI provider',
  relations_subject_object_relation_unq: () => 'This permission assignment already exists',
  karpenter_cache_cluster_data_type_uq: () =>
    'Karpenter cache entry already exists for this cluster',
}

/**
 * Maps PostgreSQL constraint violations to user-friendly TRPCErrors.
 * Returns null if the error is not a recognized database error — caller handles normally.
 *
 * Applied in publicProcedure catch-all so ALL routers benefit automatically.
 */
export function mapDbError(error: unknown): TRPCError | null {
  if (!isPgDatabaseError(error)) return null

  // Unique constraint violation (23505)
  if (error.code === '23505') {
    const value = error.detail ? extractValueFromDetail(error.detail) : undefined
    const messageFn = error.constraint ? UNIQUE_CONSTRAINT_MESSAGES[error.constraint] : undefined
    const message = messageFn ? messageFn(value) : 'This record already exists (duplicate value)'
    return new TRPCError({ code: 'CONFLICT', message })
  }

  // Foreign key violation (23503)
  if (error.code === '23503') {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Operation failed: a referenced record does not exist or other records depend on this one',
    })
  }

  // Other integrity constraint violations (class 23)
  if (error.code.startsWith('23')) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Operation failed due to a data constraint',
    })
  }

  return null
}
