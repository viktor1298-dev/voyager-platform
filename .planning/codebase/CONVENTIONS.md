# Coding Conventions

**Analysis Date:** 2026-03-30

## Code Style

**Formatter & Linter:** Biome 2.x (single tool for both)
- Config: `biome.json`
- Indent: 2 spaces
- Line width: 100 characters
- Quote style: single quotes
- Semicolons: as-needed (omitted where possible)

**Key Linter Overrides:**
- `noExplicitAny`: off (heavy use of `any` for K8s API types and tRPC plumbing)
- `noThenProperty`: off
- `noNonNullAssertion`: off (frequently used with K8s metadata: `authCookie!.httpOnly`)

**Run Commands:**
```bash
pnpm lint                    # All packages via turbo
pnpm --filter api lint       # API only: biome check src/
pnpm --filter web lint       # Web only: biome check src/
```

## Naming Patterns

**Files:**
- Components: PascalCase (`ErrorBoundary.tsx`, `Sidebar.tsx`, `CommandPalette.tsx`)
- Hooks: camelCase with `use` prefix (`useResources.ts`, `useMetricsSSE.ts`, `usePageTitle.ts`)
- Stores: kebab-case (`cluster-context.ts`, `resource-store.ts`, `auth.ts`)
- Routers: kebab-case matching resource name (`pods.ts`, `network-policies.ts`, `resource-quotas.ts`)
- Config: kebab-case (`animation-constants.ts`, `cache-keys.ts`, `navigation.ts`)
- Tests (unit): `{module}.test.ts` in `__tests__/` directory
- Tests (E2E): `{feature}.spec.ts` in `tests/e2e/`
- Tests (visual): `{page}.visual.spec.ts` in `tests/visual/`

**Functions:**
- camelCase for all functions and methods
- Hooks: `use{Feature}` (e.g., `useClusterResources`, `useConnectionState`)
- Mappers: `map{Resource}` (e.g., `mapPod`, `mapService` in `apps/api/src/lib/resource-mappers.ts`)
- Error handlers: `handle{Domain}Error` (e.g., `handleK8sError`, `handleTRPCError`)

**Variables:**
- camelCase for local variables and parameters
- UPPER_SNAKE_CASE for module-level constants (`CACHE_TTL`, `LIMITS`, `DURATION`, `EASING`)
- Exported constant objects use UPPER_SNAKE_CASE keys (`CACHE_KEYS.k8sPods(...)` -- methods are camelCase)

**Types:**
- PascalCase for interfaces and types (`Context`, `ClusterContextState`, `ConnectionState`)
- Zod schemas: camelCase with `Schema` suffix (`servicePortSchema`, `serviceSummarySchema`)

**Components:**
- PascalCase for component names matching filename (`ErrorBoundary`, `QueryError`, `Sidebar`)
- Props use inline object type or named `Props`/`{Component}Props` interface

## Module System

**ESM Only:**
- All packages set `"type": "module"` in package.json
- Import extensions: use `.js` in backend imports even for `.ts` source files (`from '../lib/auth.js'`)
- Frontend (Next.js bundler resolution): no extension needed, uses `@/` alias

**Workspace Packages:**
- Prefix: `@voyager/` (`@voyager/db`, `@voyager/types`, `@voyager/config`)
- Linked via: `"workspace:*"` in package.json dependencies

## Import Organization

**Order (observed pattern):**
1. Node.js built-ins (`node:fs`, `node:path`, `node:url`)
2. External packages (`@kubernetes/client-node`, `@trpc/server`, `zod`)
3. Workspace packages (`@voyager/config`, `@voyager/db`, `@voyager/types`)
4. Internal absolute (`../lib/...`, `../services/...`)
5. Relative (`./helpers`)

**Path Aliases:**
- `@/*` maps to `./src/*` (web app only, configured in `apps/web/tsconfig.json`)
- API has no path aliases -- uses relative imports with `.js` extensions

