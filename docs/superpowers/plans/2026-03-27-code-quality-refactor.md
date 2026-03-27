# Code Quality Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate hardcoded values, dead code, duplicate patterns, and type safety gaps across the monorepo.

**Architecture:** Split config — shared constants in `packages/config/src/`, backend-only config in `apps/api/src/config/`. Shared utilities in `apps/api/src/lib/`. Component deduplication in `apps/web/src/components/`.

**Tech Stack:** TypeScript, Fastify 5, tRPC 11, Zod v4, Next.js 16, React 19, Drizzle ORM

**Spec:** `docs/superpowers/specs/2026-03-27-code-quality-refactor-design.md`

---

## Task 1: Remove dead code and unused dependencies

**Files:**
- Modify: `apps/api/src/lib/k8s-watchers.ts` (delete `startPodWatcher` lines 20-23, `startMetricsPoller` lines 30-32)
- Modify: `apps/api/src/server.ts` (remove imports + calls)
- Modify: `apps/web/package.json` (remove `radix-ui`)

- [ ] **Step 1: Remove deprecated no-op functions from k8s-watchers.ts**

In `apps/api/src/lib/k8s-watchers.ts`, delete the `startPodWatcher()` function (lines 20-23) and `startMetricsPoller()` function (lines 30-32). Keep `watchDeploymentProgress`, `streamLogsFollow`, `streamLogs`, and `stopAllWatchers`.

Also remove their exports from the file.

- [ ] **Step 2: Update server.ts imports and K8s watcher block**

In `apps/api/src/server.ts`:

Remove from import line 17:
```typescript
// Before:
import { startMetricsPoller, startPodWatcher, stopAllWatchers } from './lib/k8s-watchers.js'
// After:
import { stopAllWatchers } from './lib/k8s-watchers.js'
```

In the `k8sEnabled` block (~line 263-271), remove the try-catch that calls `startPodWatcher()` and `startMetricsPoller()`. Keep the background job starts. The block should become:

```typescript
if (k8sEnabled) {
  startHealthSync()
  startAlertEvaluator()
  startMetricsHistoryCollector()
  startNodeSync()
  startEventSync()
  app.log.info('Background jobs started (health-sync, alert-evaluator, metrics, node-sync, event-sync)')
} else {
  app.log.info('K8s integration disabled (K8S_ENABLED=false) — skipping watchers and cluster sync jobs')
}
```

- [ ] **Step 3: Remove unused radix-ui dependency**

Run: `pnpm remove radix-ui --filter @voyager/web`

Individual `@radix-ui/react-*` packages are still used and must remain.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: All 6 packages pass with zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/k8s-watchers.ts apps/api/src/server.ts apps/web/package.json pnpm-lock.yaml
git commit -m "refactor: remove deprecated k8s watcher no-ops and unused radix-ui dep"
```

---

## Task 2: Create shared config files in packages/config

**Files:**
- Create: `packages/config/src/routes.ts`
- Create: `packages/config/src/cache.ts`
- Create: `packages/config/src/validation.ts`
- Modify: `packages/config/src/index.ts` (add re-exports)

- [ ] **Step 1: Create routes.ts**

Create `packages/config/src/routes.ts`:

```typescript
/** API route path constants */

export const API_ROUTES = {
  TRPC: '/trpc',
  AUTH_PREFIX: '/api/auth',
  HEALTH: '/health',
  DOCS: '/docs',
  OPENAPI: '/openapi.json',
} as const

/** Paths that bypass authentication checks (used by auth-guard.ts) */
export const AUTH_BYPASS_PATHS = [
  '/api/auth/',
  '/health',
  '/docs',
  '/openapi.json',
] as const

/** Paths exempt from rate limiting (used by server.ts) — separate from auth bypass */
export const RATE_LIMIT_BYPASS_PATHS = [
  '/api/auth/',
  '/health',
  '/trpc',
] as const
```

- [ ] **Step 2: Create cache.ts**

Create `packages/config/src/cache.ts`:

```typescript
/** Cache TTL constants used across the API */

