# Voyager Platform — Code Review Round 2

**Reviewer:** ליאור (Tech Lead)
**Date:** 2026-02-14
**Score: 7.4 / 10** (up from 6.8)

---

## Improvements Since Last Review ✅

1. **Seed data** — Realistic, well-structured seed with 6 clusters, 35+ nodes, 30 events. Production guard (`NODE_ENV`) is good.
2. **PVCs** — Proper conditional PVC templates with configurable storageClass and size. Recreate strategy for stateful deployments — correct.
3. **Health probes** — Added to all deployments (web, api, postgres, redis). Good `initialDelaySeconds` and `periodSeconds` values.
4. **RBAC** — Read-only ClusterRole with toggle. Permissions are appropriately scoped (get/list/watch only). ServiceAccount referenced in API deployment.
5. **Dashboard grouping** — Status normalization, filter pills, grouped-by-status layout. Good UX pattern.
6. **Events page** — Full table with filters, search, loading/empty states, auto-refresh.
7. **Error boundary** — Root `error.tsx` catches unhandled errors with retry.
8. **Graceful shutdown** — API handles SIGTERM/SIGINT properly.

---

## Critical Issues 🔴

### C1. No Authentication or Authorization
**Status: STILL UNRESOLVED from R1**
All tRPC procedures use `publicProcedure`. The `clusters.delete` and `clusters.create` mutations are openly accessible. Anyone with network access can delete all clusters.

**Fix:** Add auth middleware (JWT/session) to tRPC context. At minimum, protect mutation endpoints.

### C2. DATABASE_URL in Secret is plaintext-constructable
`secret.yaml` stores `DATABASE_URL` as `b64enc` of `values.yaml` plaintext. The `values-dev.yaml` has `dbPassword: dm95YWdlcl9kZXY=` hardcoded. In production, `secret.dbPassword` defaults to empty string — this means **no password**.

**Fix:** Use external secrets operator or sealed secrets. Never commit base64 passwords. Add validation that `secret.dbPassword` is non-empty.

### C3. `.env` committed to repo
```
DATABASE_URL=postgresql://voyager:voyager_dev@localhost:5432/voyager_dev
```
The `.env` file with credentials is in the repo. Even for dev, this is a bad pattern.

**Fix:** Remove `.env` from git, ensure it's in `.gitignore`.

### C4. No Tests — STILL UNRESOLVED
Zero test files across the entire monorepo. No unit tests, no integration tests, no e2e tests.

**Fix:** Add at minimum: API router tests with mocked DB, component render tests for dashboard/events pages.

---

## High Issues 🟠

### H1. K8s client initialized at module load with no error handling
`apps/api/src/lib/k8s.ts` — `kc.loadFromDefault()` runs at import time. If no kubeconfig exists (e.g., in CI or a non-K8s environment), the entire API crashes on startup.

**Fix:** Lazy-initialize the K8s client, or wrap in try/catch with graceful degradation.

### H2. No rate limiting — STILL UNRESOLVED
The `clusters.live` endpoint hits the K8s API (5 separate API calls). With 30s polling from every connected browser tab, this can overwhelm the K8s API server. No rate limiting on Fastify.

**Fix:** Add `@fastify/rate-limit`. Cache K8s responses (Redis is already deployed but unused).

### H3. tRPC client imports server types via relative path
```ts
import type { AppRouter } from '../../../api/src/routers/index'
```
This cross-app import creates a fragile coupling and may break in Docker builds or if directory structure changes.

**Fix:** Export `AppRouter` type from a shared package, or use a proper tRPC type-export pattern.

### H4. `clusters.live` does 5 K8s API calls sequentially
`versionApi.getCode()`, `listNode()`, `listPodForAllNamespaces()`, `listNamespace()`, `listEventForAllNamespaces()`, `listDeploymentForAllNamespaces()` — 6 calls, all sequential.

**Fix:** Use `Promise.all()` for independent calls. This will cut response time significantly.

### H5. Redis deployed but completely unused
Redis is in docker-compose and Helm charts but no code references it. It's dead infrastructure.

**Fix:** Use it for K8s API response caching (solves H2 and H4), or remove it.

### H6. Ingress has no TLS configuration
`ingress.yaml` has no TLS section. `voyager-platform.voyagerlabs.co` would serve over plain HTTP.

**Fix:** Add TLS with cert-manager annotation or manual secret reference.

---

## Medium Issues 🟡

