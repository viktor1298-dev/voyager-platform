# External Integrations

**Analysis Date:** 2026-03-30

## Data Storage

### PostgreSQL 17 + TimescaleDB

- **Image:** `timescale/timescaledb:latest-pg17` (local), `postgres:17-alpine` (Helm)
- **Connection:** `DATABASE_URL` env var (e.g., `postgresql://voyager:voyager_dev@localhost:5432/voyager_dev`)
- **Client:** Drizzle ORM (`drizzle-orm` ^0.45.2) with `pg` driver
- **Schema source of truth:** `charts/voyager/sql/init.sql` (NOT Drizzle migration files)
- **TimescaleDB usage:** `time_bucket()` for metrics aggregation in `metrics-history` and `node-metrics-history` hypertables
- **Schema package:** `packages/db/` — Drizzle schema files mirror init.sql for TypeScript type generation
- **Key files:** `packages/db/src/schema/` (20 schema files), `charts/voyager/sql/init.sql`

### Redis 7

- **Image:** `redis:7-alpine`
- **Connection:** `REDIS_URL` env var (default: `redis://localhost:6379`)
- **Client:** `redis` ^5.11.0 (`createClient`)
- **Purpose:** Caching layer (fallback when K8s watches not ready), NOT primary data source
- **Failure behavior:** Non-fatal — all Redis calls wrapped in try/catch, app functions without Redis
- **Cache key management:** Centralized in `apps/api/src/lib/cache-keys.ts`
- **TTL values:** Centralized in `packages/config/src/cache.ts` (`CACHE_TTL`)
- **Key file:** `apps/api/src/lib/cache.ts`

## Kubernetes API

### Multi-Cloud Cluster Client

- **Client:** `@kubernetes/client-node` ^1.4.0
- **Providers supported:** AWS EKS, Azure AKS, Google GKE, raw kubeconfig, minikube
- **Client pool:** `apps/api/src/lib/cluster-client-pool.ts` — lazy-loaded per-cluster, LRU eviction (max 50), token refresh with 80% TTL threshold
- **Factory:** `apps/api/src/lib/k8s-client-factory.ts` — creates KubeConfig per provider type
- **Credential encryption:** AES-256-GCM via `apps/api/src/lib/credential-crypto.ts`
- **Env var:** `CLUSTER_CRED_ENCRYPTION_KEY` (64-char hex, required)

### AWS EKS Authentication

- **SDKs:** `@aws-sdk/client-sts` ^3.1019.0, `@smithy/signature-v4` ^5.3.12, `@aws-crypto/sha256-js` ^5.2.0
- **Method:** STS presigned URL → `k8s-aws-v1.<base64url>` token
- **Config fields:** `region`, `accessKeyId`, `secretAccessKey`, `sessionToken` (optional), `clusterName`, `endpoint`, `caCert`
- **Token TTL:** 15 minutes (refreshed proactively at 80%)
- **File:** `apps/api/src/lib/k8s-client-factory.ts` (`generateEksToken()`)

### Azure AKS Authentication

- **SDKs:** `@azure/arm-containerservice` ^25.0.0, `@azure/identity` ^4.13.1
- **Method:** `DefaultAzureCredential` → `ContainerServiceClient.listClusterUserCredentials()` → kubeconfig
- **Config fields:** `subscriptionId`, `resourceGroup`, `clusterName`, `clientId`
- **Token TTL:** 1 hour
- **File:** `apps/api/src/lib/k8s-client-factory.ts`

### Google GKE Authentication

- **SDK:** `@google-cloud/container` ^6.7.0
- **Method:** Service account JSON → `ClusterManagerClient.auth.getAccessToken()` → bearer token
- **Config fields:** `serviceAccountJson`, `endpoint`, `caCert`
- **Token TTL:** 1 hour
- **File:** `apps/api/src/lib/k8s-client-factory.ts`

### K8s Watch Manager (Live Data Pipeline)