export const CACHE_TTL = {
  /** K8s resource queries (pods, services, namespaces) — seconds */
  K8S_RESOURCES_SEC: 30,
  /** Cluster client pool entry lifetime — ms */
  CLUSTER_CLIENT_MS: 5 * 60 * 1000,
  /** Maximum token TTL (GKE/AKS) — ms */
  TOKEN_MAX_TTL_MS: 60 * 60 * 1000,
  /** Minimum token TTL (EKS) — ms */
  TOKEN_MIN_TTL_MS: 15 * 60 * 1000,
  /** Karpenter cache — ms */
  KARPENTER_MS: 60_000,
  /** SSO provider config cache — ms */
  SSO_PROVIDER_MS: 60_000,
  /** Presence tracking — ms */
  PRESENCE_MS: 60_000,
} as const
```

- [ ] **Step 3: Create validation.ts**

Create `packages/config/src/validation.ts`:

```typescript
/** Zod schema validation limits — shared across all tRPC routers */

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

- [ ] **Step 4: Update index.ts with new re-exports**

In `packages/config/src/index.ts`, add the new module re-exports:

```typescript
export * from './sse.js'
export * from './ai.js'
export * from './routes.js'
export * from './cache.js'
export * from './validation.js'
```

Note: `.js` extensions required for ESM.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: All packages pass. New exports available via `@voyager/config`.

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/
git commit -m "refactor: add centralized routes, cache TTL, and validation config"
```

---

## Task 3: Create backend-only config and fix ApiTokens

**Files:**
- Create: `apps/api/src/config/jobs.ts`
- Create: `apps/api/src/config/k8s.ts`
- Modify: `apps/web/src/components/settings/ApiTokens.tsx:11`

- [ ] **Step 1: Create apps/api/src/config/ directory and jobs.ts**

Create `apps/api/src/config/jobs.ts`:

```typescript
/** Background job polling intervals — all values in milliseconds */

export const JOB_INTERVALS = {
  ALERT_EVAL_MS: 60 * 1000,
  ALERT_DEDUP_WINDOW_MS: 5 * 60 * 1000,
  EVENT_SYNC_MS: 2 * 60 * 1000,
  METRICS_COLLECT_MS: 60 * 1000,
  HEALTH_SYNC_MS: 5 * 60 * 1000,
  NODE_SYNC_MS: 5 * 60 * 1000,
} as const
```

- [ ] **Step 2: Create k8s.ts**

Create `apps/api/src/config/k8s.ts`:

```typescript
/** K8s client pool and connection settings */

export const K8S_CONFIG = {
  CLIENT_POOL_MAX: 50,
  get ENCRYPTION_KEY() {
    return process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
  },
} as const
```

Uses a getter for `ENCRYPTION_KEY` so tests that set `process.env.CLUSTER_CRED_ENCRYPTION_KEY` after import still work.

- [ ] **Step 3: Fix hardcoded domain in ApiTokens.tsx**

In `apps/web/src/components/settings/ApiTokens.tsx` line 11, change:

```typescript
// Before:
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://voyager-platform.voyagerlabs.co'
// After:
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/ apps/web/src/components/settings/ApiTokens.tsx
git commit -m "refactor: add backend config files and fix hardcoded domain in ApiTokens"
```

---

## Task 4: Update consumers to use centralized config

**Files:**
- Modify: `apps/api/src/lib/auth-guard.ts` (use `AUTH_BYPASS_PATHS` from config)
- Modify: `apps/api/src/server.ts` (use `RATE_LIMIT_BYPASS_PATHS` from config)
- Modify: `apps/api/src/jobs/health-sync.ts` (use `JOB_INTERVALS.HEALTH_SYNC_MS`)
- Modify: `apps/api/src/jobs/alert-evaluator.ts` (use `JOB_INTERVALS.ALERT_EVAL_MS`, `ALERT_DEDUP_WINDOW_MS`)
- Modify: `apps/api/src/jobs/event-sync.ts` (use `JOB_INTERVALS.EVENT_SYNC_MS`)
- Modify: `apps/api/src/jobs/node-sync.ts` (use `JOB_INTERVALS.NODE_SYNC_MS`)
- Modify: `apps/api/src/jobs/metrics-history-collector.ts` (use `JOB_INTERVALS.METRICS_COLLECT_MS`)
- Modify: `apps/api/src/lib/cluster-client-pool.ts` (use `CACHE_TTL` + `K8S_CONFIG`)
- Modify: `apps/api/src/lib/karpenter-service.ts` (use `CACHE_TTL.KARPENTER_MS`)
- Modify: `apps/api/src/lib/sso.ts` (use `CACHE_TTL.SSO_PROVIDER_MS`)
- Modify: `apps/api/src/lib/presence.ts` (use `CACHE_TTL.PRESENCE_MS`)

- [ ] **Step 1: Update auth-guard.ts**

Replace hardcoded path arrays with imports from `@voyager/config`:

```typescript
import { AUTH_BYPASS_PATHS } from '@voyager/config'

