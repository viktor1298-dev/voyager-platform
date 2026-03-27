# Code Quality Refactor — Design Spec

**Date:** 2026-03-27
**Scope:** Full refactor — dead code, config centralization, shared utilities, type safety, cache keys
**Files changed:** ~30 files across 5 phases

---

## Problem

The codebase has accumulated hardcoded values scattered across ~82 locations, 3 deprecated functions, ~300 lines of duplicated K8s query patterns, 16 instances of `z.unknown()` type erosion, and inconsistent error handling across 20+ router procedures. While functional, this creates maintenance burden and makes it harder to adjust behavior (e.g., changing a cache TTL means editing 5 files).

## Design

### Config Architecture (Split)

```
packages/config/src/           <-- Shared (API + Web)
  index.ts                     re-exports all modules (add new re-exports)
  sse.ts                       (existing) SSE constants
  ai.ts                        (existing) AI config
  routes.ts                    NEW: API route path constants
  cache.ts                     NEW: Cache TTL constants
  validation.ts                NEW: Zod schema limit constants

apps/api/src/config/           <-- Backend-only (create directory)
  jobs.ts                      NEW: Background job intervals
  k8s.ts                       NEW: K8s client pool settings (use getter for env vars)
```

**Important:** After creating new files in `packages/config/src/`, update `index.ts` to re-export them:
```typescript
export * from './sse.js'
export * from './ai.js'
export * from './routes.js'
export * from './cache.js'
export * from './validation.js'
```
Note the `.js` extensions — required for ESM (CLAUDE.md code style rule).

### Phase 1: Dead Code Removal

**Goal:** Remove verified dead code and unused dependencies.

| Item | File | Action |
|------|------|--------|
| `startPodWatcher()` | `apps/api/src/lib/k8s-watchers.ts` | Delete function (deprecated no-op) |
| `startMetricsPoller()` | `apps/api/src/lib/k8s-watchers.ts` | Delete function (deprecated no-op) |
| Their calls + imports | `apps/api/src/server.ts` | Remove import + calls in K8s watcher block |
| `radix-ui` dependency | `apps/web/package.json` | `pnpm remove radix-ui --filter web` |

**Out of scope — `streamLogs()` deprecation:**
`streamLogs()` in `k8s-watchers.ts` (lines 151-201) is marked `@deprecated` but is still called in `subscriptions.ts:181` as a fallback when no `clusterId` is provided. Unlike the two no-ops above, removing it requires migrating the subscription fallback path to `streamLogsFollow()` and ensuring all frontend callers always send `clusterId`. This is a functional change, not dead code removal — handle it in a separate PR after auditing the web app's log subscription calls.

**Verification:** `pnpm build && pnpm typecheck` must pass.

### Phase 2: Config Centralization

**Goal:** Extract all hardcoded values into centralized config files.

#### 2a. `packages/config/src/routes.ts` (shared)

```typescript
export const API_ROUTES = {
  TRPC: '/trpc',
  AUTH_PREFIX: '/api/auth',
  HEALTH: '/health',
  DOCS: '/docs',
  OPENAPI: '/openapi.json',
} as const

/** Paths that bypass authentication checks (auth-guard.ts) */
export const AUTH_BYPASS_PATHS = [
  '/api/auth/',
  '/health',
  '/docs',
  '/openapi.json',
] as const

/** Paths exempt from rate limiting (server.ts) — separate from auth bypass */
export const RATE_LIMIT_BYPASS_PATHS = [
  '/api/auth/',
  '/health',
  '/trpc',
] as const
```

**Important:** Auth bypass and rate-limit bypass are different path sets. `/trpc` is rate-limit-exempt but NOT auth-exempt. `/docs` is auth-exempt but NOT rate-limit-exempt. These must remain separate constants — do not merge them.

**Consumers:** `server.ts` (rate limit allowlist uses `RATE_LIMIT_BYPASS_PATHS`), `auth-guard.ts` (uses `AUTH_BYPASS_PATHS`)

#### 2b. `packages/config/src/cache.ts` (shared)

