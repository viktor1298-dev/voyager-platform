# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**Cloud Provider APIs:**
- **AWS (Multi-region):**
  - Service: EKS cluster operations, credential handling
  - SDK/Client: `@aws-sdk/client-sts` 3.996.0, `@aws-crypto/sha256-js` 5.2.0
  - Auth: AWS credentials (SigV4, via kubeconfig or IAM roles)
  - Usage: `apps/api/src/routers/clusters.ts` for EKS cluster discovery/management

- **Azure:**
  - Service: AKS cluster operations
  - SDK/Client: `@azure/arm-containerservice` 24.1.0, `@azure/identity` 4.13.0
  - Auth: Azure credentials (Entra ID)
  - Usage: `apps/api/src/routers/clusters.ts` for AKS cluster management

- **Google Cloud:**
  - Service: GKE cluster operations
  - SDK/Client: `@google-cloud/container` 6.7.0
  - Auth: Google Cloud credentials
  - Usage: `apps/api/src/routers/clusters.ts` for GKE cluster management

**Kubernetes:**
- Service: Cluster resource management (pods, nodes, deployments, services, namespaces)
- SDK/Client: `@kubernetes/client-node` 1.4.0
- Auth: Kubeconfig (local development) or in-cluster service account
- Usage: `apps/api/src/lib/k8s.ts` (K8s client initialization), multiple routers (`pods.ts`, `nodes.ts`, `deployments.ts`, `services.ts`, `namespaces.ts`, `logs.ts`)

## Data Storage

**Databases:**
- PostgreSQL 17 + TimescaleDB
  - Container: `timescale/timescaledb:latest-pg17`
  - Connection: `DATABASE_URL` env var (default: `postgresql://voyager:voyager_dev@localhost:5432/voyager_dev`)
  - Client: Drizzle ORM (`drizzle-orm` 0.45.1) + native `pg` driver (8.13.0)
  - Schema location: `charts/voyager/sql/init.sql` (source of truth)
  - Migrations: Drizzle Kit (`drizzle.config.ts` in `packages/db/`)

**File Storage:**
- Not detected - Local filesystem only (no S3, GCS, Azure Blob integration)

**Caching:**
- Redis 7 (Alpine)
  - Container: `redis:7-alpine`
  - Connection: `REDIS_URL` env var (default: `redis://localhost:6379`)
  - Client: `redis` 5.10.0
  - Purpose: Session caching, rate limiting, background job queues

## Authentication & Identity

**Auth Provider:**
- Better-Auth 1.4.18 (custom implementation)
  - Implementation: Multi-provider support (email/password + Microsoft Entra ID)
  - Location: `apps/api/src/lib/auth.ts`
  - Session management: Database-backed (Drizzle adapter)