// Replace the inline PUBLIC_PATH_PREFIXES array with AUTH_BYPASS_PATHS
// Keep PROTECTED_API_PREFIXES inline (only used here, not duplicated)
```

Replace the literal `['/api/auth/', '/health', '/docs', '/openapi.json']` with `AUTH_BYPASS_PATHS`.

- [ ] **Step 2: Update server.ts rate-limit whitelist**

Add import and replace the inline rate-limit allowlist:

```typescript
import { RATE_LIMIT_BYPASS_PATHS } from '@voyager/config'

// In the rate-limit registration, replace the hardcoded allowList with:
allowList: (req) => RATE_LIMIT_BYPASS_PATHS.some(p => req.url?.startsWith(p)) ?? false
```

Note: Check the current allowList implementation — it may use a different format. Match the existing pattern, just replace the path strings.

- [ ] **Step 3: Update all 5 job files**

For each job file, add import and replace the local interval constant:

**health-sync.ts:**
```typescript
import { JOB_INTERVALS } from '../config/jobs.js'
// Replace: const HEALTH_SYNC_INTERVAL_MS = 5 * 60 * 1000
// Use: JOB_INTERVALS.HEALTH_SYNC_MS
```

**alert-evaluator.ts:**
```typescript
import { JOB_INTERVALS } from '../config/jobs.js'
// Replace: const EVAL_INTERVAL_MS = 60 * 1000
// Use: JOB_INTERVALS.ALERT_EVAL_MS
// Replace: const DEDUP_WINDOW_MS = 5 * 60 * 1000
// Use: JOB_INTERVALS.ALERT_DEDUP_WINDOW_MS
```

**event-sync.ts:**
```typescript
import { JOB_INTERVALS } from '../config/jobs.js'
// Replace: const SYNC_INTERVAL_MS = 2 * 60 * 1000
// Use: JOB_INTERVALS.EVENT_SYNC_MS
```

**node-sync.ts:**
```typescript
import { JOB_INTERVALS } from '../config/jobs.js'
// Replace: const SYNC_INTERVAL_MS = 5 * 60 * 1000
// Use: JOB_INTERVALS.NODE_SYNC_MS
```

**metrics-history-collector.ts:**
```typescript
import { JOB_INTERVALS } from '../config/jobs.js'
// Replace: const COLLECT_INTERVAL_MS = 60 * 1000
// Use: JOB_INTERVALS.METRICS_COLLECT_MS
```

- [ ] **Step 4: Update cluster-client-pool.ts**

```typescript
import { CACHE_TTL } from '@voyager/config'
import { K8S_CONFIG } from '../config/k8s.js'

// Replace: const MAX_ENTRIES = 50
// Use: K8S_CONFIG.CLIENT_POOL_MAX

// Replace: const TTL_MS = 5 * 60 * 1000
// Use: CACHE_TTL.CLUSTER_CLIENT_MS