**Key Import Rules:**
- Never use `httpBatchLink` from `@trpc/react-query` -- use `httpLink` (batched URLs exceed nginx limits)
- `motion` package: import from `motion/react`, not `framer-motion`
- `@xterm/xterm`: must use dynamic `import()` inside `useEffect` (SSR unsafe)
- React Flow `nodeTypes`: define outside component or `useMemo` to prevent infinite re-renders

## Error Handling

**Backend (tRPC Routers):**

K8s routers use the centralized `handleK8sError()` from `apps/api/src/lib/error-handler.ts`:
```typescript
// Standard pattern in every K8s router catch block
try {
  // K8s API calls...
} catch (err) {
  handleK8sError(err, 'list pods')
}
```
- Re-throws `TRPCError` as-is
- Maps K8s 404 to `TRPCError { code: 'NOT_FOUND' }`
- Everything else becomes `INTERNAL_SERVER_ERROR`

**tRPC Procedure Hierarchy:**
- `publicProcedure` -- wraps non-TRPCError in `INTERNAL_SERVER_ERROR`
- `protectedProcedure` -- throws `UNAUTHORIZED` if no session
- `adminProcedure` -- throws `FORBIDDEN` if not admin role
- `authorizedProcedure(objectType, relation)` -- RBAC check, throws `FORBIDDEN`