```typescript
export const CACHE_TTL = {
  K8S_RESOURCES_SEC: 30,
  CLUSTER_CLIENT_MS: 5 * 60 * 1000,
  TOKEN_MAX_TTL_MS: 60 * 60 * 1000,
  TOKEN_MIN_TTL_MS: 15 * 60 * 1000,
  KARPENTER_MS: 60_000,
  SSO_PROVIDER_MS: 60_000,
  PRESENCE_MS: 60_000,
} as const
```

**Consumers:** `cluster-client-pool.ts`, `karpenter-service.ts`, `sso.ts`, `presence.ts`, K8s routers

#### 2c. `packages/config/src/validation.ts` (shared)

```typescript
export const LIMITS = {
  NAME_MAX: 255,
  DESCRIPTION_MAX: 2000,
  URL_MAX: 1000,
  ENDPOINT_MAX: 500,
  STATUS_MAX: 50,
  VERSION_MAX: 50,
  LIST_DEFAULT: 50,
  LIST_MAX: 100,
  LOG_TAIL_DEFAULT: 200,
  LOG_TAIL_MAX: 5000,
  AI_QUESTION_MAX: 2000,
  AI_PROMPT_MAX: 4000,
  RULES_ARRAY_MAX: 50,
  SCORE_MAX: 100,
} as const
```

**Consumers:** All tRPC routers with Zod schemas

#### 2d. `apps/api/src/config/jobs.ts` (backend-only)

```typescript
export const JOB_INTERVALS = {
  ALERT_EVAL_MS: 60 * 1000,
  ALERT_DEDUP_WINDOW_MS: 5 * 60 * 1000,
  EVENT_SYNC_MS: 2 * 60 * 1000,
  METRICS_COLLECT_MS: 60 * 1000,
  HEALTH_SYNC_MS: 5 * 60 * 1000,
  NODE_SYNC_MS: 5 * 60 * 1000,
} as const
```

**Consumers:** All files in `apps/api/src/jobs/`

#### 2e. `apps/api/src/config/k8s.ts` (backend-only)

Use getter functions for env vars to avoid module-load-time evaluation (which breaks tests that set env vars after import):

```typescript
export const K8S_CONFIG = {
  CLIENT_POOL_MAX: 50,
  METRICS_API_TIMEOUT_MS: 15_000,
  get ENCRYPTION_KEY() {
    return process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
  },
} as const
```

**Consumers:** `cluster-client-pool.ts`, `routers/clusters.ts`

#### 2f. Fix hardcoded domain in ApiTokens.tsx

The current code is:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://voyager-platform.voyagerlabs.co'
```

The env var `NEXT_PUBLIC_API_URL` is already the correct variable — it points to the API server. Keep the env var, just change the fallback to use the current origin:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? `${window.location.origin}`
```

This way: in K8s it uses `NEXT_PUBLIC_API_URL`, in local dev it falls back to the current browser origin (works for any domain).

**Verification:** `pnpm build && pnpm typecheck`. Grep for raw magic numbers in changed files.

### Phase 3: Shared Utilities

**Goal:** Extract duplicated patterns into reusable helpers.

#### 3a. `apps/api/src/lib/error-handler.ts`

```typescript
import { TRPCError } from '@trpc/server'

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
```

**Apply to:** services.ts, pods.ts, namespaces.ts, deployments.ts, nodes.ts, metrics.ts, logs.ts (7 routers, ~20 catch blocks)

#### 3b. Consolidate skeleton components

The `shared/CardSkeleton.tsx` is the superior version (has `count` prop, uses Radix `Skeleton` primitive, has `aria-busy` and `aria-label`). Keep it as the canonical implementation:

1. Move `apps/web/src/components/shared/CardSkeleton.tsx` → `apps/web/src/components/CardSkeleton.tsx` (or merge its features into root)
2. Move `apps/web/src/components/shared/TableSkeleton.tsx` → `apps/web/src/components/TableSkeleton.tsx`
3. Remove the simpler skeleton exports from `apps/web/src/components/Skeleton.tsx` (keep only `Skeleton` base if used)
4. Update all imports across the codebase
5. Delete empty/unused files in `shared/`

#### 3c. Consolidate EmptyState components

The two components have incompatible `action` prop shapes:
- `components/EmptyState.tsx` → `action?: ReactNode`
- `components/shared/EmptyState.tsx` → `action?: { label: string; onClick: () => void }`