**SSO/OAuth:**
- Microsoft Entra ID (Azure AD)
  - Config env vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`
  - SDK: Better-Auth `microsoftEntraId()` plugin
  - Flow: OAuth2 → Entra ID → token exchange
  - Group sync: `apps/api/src/lib/sso.ts` syncs Entra group membership to local roles
  - Enabled conditionally: Only if Entra env vars provided

**Session Management:**
- Cookie-based sessions (HTTP-only, secure)
- Session cookie names: `SESSION_COOKIE_NAME`, `SECURE_SESSION_COOKIE_NAME`, `HOST_SESSION_COOKIE_NAME`
- Location: `apps/web/src/lib/auth-constants.ts`
- Session expiry: Configurable via `SESSION_EXPIRY_SECONDS` env var (default: 86400s / 24h)

**Auth Routes:**
- `/api/auth/sign-in/*` - Sign-in endpoints (email, OAuth)
- `/api/auth/get-session` - Session retrieval
- `/api/auth/*` - All auth routes via Better-Auth handler
- Location: `apps/api/src/server.ts`

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional)
  - Frontend: `@sentry/nextjs` 10.38.0
  - Backend: `@sentry/node` 10.38.0 + `@sentry/profiling-node` 10.38.0
  - Config env vars: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`, `SENTRY_ORG`, `SENTRY_PROJECT`
  - Enabled only if `SENTRY_DSN` provided
  - Backend init: `apps/api/src/lib/sentry.ts` (early initialization before server start)
  - Frontend init: `apps/web/sentry.server.config.ts`, `apps/web/sentry.client.config.ts`
  - Profiling: Conditional via `SENTRY_ENABLE_PROFILING` env var (opt-in)

**Distributed Tracing:**
- OpenTelemetry (with Jaeger support)
  - SDK: `@opentelemetry/sdk-node` 0.212.0
  - Auto-instrumentation: `@opentelemetry/auto-instrumentations-node` 0.69.0 (HTTP, Fastify, PostgreSQL, Redis, ioredis)
  - Exporter: `@opentelemetry/exporter-trace-otlp-http` 0.212.0
  - Endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` env var (default: http://jaeger:4318 in K8s)
  - Enabled only if `OTEL_EXPORTER_OTLP_ENDPOINT` provided
  - Location: `apps/api/src/lib/telemetry.ts`
  - Instrumentation: HTTP, Fastify, PG, Redis (disabled: filesystem, DNS for performance)

**Logs:**
- Fastify logger (built-in)
- Kubernetes logs (via `kubectl logs`)
- Log output: stdout (JSON structured in production)

## CI/CD & Deployment

**Hosting:**
- Kubernetes (EKS, AKS, GKE supported)
- Namespace: `voyager` (default in Helm values)

**Deployment Method:**
- Helm 3.x charts (`charts/voyager/`)
  - Chart location: `charts/voyager/Chart.yaml`
  - Values: `values-dev.yaml` for development, user-provided for production
  - Deployment pattern: `helm uninstall` + `helm install` (fresh install every deploy)
  - Init container: Runs `charts/voyager/sql/init.sql` on postgres container before API startup

**Build & Deployment:**
- Docker multi-stage builds (API: `docker/Dockerfile.api`, Web: `docker/Dockerfile.web`)
- Container registry: Not specified (environment-dependent)
- Local development: `docker compose up -d` (postgres + redis)

## Environment Configuration

**Required env vars (Development):**
```
DATABASE_URL=postgresql://voyager:voyager_dev@localhost:5432/voyager_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-production
ADMIN_PASSWORD=admin123
CLUSTER_CRED_ENCRYPTION_KEY=<64-char hex for AES-256>
```

**Optional env vars:**
- `ALLOWED_ORIGINS` - CORS origins (comma-separated, default: localhost:3000)
- `RATE_LIMIT_MAX` - Max requests per window (default: 200)
- `RATE_LIMIT_TIME_WINDOW` - Rate limit window (default: "1 minute")
- `SESSION_EXPIRY_SECONDS` - Session lifetime (default: 86400)
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE` - Sentry error tracking
- `SENTRY_ENABLE_PROFILING` - Enable profiling (default: false)
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry Jaeger endpoint (e.g., http://jaeger:4318)
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` - Microsoft Entra ID OAuth (optional)
- `FEATURE_FLAGS_FILE` - Path to feature flags JSON (default: `feature-flags.json`)
- `FEATURE_FLAG_*` - Individual feature flags via env vars (e.g., `FEATURE_FLAG_AUDIT_LOG_ENABLED=true`)
- `NODE_ENV` - Environment (development/production)
- `PORT` - API server port (default: 4000)
- `HOST` - Bind address (default: 0.0.0.0)
- `K8S_NAMESPACE` - Kubernetes namespace for OTEL resource (default: default)
- `NEXT_PUBLIC_SENTRY_DSN` - Frontend Sentry DSN (must start with `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT` - Frontend Sentry environment
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` - Frontend trace sampling

**Secrets location:**
- Development: `.env` file (git-ignored)
- Production: Kubernetes Secrets mounted as env vars or files (via `envFrom.secretRef`)
- Helm template: `charts/voyager/templates/secret.yaml` (values from `values.yaml` or `values-local.yaml`)

## Webhooks & Callbacks

**Incoming:**
- Not detected - No incoming webhook listeners

**Outgoing:**
- Not detected - No outgoing webhook dispatchers in current codebase

## Feature Flags

**Framework:**
- OpenFeature 1.20.1 (server-side)
- flagd provider 0.13.4 (for future flagd integration)
- Implementation: In-memory JSON provider (dev/small deployments)

**Location:**
- `apps/api/src/lib/feature-flags.ts`
- Config: `apps/api/feature-flags.json` or `FEATURE_FLAG_*` env vars

**Current Flags:**
- `audit_log_enabled` (true) - Audit logging in auth system
- `sse_subscriptions` (true) - Server-sent events subscriptions (pod/metric updates)
- `new_dashboard_layout` (false) - New dashboard layout variant
- `advanced_metrics` (false) - Advanced metrics display

## API Documentation

**OpenAPI/Swagger:**
- Specification generation: `trpc-to-openapi` 3.1.0
- Swagger UI: `@fastify/swagger-ui` 5.2.5
- Location: `/docs` (Swagger UI), `/openapi.json` (spec)
- Schema generation: `apps/api/src/lib/openapi.ts`
- tRPC OpenAPI plugin: `fastifyTRPCOpenApiPlugin`

---

*Integration audit: 2026-03-26*