// Replace: const ENCRYPTION_KEY = process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
// Use: K8S_CONFIG.ENCRYPTION_KEY
```

Keep the `DEFAULT_TOKEN_TTL` record inline — it's provider-specific logic, not general config.

- [ ] **Step 5: Update karpenter-service.ts, sso.ts, presence.ts**

**karpenter-service.ts** (line 88):
```typescript
import { CACHE_TTL } from '@voyager/config'
// Before: const KARPENTER_CACHE_TTL_MS = Number.parseInt(process.env.KARPENTER_CACHE_TTL_MS ?? '60000', 10)
// After:  const KARPENTER_CACHE_TTL_MS = Number.parseInt(process.env.KARPENTER_CACHE_TTL_MS ?? String(CACHE_TTL.KARPENTER_MS), 10)
// IMPORTANT: Preserve the env-var override — only replace the default fallback value.
```

**sso.ts** (line 7):
```typescript
import { CACHE_TTL } from '@voyager/config'
// Before: const DEFAULT_SSO_PROVIDER_CACHE_TTL_MS = 60_000
// After:  (remove constant, use CACHE_TTL.SSO_PROVIDER_MS as the default)
// At the usage site (line 141), the env-var override MUST be preserved:
// const ttlMs = Number.parseInt(process.env.SSO_PROVIDER_CACHE_TTL_MS ?? String(CACHE_TTL.SSO_PROVIDER_MS), 10)
```

**presence.ts** (line 3):
```typescript
import { CACHE_TTL } from '@voyager/config'
// Replace: const PRESENCE_TTL_MS = 60_000
// Use: CACHE_TTL.PRESENCE_MS
```

- [ ] **Step 6: Replace K8S_CACHE_TTL in routers with CACHE_TTL.K8S_RESOURCES_SEC**

Multiple routers define their own `const K8S_CACHE_TTL = 30`. Replace with the centralized constant:

**services.ts**, **clusters.ts**, **namespaces.ts** (and any others found via grep):
```typescript
import { CACHE_TTL } from '@voyager/config'
// Remove: const K8S_CACHE_TTL = 30
// Use: CACHE_TTL.K8S_RESOURCES_SEC in all cached() calls
```

Run: `grep -rn "K8S_CACHE_TTL" apps/api/src/routers/` to find all occurrences.

- [ ] **Step 7: Replace hardcoded Zod .max() values with LIMITS constants**

Update Zod schemas in routers to use `LIMITS` from `@voyager/config`:

```typescript
import { LIMITS } from '@voyager/config'

// Before: z.string().min(1).max(255)
// After:  z.string().min(1).max(LIMITS.NAME_MAX)

// Before: z.string().max(2000)
// After:  z.string().max(LIMITS.DESCRIPTION_MAX)

// Before: z.number().min(1).max(100).default(50)
// After:  z.number().min(1).max(LIMITS.LIST_MAX).default(LIMITS.LIST_DEFAULT)
```

Routers to update: `alerts.ts`, `clusters.ts`, `events.ts`, `features.ts`, `dashboard.ts`, `authorization.ts`, `webhooks.ts`, `nodes.ts`, `audit.ts`.

Run: `grep -rn "\.max(255)\|\.max(2000)\|\.max(100)\.default(50)\|\.max(5000)" apps/api/src/routers/` to find all occurrences.

- [ ] **Step 8: Update clusters.ts ENCRYPTION_KEY**

In `apps/api/src/routers/clusters.ts` line 24, replace the local encryption key constant:

```typescript
import { K8S_CONFIG } from '../config/k8s.js'
// Remove: const ENCRYPTION_KEY = process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
// Use: K8S_CONFIG.ENCRYPTION_KEY throughout the file
```

- [ ] **Step 9: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: Zero errors. All existing tests pass (no behavior change).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/lib/ apps/api/src/jobs/ apps/api/src/server.ts apps/api/src/routers/
git commit -m "refactor: replace hardcoded values with centralized config constants"
```

---

## Task 5: Create shared error handler utility

**Files:**
- Create: `apps/api/src/lib/error-handler.ts`
- Modify: `apps/api/src/routers/services.ts` (replace 4 catch blocks)
- Modify: `apps/api/src/routers/pods.ts` (replace catch blocks)
- Modify: `apps/api/src/routers/namespaces.ts` (replace catch blocks)
- Modify: `apps/api/src/routers/deployments.ts` (replace catch blocks)
- Modify: `apps/api/src/routers/nodes.ts` (replace catch blocks)
- Modify: `apps/api/src/routers/metrics.ts` (replace catch blocks)
- Modify: `apps/api/src/routers/logs.ts` (replace catch blocks)

