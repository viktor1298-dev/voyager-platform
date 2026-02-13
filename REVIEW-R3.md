# 📋 Code Review Report — Voyager R3

📊 **Score: 8.5/10**
📌 **Status: CHANGES_REQUESTED**

---

## 🔴 Critical (0)

None.

## 🟠 High (1)

**H1.** `apps/api/src/lib/k8s.ts:8-10` — **`getKubeConfig()` silently returns broken KubeConfig on failure.**
After `loadFromDefault()` throws, `_kc` is still cached but has no valid clusters/contexts. Any subsequent `makeApiClient()` call will create an API client with no server URL, leading to cryptic runtime errors (not the clean "K8s features disabled" message implied by the warn log).
— **Fix:** Set a `_k8sDisabled = true` flag in the catch block. In `getCoreV1Api()` / `getAppsV1Api()` etc., check this flag and throw a clear `TRPCError` with `code: 'PRECONDITION_FAILED'` and message "K8s not configured" before calling `makeApiClient()`.

## 🟡 Medium (2)

**M1.** `apps/api/src/routers/clusters.ts:35` — **`clusters.get` throws plain `Error` instead of `TRPCError`.**
The global error handler in `trpc.ts` catches it and wraps it as `INTERNAL_SERVER_ERROR` (500), but this should be a 404. Same issue in `nodes.ts:13` and `clusters.ts` update/delete.
— **Fix:** `throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })` — same for nodes and delete/update handlers.

**M2.** `apps/web/src/lib/trpc.ts:4` — **Relative import crossing app boundaries: `import type { AppRouter } from '../../../api/src/routers/index'`.**
This creates a fragile path coupling between `apps/web` and `apps/api` internal source. If the API directory structure changes, the web build breaks.
— **Fix:** Export `AppRouter` type from a shared package (e.g., `@voyager/types` or a new `@voyager/api-types`), or at minimum add a barrel export in `apps/api/package.json` with `"exports": { "./types": "./src/routers/index.ts" }` and import as `@voyager/api/types`.

## 🔵 Low (5)

**L1.** `apps/api/src/routers/clusters.ts:71` — `live` endpoint hardcodes `name: 'minikube'` and `endpoint: 'https://192.168.49.2:8443'`. Fine for MVP but should be noted.

**L2.** `apps/web/src/app/clusters/[id]/page.tsx:111-117` — Nodes and events from live data are typed as `Record<string, string>` / `Record<string, unknown>` with manual casting. Consider using the shared types from `@voyager/types` (`KubeNode`, `KubeEvent`).

**L3.** `apps/web/src/components/TopBar.tsx:13` — `any` type cast: `(e: any) => e.type === 'Warning'`. Use the inferred tRPC type or `KubeEvent`.

**L4.** `apps/api/src/routers/clusters.ts` — Duplicated event-sorting logic between `live` (line 50-56) and `liveEvents` (line 98-106). Extract to a shared helper.

**L5.** `apps/web/src/app/settings/page.tsx:92` — "Last Sync" shows `new Date().toLocaleTimeString()` which is the current render time, not the actual last fetch time. Use `liveQuery.dataUpdatedAt` instead.

## ⏳ Deferred (5)

1. **Authentication & Authorization** — all routes are `publicProcedure`, no auth middleware
2. **Unit & Integration Tests** — no test files present
3. **Redis caching layer** — Redis service in Helm but no app-level caching
4. **Rate limiting** — no rate limiting on API endpoints
5. **Multi-cluster live connection** — currently only one live K8s cluster supported

---

## ✅ What's Good

- **Excellent monorepo structure** — clean separation: `apps/api`, `apps/web`, `packages/*`, `charts/`
- **Provider normalization** is clean and well-implemented (alias mapping + `VALID_PROVIDERS` const)
- **Lazy K8s init** — big improvement from R2, server no longer crashes without kubeconfig
- **tRPC + Drizzle combo** is solid — type-safe end-to-end, proper Zod validation on all inputs
- **Shared types package** — good foundation for cross-package type safety
- **Helm chart** is production-ready: ServiceAccount, RBAC with least-privilege, health probes, resource limits
- **UI polish** is impressive for MVP — skeleton loading states, glassmorphism design system, responsive layout
- **ConnectionStatus component** — excellent UX, shows Connected/Reconnecting/Disconnected with visual feedback
- **Settings page** — well-structured with section cards, shows real platform state
- **Cluster Detail page** — comprehensive redesign with header card, nodes table, events timeline, breadcrumbs
- **Graceful shutdown** in server.ts with SIGTERM/SIGINT handling
- **Global tRPC error handler** — catches unhandled errors and wraps them properly

## 🎯 Top 3 Priorities

1. **H1** — Fix silent KubeConfig failure (API returns cryptic errors when K8s unavailable)
2. **M1** — Use proper `TRPCError` codes (NOT_FOUND vs INTERNAL_SERVER_ERROR)
3. **M2** — Fix cross-app relative import for `AppRouter` type

---

*Reviewed by ליאור • R3 • 2026-02-14 • Commit 800302a • Branch feat/init-monorepo*