- **Manager:** `apps/api/src/lib/watch-manager.ts` — unified informer-based watch for 15 resource types
- **Pattern:** K8s Watch API (informers) -> in-memory ObjectCache -> SSE push to frontend
- **Resource types:** Pods, Deployments, Services, Nodes, Namespaces, Events, StatefulSets, DaemonSets, Jobs, CronJobs, HPA, Ingresses, ConfigMaps, Secrets, PVCs
- **DB sync:** `apps/api/src/lib/watch-db-writer.ts` — debounced periodic PostgreSQL sync from watch events
- **Resource mappers:** `apps/api/src/lib/resource-mappers.ts` — 15 shared K8s-to-frontend transformations

## Authentication & Identity

### Better-Auth (Primary)

- **Package:** `better-auth` ^1.5.6
- **Implementation:** `apps/api/src/lib/auth.ts`
- **Adapter:** Drizzle (PostgreSQL)
- **Methods:** Email/password (always), Microsoft Entra ID (optional)
- **Plugins:** `admin()` (admin role), `genericOAuth()` (Entra ID SSO when configured)
- **Session:** Cookie-based (secure, httpOnly, sameSite), configurable expiry via `SESSION_EXPIRY_SECONDS`
- **Env vars:** `BETTER_AUTH_SECRET` (required in production), `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- **Routes:** `/api/auth/*`

### Microsoft Entra ID SSO (Optional)

- **Plugin:** `better-auth/plugins` → `microsoftEntraId()` wrapped in `genericOAuth()`
- **Config source:** Environment vars (`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`) OR database (`ssoProviders` table)
- **Group sync:** `syncEntraGroupMembership()` runs on session creation
- **SSO secret encryption:** AES-256-GCM via `apps/api/src/lib/sso.ts` (`SSO_ENCRYPTION_KEY` env var, falls back to `BETTER_AUTH_SECRET` in dev)
- **Scopes:** `openid`, `profile`, `email`

### Authorization (RBAC)

- **Implementation:** `apps/api/src/lib/authorization.ts` — database-backed access relations
- **Model:** Subject (user/team) -> Relation (viewer/editor/admin) -> Object (cluster/team)
- **Schema:** `packages/db/src/schema/authorization.ts` — `accessRelations` table
- **tRPC integration:** `authorizedProcedure` checks RBAC in middleware

## AI / LLM Integration

### OpenAI (Default Provider)

- **Client:** Raw `fetch()` to OpenAI Chat Completions API (no SDK package)
- **Default model:** `gpt-4o-mini`
- **Env vars:** `OPENAI_API_KEY` (required when `AI_PROVIDER=openai`), `OPENAI_BASE_URL` (optional)
- **File:** `apps/api/src/services/ai-provider.ts`

### Anthropic (Alternative Provider)

- **Client:** Raw `fetch()` to Anthropic Messages API (no SDK package)
- **Env vars:** `ANTHROPIC_API_KEY` (required when `AI_PROVIDER=anthropic`), `ANTHROPIC_BASE_URL` (optional)
- **Selection:** `AI_PROVIDER` env var or per-request `provider` field
- **File:** `apps/api/src/services/ai-provider.ts`

### AI Configuration

- **Config:** `packages/config/src/ai.ts` — `AI_CONFIG`
- **Defaults:** Provider=openai, Model=gpt-4o-mini, Timeout=45s, MaxOutputTokens=1200
- **Streaming:** SSE via `/api/ai/stream` route (`apps/api/src/routes/ai-stream.ts`)
- **History:** Stored in `aiConversations` / `aiMessages` DB tables, per-user per-cluster threads
- **Per-user API keys:** `userAiKeys` table with encrypted storage (`apps/api/src/services/ai-key-crypto.ts`)

## MCP (Model Context Protocol)

- **Endpoint:** `POST /mcp` (JSON-RPC 2.0), `GET /mcp/sse` (SSE keepalive)
- **Protocol version:** `2024-11-05`
- **Auth:** Bearer token (`vl_*` prefix, SHA256 hashed, stored in `userTokens` table)
- **Tools:** `get_logs`, `get_events`, `get_anomalies`, `get_metrics`, `get_clusters`
- **File:** `apps/api/src/routes/mcp.ts`

## Observability

### Sentry (Error Tracking)

**API:**
- **Package:** `@sentry/node` ^10.46.0, `@sentry/profiling-node` ^10.46.0
- **File:** `apps/api/src/lib/sentry.ts`
- **Env vars:** `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` (default 0.1), `SENTRY_ENABLE_PROFILING`
- **Behavior:** Only initializes if `SENTRY_DSN` is set; client-caused errors (401/404/400) skipped

**Web:**
- **Package:** `@sentry/nextjs` ^10.46.0
- **Files:** `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`
- **Env vars:** `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ORG`, `SENTRY_PROJECT`
- **Client features:** Session replay (0.1 session / 1.0 on-error), traces (0.1 default)
- **Integration:** `withSentryConfig()` wraps `next.config.ts` (conditional on DSN)

### OpenTelemetry (Tracing)

- **Packages:** `@opentelemetry/sdk-node` ^0.214.0, `@opentelemetry/auto-instrumentations-node` ^0.72.0, `@opentelemetry/exporter-trace-otlp-http` ^0.214.0
- **File:** `apps/api/src/lib/telemetry.ts`
- **Env var:** `OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP HTTP endpoint (optional, traces skipped if unset)
- **Auto-instrumentation:** HTTP, PostgreSQL, ioredis enabled; filesystem, DNS disabled
- **Service attributes:** `voyager-api`, version from `npm_package_version`, environment, K8s namespace
- **Collector:** Jaeger all-in-one 1.62.0 deployed via Helm (`charts/voyager/templates/jaeger.yaml`)
  - OTLP HTTP receiver on port 4318
  - UI on port 16686

### Logging

- **API:** Fastify built-in logger (`logger: true` in Fastify constructor) — pino JSON output
- **Supplementary:** `console.log/warn/error` for background jobs and lib modules
- **No external log aggregation configured in codebase** (relies on K8s log collection)

## Feature Flags

### OpenFeature + InMemoryProvider

- **Packages:** `@openfeature/server-sdk` ^1.20.2, `@openfeature/core` ^1.9.2
- **File:** `apps/api/src/lib/feature-flags.ts`
- **Flag sources (merged, env overrides file):**
  1. JSON file: `feature-flags.json` (or `FEATURE_FLAGS_FILE` env var)
  2. Environment variables: `FEATURE_FLAG_*` prefix
- **Current flags:** `audit_log_enabled`, `sse_subscriptions`, `new_dashboard_layout`, `advanced_metrics`
- **Pattern:** `getFeatureFlag(name, defaultValue, context?)` — supports boolean, number, string, object

## Real-Time Communication

### SSE (Server-Sent Events)

| Endpoint | File | Purpose |
|----------|------|---------|
| `/api/resources/stream` | `apps/api/src/routes/resource-stream.ts` | K8s watch events (15 resource types), 1s server-side batching |
| `/api/metrics/stream` | `apps/api/src/routes/metrics-stream.ts` | Live K8s metrics (10-15s resolution) |
| `/api/logs/stream` | `apps/api/src/routes/log-stream.ts` | Pod log streaming with follow mode |
| `/api/ai/stream` | `apps/api/src/routes/ai-stream.ts` | AI response token streaming |
| `/mcp/sse` | `apps/api/src/routes/mcp.ts` | MCP keepalive channel |

**Web proxy:** SSE endpoints proxied via Next.js Route Handlers (`apps/web/src/app/api/*/stream/route.ts`) using `node:http` — NOT via Next.js rewrites (SSE incompatible with rewrites).

### WebSocket

| Endpoint | File | Purpose |
|----------|------|---------|
| Pod exec terminal | `apps/api/src/routes/pod-terminal.ts` | `@fastify/websocket` bridge to K8s Exec API |

**Note:** WebSocket is only used for pod exec. Everything else (metrics, resources, logs) uses SSE.

## Background Jobs

| Job | File | Interval | Purpose |
|-----|------|----------|---------|
| Alert Evaluator | `apps/api/src/jobs/alert-evaluator.ts` | 60s | Evaluate alert rules against cluster state |
| Metrics History Collector | `apps/api/src/jobs/metrics-history-collector.ts` | 60s | Collect K8s metrics to TimescaleDB |
| Deploy Smoke Test | `apps/api/src/jobs/deploy-smoke-test.ts` | 30s delay post-rollout | Post-deploy health check (K8S_ENABLED only) |
| Metrics Stream Job | `apps/api/src/jobs/metrics-stream-job.ts` | 15s | Live metrics polling (reference-counted, starts on first SSE subscriber) |
| Watch DB Writer | `apps/api/src/lib/watch-db-writer.ts` | Debounced | Sync watch events to PostgreSQL |

**Config:** `apps/api/src/config/jobs.ts` (`JOB_INTERVALS`)

## OpenAPI / Swagger

- **Spec generation:** `trpc-to-openapi` 3.2.0 generates OpenAPI spec from tRPC routers
- **UI:** Swagger UI at `/docs` via `@fastify/swagger-ui` ^5.2.5
- **JSON endpoint:** `/openapi.json`
- **File:** `apps/api/src/lib/openapi.ts`

## CI/CD & Deployment

**Hosting:**
- Kubernetes (minikube for local/dev, production on multi-cloud K8s)
- Docker images: `voyager-api`, `voyager-web` (multi-stage alpine builds)

**Helm Chart:** `charts/voyager/`
- Fresh install every time (never `helm upgrade`)
- Ingress: nginx class, host: `voyager-platform.voyagerlabs.co`
- Includes: API, Web, PostgreSQL, Redis, Jaeger deployments

**CI Pipeline:** Not configured in the codebase (no GitHub Actions, no Jenkinsfile)

## Environment Configuration

### Required Env Vars (API)

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | None (required) |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `CLUSTER_CRED_ENCRYPTION_KEY` | 64-char hex for AES-256-GCM credential encryption | None (required) |
| `ADMIN_EMAIL` | Bootstrap admin user email | None (required for bootstrap) |
| `ADMIN_PASSWORD` | Bootstrap admin user password | None (required for bootstrap) |
| `BETTER_AUTH_SECRET` | Session signing secret | Dev fallback exists (required in production) |
| `PORT` | API listen port | `4000` |
| `K8S_ENABLED` | Enable K8s watchers | `true` |

### Optional Env Vars (API)

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Sentry error tracking |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry trace export |
| `OPENAI_API_KEY` | AI chat (default provider) |
| `ANTHROPIC_API_KEY` | AI chat (alternative provider) |
| `AI_PROVIDER` | `openai` or `anthropic` |
| `AI_MODEL` | LLM model name |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | Microsoft Entra ID SSO |
| `SSO_ENCRYPTION_KEY` | Encrypt SSO secrets in DB |
| `SESSION_EXPIRY_SECONDS` | Session lifetime (default 86400) |
| `RATE_LIMIT_MAX` | Requests per window (default 200) |
| `RATE_LIMIT_TIME_WINDOW` | Rate limit window (default `1 minute`) |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |
| `FEATURE_FLAGS_FILE` | Feature flags JSON path |
| `FEATURE_FLAG_*` | Individual feature flag overrides |
| `SENTRY_ENABLE_PROFILING` | Enable Sentry profiling |

### Required Env Vars (Web)

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | API base URL for rewrites/proxy | `http://voyager-api:4000` |

### Optional Env Vars (Web)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking (client) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Sentry environment tag |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry source map upload |

### Secrets Location

- `.env` (root) — loaded by API via `tsx --env-file`
- `apps/web/.env.local` — Next.js env vars
- `charts/voyager/values-local.yaml` — Helm secrets (gitignored)
- `charts/voyager/templates/secret.yaml` — K8s Secret manifest

## Webhooks & Callbacks

**Incoming:**
- `/api/auth/sign-in/*` — Better-Auth OAuth callbacks (Entra ID)
- `/mcp` — JSON-RPC 2.0 tool calls

**Outgoing:**
- Webhook configurations stored in `webhooks` DB table (schema exists, implementation in tRPC routers)

---

*Integration audit: 2026-03-30*