- [ ] **Step 1: Create error-handler.ts**

Create `apps/api/src/lib/error-handler.ts`:

```typescript
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
```

- [ ] **Step 2: Replace catch blocks in services.ts**

In `apps/api/src/routers/services.ts`, replace each catch block with:

```typescript
import { handleK8sError } from '../lib/error-handler.js'

// In each catch block, replace the inline error handling with:
} catch (error) {
  handleK8sError(error, 'list services')
}
```

Use descriptive operation names: `'list services'`, `'list services by cluster'`, `'get service'`, `'describe service'`.

- [ ] **Step 3: Replace catch blocks in pods.ts, namespaces.ts, deployments.ts, nodes.ts, metrics.ts, logs.ts**

Same pattern. Import `handleK8sError` and replace each inline catch block.

**Safe to replace** (standard K8s error pattern): `services.list`, `services.listByCluster`, `services.get`, `services.describe`, `pods.list` (outer catch only), `namespaces.list`, `deployments.list`, `nodes.list`, `metrics.get`, `logs.get`.

**Do NOT replace**: `pods.listStored` (returns `{ offline: true }` on error), `pods.list` inner catch for metrics (silently catches), any AI-specific catch blocks with `isTransientAiError`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/error-handler.ts apps/api/src/routers/
git commit -m "refactor: extract shared K8s error handler, deduplicate catch blocks"
```

---

## Task 6: Consolidate duplicate UI components

**Files:**
- Modify: `apps/web/src/components/Skeleton.tsx` (remove duplicate exports)
- Move: `apps/web/src/components/shared/CardSkeleton.tsx` → keep as canonical
- Move: `apps/web/src/components/shared/TableSkeleton.tsx` → keep as canonical
- Delete: `apps/web/src/components/shared/EmptyState.tsx`
- Modify: consumers (`ApiTokens.tsx`, `services/page.tsx`, `KarpenterPage.tsx`, `deployments/page.tsx`)

- [ ] **Step 1: Audit all imports of shared components**

Run these greps to find all consumers before making changes:

```bash
grep -rn "shared/CardSkeleton" apps/web/src/
grep -rn "shared/TableSkeleton" apps/web/src/
grep -rn "shared/EmptyState" apps/web/src/
grep -rn "from.*Skeleton" apps/web/src/ | grep -v node_modules | grep -v ".next"
grep -rn "from.*EmptyState" apps/web/src/ | grep -v node_modules
```

Record all consumer files and their import paths.

- [ ] **Step 2: Move shared skeleton components to components root**

Move (or copy + delete) the shared versions which are the superior implementations:
- `apps/web/src/components/shared/CardSkeleton.tsx` → `apps/web/src/components/CardSkeleton.tsx`
- `apps/web/src/components/shared/TableSkeleton.tsx` → `apps/web/src/components/TableSkeleton.tsx`

In `apps/web/src/components/Skeleton.tsx`, remove the `CardSkeleton` and `TableSkeleton` exports. Keep `Shimmer`, `SkeletonText`, `SkeletonCard`, and `SkeletonRow` — these are distinct components still in use. Note: `SkeletonCard` (cluster card skeleton) is different from `CardSkeleton` (stat card skeleton).

- [ ] **Step 3: Consolidate EmptyState**

Keep `apps/web/src/components/EmptyState.tsx` (uses `action?: ReactNode`).
Delete `apps/web/src/components/shared/EmptyState.tsx`.

For any consumers that used the shared version with object-style `action` prop, update to use ReactNode:
```typescript
// Before: action={{ label: 'Create', onClick: handleCreate }}
// After:  action={<Button onClick={handleCreate}>Create</Button>}
```

- [ ] **Step 4: Update all consumer imports**

Change all imports from `../shared/CardSkeleton` to `../CardSkeleton` (or `@/components/CardSkeleton` depending on the existing import style).

Same for `TableSkeleton` and `EmptyState`.

- [ ] **Step 5: Clean up shared directory**

If `apps/web/src/components/shared/` is now empty, delete the directory.
If other files remain, leave them.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test:e2e`
Manually check: Start dev servers, navigate to pages that use skeleton/empty states (services, deployments, karpenter).

