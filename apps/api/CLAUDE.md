# apps/api — Fastify Backend

Fastify 5 + tRPC 11 + Drizzle ORM backend. Entry point: `src/server.ts`.

## Commands

```bash
pnpm dev              # tsx watch, port 4000
pnpm build            # tsc (builds @voyager/types and @voyager/db first)
pnpm test             # vitest run
pnpm test -- src/__tests__/auth.test.ts  # single file
pnpm seed:admin       # seed admin user
```

## Source Layout

```
src/
├── server.ts              # Entry point (DO NOT add migrate() here)
├── trpc.ts                # Context, procedure definitions (public/protected/admin/authorized)
├── routers/               # 28 tRPC routers (index.ts = registry)
├── routes/                # Non-tRPC: ai-stream.ts (SSE), mcp.ts
├── jobs/                  # Background: health-sync, alert-evaluator, metrics-history-collector, node-sync, event-sync
├── services/              # Business logic (AI, anomaly detection)
└── lib/                   # Core modules (no deps on routers/services)
    ├── cluster-client-pool.ts   # Lazy per-cluster K8s clients
    ├── cluster-watch-manager.ts # K8s informers → voyagerEmitter
    ├── event-emitter.ts         # Decouples watchers from SSE consumers
    ├── auth.ts                  # Better-Auth handler (/api/auth/*)
    ├── authorization.ts         # DB-backed RBAC
    ├── credential-crypto.ts     # Cluster credential encryption/decryption
    ├── feature-flags.ts         # OpenFeature + flagd
    ├── cache.ts                 # Redis cache (failures are non-fatal)
    ├── sentry.ts                # Error tracking (skip client-caused errors)
    └── telemetry.ts             # OpenTelemetry setup
```

## Key Patterns

- **Dependency direction:** routers/ → services/ → lib/ (routers can skip services)
- **Procedure types:** `publicProcedure` (no auth), `protectedProcedure` (session required), `adminProcedure` (admin role), `authorizedProcedure` (RBAC check)
- **Multi-cloud K8s:** Cluster client pool handles AWS EKS, Azure AKS, GCP GKE credential types
- **Redis failures:** Always catch and fall through — never crash the request
- **Audit logging:** `try { logAudit(...) } catch { console.error(...) }` — never break the main operation
- **Rate limiting:** 200 req/min per IP; whitelist: `/api/auth/`, `/health`, `/trpc`
- **Health endpoints:** `/health` (always up), `/health/metrics-collector` (collector status)

## Adding a New Router

1. Create `src/routers/my-feature.ts` with tRPC procedures
2. Register in `src/routers/index.ts`
3. Export types for the web app via `@voyager/types` if needed