**Error Reporting (Sentry):**
- Client-caused errors (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`) are NOT sent to Sentry
- Server errors are captured via `captureException()` in the tRPC error formatter (`apps/api/src/trpc.ts`)
- Frontend ErrorBoundary (`apps/web/src/components/ErrorBoundary.tsx`) captures to Sentry with component stack

**Redis Failures:**
```typescript
// Redis always fails silently -- never crashes the request
try {
  await cached(key, ttl, fetchFn)
} catch { /* fall through */ }
```

**Audit Logging:**
```typescript
// Audit must never break the main operation
try {
  await logAudit(ctx, 'pod.delete', 'pod', resourceId, details)
} catch { /* audit must not break the operation */ }
```

**Frontend Error Handling:**
- `handleTRPCError()` in `apps/web/src/lib/trpc.ts` redirects to `/login` on UNAUTHORIZED
- `QueryError` component in `apps/web/src/components/ErrorBoundary.tsx` parses tRPC/Zod errors into user-friendly messages
- `ErrorBoundary` class component wraps page sections with Sentry capture

## State Management

**Server State (TanStack Query via tRPC):**
- Global `staleTime: 30s` to prevent unnecessary refetches
- Per-query `refetchInterval` for real-time data (e.g., clusters: 60s, alerts: 30s)
- tRPC hooks: `trpc.{router}.{procedure}.useQuery()` / `useMutation()`

**Real-time State (SSE + Zustand):**
- `useResourceStore` in `apps/web/src/stores/resource-store.ts` -- Zustand with `subscribeWithSelector`
- Keys: `${clusterId}:${resourceType}` for resource data
- Operations: `setResources()` (snapshot), `applyEvent()` (ADDED/MODIFIED/DELETED), `clearCluster()`
- Selectors use `useCallback` to prevent infinite loops:
```typescript
// CORRECT: stable selector reference
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  return useResourceStore(
    useCallback(
      (s) => (s.resources.get(`${clusterId}:${type}`) ?? EMPTY) as T[],
      [clusterId, type],
    ),
  )
}
```

**Client State (Zustand):**
- `useClusterContext` (`apps/web/src/stores/cluster-context.ts`) -- persisted to localStorage
- `useAuthStore` (`apps/web/src/stores/auth.ts`) -- session sync
- Stores use `create<State>()()` pattern with typed middleware

**Avoid:**
- `useMutation` in `useEffect` dependencies (returns new reference each render -- use ref pattern)
- Branching on `typeof window` in render (causes SSR hydration errors -- use `useState(false)` + `useEffect`)

## Component Patterns

**Client Components:**
- Always start with `'use client'` directive
- Props: inline object types for simple components, named interfaces for complex ones
```typescript
export function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  isDesktop,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  isDesktop: boolean
}) {
```

**Animations (Motion v12):**
- Import from `motion/react` (not `framer-motion`)
- Use `motion.div` (not `m.div` -- `LazyMotion strict` is disabled)
- All timing/easing from `apps/web/src/lib/animation-constants.ts`
- Design style: "Confident & Expressive" (Style B) per `docs/DESIGN.md`

**Dynamic Imports (SSR safety):**
```typescript
const CommandPalette = dynamic(
  () => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
)
```

**CSS:**
- Tailwind 4 utility classes
- CSS custom properties for theme colors: `var(--color-text-primary)`, `var(--color-accent)`, `var(--color-status-error)`
- Chart colors: `--chart-1..5`, `--color-chart-*` from globals.css

## tRPC Router Patterns

**Standard K8s Resource Router:**
```typescript
export const podsRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        // 1. Try WatchManager in-memory store first
        const watched = watchManager.getResources(input.clusterId, 'pods')
        if (watched) {
          return (watched as k8s.V1Pod[]).map((p) => mapPod(p))
        }
        // 2. Fallback: K8s API via cached()
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.CoreV1Api)
        const response = await cached(CACHE_KEYS.k8sPods(input.clusterId), 15, () =>
          api.listPodForAllNamespaces(),
        )
        return response.items.map((p) => mapPod(p))
      } catch (err) {
        handleK8sError(err, 'list pods')
      }
    }),
})
```

**Key Router Rules:**
- Always validate inputs with Zod schemas
- Use `z.string().uuid()` for cluster IDs
- Import `LIMITS` from `@voyager/config` for string length validation
- Use `CACHE_KEYS.*` from `apps/api/src/lib/cache-keys.ts` -- never construct cache keys inline
- Use `CACHE_TTL.*` from `@voyager/config` -- never hardcode TTL values
- `cached()` TTL is in SECONDS (not ms)
- Mutations: invalidate relevant cache keys after writes
- Use `.output()` Zod schema for type safety when the shape is non-trivial

## Centralized Configuration

| Config File | Exports | Usage |
|-------------|---------|-------|
| `packages/config/src/routes.ts` | `API_ROUTES`, `AUTH_BYPASS_PATHS`, `RATE_LIMIT_BYPASS_PATHS` | `server.ts`, `auth-guard.ts` |
| `packages/config/src/cache.ts` | `CACHE_TTL` | Cluster client pool, all routers |
| `packages/config/src/validation.ts` | `LIMITS` (NAME_MAX, LIST_MAX, etc.) | All tRPC routers with Zod schemas |
| `packages/config/src/sse.ts` | SSE heartbeat/reconnect constants | SSE subscriptions |
| `packages/config/src/ai.ts` | `AI_CONFIG` | AI service |
| `apps/api/src/config/jobs.ts` | `JOB_INTERVALS` | All background jobs |
| `apps/api/src/config/k8s.ts` | `K8S_CONFIG` | Cluster client pool |

**Rule:** Do NOT add new hardcoded values to routers or jobs. Add constants to the appropriate config file and import from there.

## Comments

**When to Comment:**
- Complex business logic (e.g., Helm release decoding: base64 + gzip + JSON)
- Non-obvious workarounds with bug reference IDs (e.g., `// BUG-RD-004`)
- Feature ticket references (e.g., `// SB-010`, `// DB-003`, `// IA-010`)

**JSDoc:**
- Used sparingly on exported functions and shared utilities
- `@deprecated` tags on deprecated exports (e.g., `TEST_USER`)

**Inline:**
- `/* audit must not break the operation */` in catch blocks
- `/* metrics-server may not be available */` for expected failures

## Logging

**Framework:** `console` (stdout/stderr)
- `console.error('[ErrorBoundary] Caught error:', ...)` with component prefix
- Structured logging not enforced -- console.log/warn/error used directly
- Sentry for error aggregation (backend: `@sentry/node`, frontend: `@sentry/nextjs`)
- OpenTelemetry for tracing (backend only, optional)

---

*Convention analysis: 2026-03-30*