E2E gate: zero failures required (CLAUDE.md Iron Rule #5).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/
git commit -m "refactor: consolidate duplicate Skeleton and EmptyState components"
```

---

## Task 7: Improve type safety — replace z.unknown()

**Files:**
- Modify: `apps/api/src/routers/services.ts` (replace z.unknown in labels, annotations, selector)
- Modify: `apps/api/src/routers/events.ts` (replace z.unknown in involvedObject)
- Modify: `apps/api/src/routers/features.ts` (replace z.unknown in targeting/defaultValue)
- Modify: `apps/api/src/routers/clusters.ts` (replace z.unknown in connectionConfig)
- Modify: `apps/api/src/routers/dashboard.ts` (replace z.unknown in widgets/filters)
- Modify: `apps/api/src/routers/dashboard-layout.ts` (replace z.unknown)
- Modify: `apps/api/src/routers/alerts.ts` (fix String() coercion)
- Modify: `apps/api/src/routers/audit.ts` (replace z.unknown)
- Modify: `apps/api/src/routers/health.ts` (replace z.unknown)

- [ ] **Step 1: Replace z.unknown() in K8s-specific fields**

In routers that handle K8s resources, replace `z.record(z.string(), z.unknown())` with typed alternatives:

**services.ts** — labels, annotations, selector are always string→string maps:
```typescript
// Before: z.record(z.string(), z.unknown())
// After:  z.record(z.string(), z.string())
```

**events.ts** — `involvedObject` is a K8s ObjectReference:
```typescript
// Before: z.record(z.string(), z.unknown()).optional()
// After:  z.record(z.string(), z.string()).optional()
```

**clusters.ts** — `connectionConfig` already has a `connectionConfigSchema` union; for the generic fallback:
```typescript
// Before: z.record(z.string(), z.unknown())
// After:  z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
```

- [ ] **Step 2: Replace z.unknown() in non-K8s fields**

**features.ts** — targeting and defaultValue are JSON objects stored as JSONB:
```typescript
// targeting: z.record(z.string(), z.unknown()) → z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
// defaultValue: z.unknown() → z.union([z.string(), z.number(), z.boolean()]).optional()
```

**dashboard.ts** — widgets and filters are frontend-defined JSON:
```typescript
// z.array(z.unknown()) → z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
// z.record(z.string(), z.unknown()) → z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
```

**audit.ts** — metadata is arbitrary JSON from audit logging:
```typescript
// z.unknown() → z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
```

**health.ts** — details is arbitrary JSON from health checks:
```typescript
// z.unknown().nullable() → z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional()
```

- [ ] **Step 3: Fix alert threshold String() coercion**

In `apps/api/src/routers/alerts.ts`:

```typescript
// Line 43 — create procedure:
// Before: threshold: String(input.threshold),
// After:  threshold: input.threshold,

// Line 58 — update procedure:
// Before: if (fields.threshold !== undefined) updateData.threshold = String(fields.threshold)
// After:  if (fields.threshold !== undefined) updateData.threshold = fields.threshold
```

Drizzle's `numeric()` column type accepts number values directly.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: Zero errors. If any test sends `z.unknown()` data that doesn't match the new schema, update the test data to match.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routers/
git commit -m "refactor: replace z.unknown() with typed schemas, fix threshold coercion"
```

---

## Task 8: Centralize cache key patterns

**Files:**
- Create: `apps/api/src/lib/cache-keys.ts`
- Modify: `apps/api/src/routers/services.ts` (use CACHE_KEYS)
- Modify: `apps/api/src/routers/pods.ts` (use CACHE_KEYS)
- Modify: `apps/api/src/routers/namespaces.ts` (use CACHE_KEYS)
- Modify: `apps/api/src/routers/deployments.ts` (use CACHE_KEYS)
- Modify: `apps/api/src/routers/clusters.ts` (use CACHE_KEYS)
- Modify: `apps/api/src/lib/cache.ts` (use CACHE_KEYS for invalidation patterns)

- [ ] **Step 1: Grep for all existing cache key formats**

Run this to capture exact current formats:
```bash
grep -rn '`k8s:' apps/api/src/routers/ apps/api/src/lib/cache.ts
```

Record every key format exactly. The centralized file MUST match these formats to avoid cache misses.

- [ ] **Step 2: Create cache-keys.ts based on Step 1 grep results**

Create `apps/api/src/lib/cache-keys.ts`. **DO NOT copy this template blindly** — populate it using the exact formats found in Step 1's grep output. Each key builder MUST produce identical strings to the existing inline patterns.

The file structure should be:
```typescript
/** Centralized cache key builders — formats MUST match existing keys exactly.
 *  Changing a format causes a mass cache miss on deploy. */

export const CACHE_KEYS = {
  // Fill in based on Step 1 grep results.
  // Each entry: functionName(params) => `exact:existing:format`
} as const
```

Cross-reference each entry against the Step 1 grep output before finalizing. Pay attention to:
- Whether keys include `:list`, `:v2`, or other suffixes
- Whether keys use clusterId or are global singletons
- Whether namespace is part of the key or not

- [ ] **Step 3: Replace inline cache keys in routers**

In each router file, import `CACHE_KEYS` and replace template literal cache keys:

```typescript
import { CACHE_KEYS } from '../lib/cache-keys.js'

// Before: const cacheKey = `k8s:${input.clusterId}:services:${input.namespace ?? 'all'}`
// After:  const cacheKey = CACHE_KEYS.k8sServices(input.clusterId, input.namespace)
```

- [ ] **Step 4: Fix or remove stale cache invalidation patterns in cache.ts**

`apps/api/src/lib/cache.ts` (~lines 42-48) has a `knownKeys` array with bare keys like `'k8s:version'`, `'k8s:nodes'` etc. that are NOT cluster-scoped — they will never match the actual cluster-scoped keys (`k8s:${clusterId}:nodes`). These appear to be stale/dead code from an earlier iteration.

Action: Check if the `invalidateK8sCache()` function is called anywhere. If it is, replace the bare key patterns with a prefix-scan approach (e.g., `SCAN` matching `k8s:${clusterId}:*`). If it is not called, delete the dead function. Do NOT blindly replace with CACHE_KEYS references — the function's approach (exact key match) is fundamentally wrong for cluster-scoped keys.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build && pnpm test`

Double-check: grep for any remaining inline `k8s:` cache key patterns in routers:
```bash
grep -rn '`k8s:' apps/api/src/routers/
```
Expected: Zero results (all moved to CACHE_KEYS).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/cache-keys.ts apps/api/src/lib/cache.ts apps/api/src/routers/
git commit -m "refactor: centralize all Redis cache key patterns into cache-keys.ts"
```

---

## Task 9: Final verification and cleanup

- [ ] **Step 1: Full build and test suite**

```bash
pnpm typecheck && pnpm build && pnpm test && pnpm lint
```

All must pass with zero errors.

- [ ] **Step 2: Grep for remaining hardcoded values**

```bash
# Check no raw magic numbers remain in job files
grep -rn "60 \* 1000\|5 \* 60\|2 \* 60" apps/api/src/jobs/

# Check no raw cache key strings remain in routers
grep -rn '`k8s:' apps/api/src/routers/

# Check no hardcoded domains remain
grep -rn "voyager-platform.voyagerlabs.co" apps/web/src/

# Check K8S_CACHE_TTL duplication is gone from routers
grep -rn "K8S_CACHE_TTL\|= 30;" apps/api/src/routers/
```

Expected: Zero results for all three.

- [ ] **Step 3: Start dev servers and smoke test**

```bash
docker compose up -d && pnpm dev
```

Navigate to http://localhost:3000, log in with `admin@voyager.local` / `admin123`.
Verify: Dashboard loads, clusters visible, no console errors.

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "refactor: code quality cleanup — final verification fixes"
```
