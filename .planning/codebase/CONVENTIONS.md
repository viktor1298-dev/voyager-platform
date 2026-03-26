# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Source files use kebab-case: `ai-service.ts`, `cache.test.ts`, `auth-guard.ts`
- Components use PascalCase: `Sidebar.tsx`, `AppLayout.tsx`, `DataTable.tsx`
- Test files use `.test.ts` or `.spec.ts` suffix: `auth.test.ts`, `auth.spec.ts`
- Pages use kebab-case: `[id]/layout.tsx`, `clusters/page.tsx`
- Index files export modules or components: `src/components/index.ts`, `src/lib/index.ts`

**Functions:**
- Async functions follow camelCase: `getRedisClient()`, `validateClusterConnection()`, `createMockDb()`
- React hooks follow `use` prefix convention: `useAnomalyCount()`, `useRefreshInterval()`, `usePermission()`
- Factory functions use `create` prefix: `createTestCaller()`, `createAuthorizationService()`, `createMockDb()`
- Utility/helper functions use action verbs: `cached()`, `encryptCredential()`, `normalizeProvider()`
- Router functions use domain prefix: `authRouter`, `clusterRouter`, `aiRouter` (defined in `src/routers/`)

**Variables:**
- Use camelCase: `clusterId`, `isEncryptionEnabled`, `mockSetEx`
- Constants use SCREAMING_SNAKE_CASE: `REDIS_URL`, `K8S_CACHE_TTL`, `SESSION_EXPIRY_SECONDS`, `ENCRYPTION_KEY`
- Configuration objects use camelCase keys with readonly values: `const DURATION = { instant: 0.08, fast: 0.15 }`
- Mock functions use `mock` prefix: `mockGet`, `mockSetEx`, `mockDel`

**Types:**
- Interfaces and types use PascalCase: `Context`, `PresenceUser`, `BackendPresenceUser`
- Union types use PascalCase: `RefreshIntervalMs`, `ObjectType`, `Relation`
- Schema objects use `*Schema` suffix: `contextChatInputSchema`, `clusterSchema`, `aiKeySettingsInputSchema`
- Generic type parameters use single uppercase letters: `<T>`, `<TData>`, `<TVariables>`

## Code Style

**Formatting:**
- Tool: Biome 2.3.15
- Indentation: 2 spaces
- Line width: 100 characters
- Line endings: LF

**JavaScript/TypeScript Options (biome.json):**
```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "quoteStyle": "single",
    "semicolons": "asNeeded"
  }
}
```

**Linting:**
- Tool: Biome 2.3.15
- Rules: `recommended` (all Biome recommended rules enabled)
- Command: `pnpm lint` (runs `biome check src/`)

**TypeScript Compiler (tsconfig):**
- Target: ES2022
- Module system: ESNext
- Strict mode: enabled
- Declaration maps: enabled
- Source maps: enabled
- Module resolution: bundler
- ESM modules with `.js` extensions required in import statements (even for `.ts` files)

## Import Organization

**Order:**
1. Zod schema imports: `import { z } from 'zod'`
2. Framework/library imports: `import { describe, expect, it, vi } from 'vitest'`
3. tRPC and server imports: `import { TRPCError } from '@trpc/server'`, `import { trpc, router } from '../trpc.js'`
4. Database/ORM imports: `import { db, user } from '@voyager/db'`
5. Internal lib imports: `import { cached } from '../lib/cache.js'`
6. Services imports: `import { AIService } from '../services/ai-service.js'`
7. Utilities: `import { formatters } from '../lib/formatters.js'`

**Path Aliases:**
- None explicitly configured; relative imports use `../` with `.js` extensions
- Workspace packages imported with `@voyager/` prefix: `@voyager/db`, `@voyager/api/types`, `@voyager/types`

**ESM Requirement:**
- All packages are configured with `"type": "module"` in `package.json`
- Import statements MUST include `.js` extensions even when importing from `.ts` files
- Example: `import { auth } from '../lib/auth.js'` (not `../lib/auth`)

## Error Handling

**Patterns:**

**tRPC errors (backend):**
- Use `TRPCError` from `@trpc/server` for all router errors
- Always include `code` (tRPC error code) and `message`
- Example:
```typescript
throw new TRPCError({
  code: 'NOT_FOUND',
  message: 'Node not found'
})
```

**Common tRPC error codes:**
- `'BAD_REQUEST'` — validation failure, malformed input
- `'NOT_FOUND'` — resource doesn't exist
- `'UNAUTHORIZED'` — authentication required
- `'FORBIDDEN'` — authorization failed
- `'CONFLICT'` — resource already exists
- `'INTERNAL_SERVER_ERROR'` — unexpected server error