### M1. Events page fetches ALL data via `clusters.live` instead of dedicated endpoint
The events page calls `clusters.live` (which fetches nodes, pods, namespaces, deployments, AND events) just to display events. This is wasteful.

**Fix:** Use `clusters.liveEvents` instead — it already exists.

### M2. `as unknown as string` type casts in K8s event sorting
```ts
const aTime = (a.lastTimestamp || a.metadata?.creationTimestamp) as unknown as string | undefined
```
This pattern appears twice. It's a code smell indicating incorrect type understanding.

**Fix:** Properly type or use `String()` / `.toISOString()`.

### M3. Duplicate event sorting logic
Event sorting by timestamp is copy-pasted in `clusters.live`, `clusters.liveEvents`, and the events page client-side. DRY violation.

### M4. `ConnectionStatus` always shows "Connected" even on error
The TopBar shows a green "Connected" indicator regardless of whether the K8s API is actually reachable.

**Fix:** Check `liveQuery.isError` and show disconnected state.

### M5. No ServiceAccount template
`deployment-api.yaml` references `serviceAccountName: voyager-api` but there's no ServiceAccount template. RBAC binding references it too. The deploy will fail.

**Fix:** Add a `serviceaccount.yaml` template.

### M6. DB deployment uses Deployment instead of StatefulSet
PostgreSQL with a PVC should use StatefulSet for stable network identity and ordered pod management.

### M7. `packages/types` is empty
```ts
export {}
```
Dead package adding noise to the monorepo.

### M8. No resource requests/limits on postgres and redis containers
Only web and api deployments have resource specs. DB and Redis have none.

---

## Low Issues 🔵

### L1. Inline styles mixed with Tailwind
`onMouseEnter`/`onMouseLeave` handlers manually set `style.boxShadow` and `style.transform`. This bypasses React's declarative model and can cause stale state.

### L2. `any` type in TopBar
```ts
data.events.filter((e: any) => e.type === 'Warning')
```

### L3. Seed uses `Math.random()` — non-deterministic
Seed data includes `Math.floor(Math.random() * 30)` for pod counts, making seeds non-reproducible.

### L4. Missing `aria-label` on filter buttons and search inputs
Accessibility gap — screen readers won't understand the filter pill purpose.

### L5. Event table uses fixed pixel column widths
`grid-cols-[80px_70px_100px_140px_100px_1fr_50px]` won't adapt well to different content lengths or locales.

### L6. No `key` stability on events list
Key is `${event.involvedObject}-${event.reason}-${event.lastTimestamp}-${i}` — including index defeats the purpose of keys.

### L7. `docker-compose.yml` uses `POSTGRES_HOST_AUTH_METHOD: trust`
This allows passwordless connections to the database. Fine for local dev but dangerous if accidentally used elsewhere.

---

## Score Breakdown

| Category | R1 | R2 | Notes |
|----------|-----|-----|-------|
| Architecture | 7 | 7.5 | Monorepo structure solid, K8s integration clean |
| Code Quality | 6 | 7 | Better TypeScript, good Zod validation, some type casts |
| Security | 4 | 4.5 | Auth still missing, .env committed, no TLS |
| Helm/Infra | 6 | 7.5 | PVCs, RBAC, probes added. Missing SA, no TLS |
| UI/UX | 7 | 8 | Grouping, filters, events page, loading/empty states |
| Testing | 0 | 0 | Still zero tests |
| Error Handling | 6 | 7.5 | Error boundary, tRPC middleware, graceful shutdown |
| Performance | 6 | 6.5 | Sequential K8s calls, unused Redis, over-fetching |
| **Overall** | **6.8** | **7.4** | |

---

## Top 3 Priorities for Next Sprint

1. **🔐 Authentication** — Add JWT or session-based auth to tRPC. This is the #1 blocker for any non-local deployment. Protect mutations immediately.

2. **🧪 Tests** — Add at least: API router unit tests (mock DB), seed validation test, one React component test. Set up Vitest. Target 30% coverage as a start.

3. **⚡ K8s API caching + Redis** — Use the already-deployed Redis to cache K8s API responses (TTL 15-30s). This fixes the sequential call performance issue and rate limiting concern in one shot.

---

## Verdict: CHANGES_REQUESTED

Significant progress on infrastructure and UI. The platform looks and feels much better. But the same two critical gaps from R1 remain: **no auth** and **no tests**. These must be addressed before any staging/production deployment.