**Decision: Keep `ReactNode` (the more flexible API).** The object-shape callers can be migrated by wrapping with `<Button>`:
```typescript
// Before: action={{ label: 'Create', onClick: handleCreate }}
// After:  action={<Button onClick={handleCreate}>Create</Button>}
```

1. Keep `apps/web/src/components/EmptyState.tsx` as canonical
2. Grep for all imports of `shared/EmptyState` and migrate their `action` props
3. Delete `apps/web/src/components/shared/EmptyState.tsx`

**Verification:** `pnpm build && pnpm typecheck`. Run `pnpm test:e2e` after this phase to catch any UI regressions from component consolidation.

### Phase 4: Type Safety

**Goal:** Replace `z.unknown()` with proper Zod schemas.

#### 4a. K8s label/annotation schemas in `packages/types/src/`

```typescript
export const k8sLabelsSchema = z.record(z.string(), z.string()).nullable()
export const k8sAnnotationsSchema = z.record(z.string(), z.string()).nullable()
export const k8sSelectorSchema = z.record(z.string(), z.string()).nullable()
```

**Apply to:** services.ts (selector, labels, annotations), events.ts (involvedObject), clusters.ts (connectionConfig)

#### 4b. Fix alert threshold coercion

Replace `String(input.threshold)` with direct numeric passthrough. Drizzle's `numeric()` column accepts numbers.

#### 4c. Structured config schemas

Replace `z.record(z.string(), z.unknown())` in features.ts, dashboard.ts with more specific schemas where the shape is known, or `z.record(z.string(), z.string())` where values are always strings.

**Verification:** `pnpm typecheck`. Run `pnpm test` to catch any runtime schema validation changes.

### Phase 5: Cache Key Centralization

**Goal:** Single source of truth for all Redis cache key patterns.

#### `apps/api/src/lib/cache-keys.ts`

**Important:** Before creating this file, grep for all existing cache key patterns in the codebase to ensure the version suffixes and formats match exactly. Do NOT change key formats — this would cause a mass cache miss on first deploy.

```typescript
export const CACHE_KEYS = {
  k8sServices: (clusterId: string, ns?: string) =>
    `k8s:${clusterId}:services:${ns ?? 'all'}`,
  k8sDeployments: (clusterId: string) =>
    `k8s:${clusterId}:deployments:list:v2`,
  k8sPods: (clusterId: string, ns?: string) =>
    `k8s:${clusterId}:pods:${ns ?? 'all'}`,
  k8sNodes: (clusterId: string) =>
    `k8s:${clusterId}:nodes`,
  k8sNamespaces: (clusterId: string) =>
    `k8s:${clusterId}:namespaces`,
  clusterHealth: (clusterId: string) =>
    `cluster:${clusterId}:health`,
} as const
```

**Apply to:** All routers that construct cache keys manually.

**Pre-implementation check:** Run `grep -rn "k8s:.*:services\|k8s:.*:deployments\|k8s:.*:pods\|k8s:.*:nodes\|k8s:.*:namespaces" apps/api/src/` to capture the exact key formats currently in use. Match them exactly in the centralized file.

**Verification:** `pnpm build && pnpm typecheck`. Verify key formats match existing patterns via grep.

---

## Files Modified (Summary)

| Phase | Files | Change Type |
|-------|-------|-------------|
| 1 | 3 | Delete dead code |
| 2 | ~14 | Extract config + update consumers |
| 3 | ~10 | Extract utilities + update consumers |
| 4 | ~8 | Replace schemas + fix coercion |
| 5 | ~6 | Extract cache keys + update consumers |
| **Total** | **~30** | |

## Verification Plan

After each phase:
1. `pnpm typecheck` — zero errors
2. `pnpm build` — clean build
3. `pnpm test` — all tests pass
4. `pnpm lint` — no new warnings
5. Manual: start dev servers and verify login + dashboard loads

After Phase 3 specifically (component consolidation):
- Run `pnpm test:e2e` — zero failures (E2E gate)

After all phases:
- `grep -r "TODO\|FIXME\|HACK" apps/ packages/` — no new tech debt markers
- Verify no raw magic numbers remain in routers (spot check)
- Grep for hardcoded cache key strings in routers — should all use `CACHE_KEYS`