**Graceful degradation (caching):**
- Redis failures are non-fatal: `try { ... } catch { }` — silently fall back to direct function call
- Example in `apps/api/src/lib/cache.ts`:
```typescript
try {
  const hit = await redis.get(key)
  if (hit) return JSON.parse(hit)
} catch {}
// Fall through to fresh computation
```

**Transient error detection:**
- AI router (`apps/api/src/routers/ai.ts`) uses `isTransientAiError()` to distinguish retryable errors from logical ones
- Transient patterns: timeout, connection reset, ECONNRESET, ECONNREFUSED
- Logical errors (NOT transient): `NOT_FOUND`, `BAD_REQUEST`

**Frontend error handling:**
- tRPC error shape: `{ data: { code: 'UNAUTHORIZED' } }`
- Global handler `handleTRPCError()` in `apps/web/src/lib/trpc.ts` checks both tRPC-formatted and raw HTTP 401
- On UNAUTHORIZED: redirect to `/login`

**Audit logging:**
- Errors in audit logging should never break the main operation
- Pattern: `try { logAudit(...) } catch (err) { console.error('[audit]', err) }`

## Logging

**Framework:** `console` (no dedicated logger imported)

**Patterns:**
- Warnings: `console.warn('Redis error:', err)`
- Errors: `console.error('[audit] Failed to log login event:', err)`
- Errors with context prefix: `[audit]`, `[k8s]`, etc.

## Comments

**When to Comment:**
- Complex algorithms or non-obvious logic
- Deprecated functions: use `@deprecated` JSDoc tag
- Important notes about gotchas or constraints
- Reference to issue numbers/phases: `// IP3-006: Proactive token refresh`, `// M-P3-003: Inline AI context`

**JSDoc/TSDoc:**
- Used sparingly, primarily for function signatures in libraries
- Example from `apps/api/src/lib/cluster-client-pool.ts`:
```typescript
/**
 * IP3-006: Retry with fresh token on 401/403.
 * Call this when a K8s API call fails with auth error.
 */
```

**Deprecation:**
```typescript
/**
 * @deprecated Use clusterWatchManager.startCluster(clusterId) instead.
 * Kept for backward compatibility during migration.
 */
function oldFunction() { }
```

## Function Design

**Size:** Keep functions focused; break into smaller helpers when nesting exceeds 2 levels

**Parameters:**
- Use object destructuring for multiple related parameters
- Example: `function createMockDb(params?: { clusterExists?: boolean; recentEvents?: Array<...> })`
- Optional parameters use `?` in type definition

**Return Values:**
- Async functions return `Promise<T>`
- Helper functions return `T | null` rather than throwing when resource missing (sometimes)
- Utility functions like `cached()` always return the result type directly

**Error Boundaries:**
- Router procedures wrap errors in `TRPCError` for API boundary
- Services can throw raw errors; routers catch and transform
- Example in `apps/api/src/routers/pods.ts`:
```typescript
try {
  // do work
} catch (error) {
  if (error instanceof TRPCError) throw error
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed: ${getErrorMessage(error)}`
  })
}
```

## Module Design

**Exports:**
- Modules export primary function/class: `export const auth = ...`
- Router modules export as default or named: `export const aiRouter = router(...)`
- Service modules export classes: `export class AIService { }`

**Barrel Files:**
- Index files aggregate related exports: `src/components/index.ts` re-exports all components
- Used for namespace organization but not overused

**Dependency Direction:**
- routers → services → lib
- routers → lib (can skip services)
- services → lib
- lib has no dependencies on routers/services

## Constants

**Configuration:**
- Environment variables read at module load: `const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'`
- Defaults provided inline, no separate config file for env vars
- Feature flags stored in `apps/api/feature-flags.json` (OpenFeature)

**Animation Constants:**
- Centralized in `apps/web/src/lib/animation-constants.ts`
- Exported as readonly objects with const assertion
- Structure: `DURATION`, `EASING`, `STAGGER`, plus variant objects (`fadeVariants`, `slideUpVariants`, etc.)

## Zod Schemas

**Pattern:**
- Define input schemas before procedures/services
- Use discriminated unions for multi-type inputs
- Example:
```typescript
const providerConnectionInputSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('kubeconfig'), connectionConfig: kubeconfigConnectionConfigSchema }),
  z.object({ provider: z.literal('aws'), connectionConfig: awsConnectionConfigSchema }),
])
```

**Important (Zod v4):**
- `z.record()` requires TWO arguments: `z.record(z.string(), z.unknown())` (not just `z.record(z.unknown())`)
- Project uses Zod ^4.3.6

---

*Convention analysis: 2026-03-26*
