# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5.7 - All application code (frontend, backend, shared packages)
- JavaScript/Node.js - Runtime execution and build tooling

**Secondary:**
- SQL - PostgreSQL schema and migrations via Drizzle ORM
- YAML - Kubernetes manifests and Helm templates

## Runtime

**Environment:**
- Node.js 22 (Alpine Linux containerized)

**Package Manager:**
- pnpm 10.6.2
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Next.js 16.1.6 - Frontend framework with App Router
- React 19.2.4 - UI library
- Fastify 5.2.0 - Backend HTTP server
- tRPC 11.10.0 - Type-safe API layer (server 11.0.0, client/react-query 11.10.0)

**Styling & UI:**
- Tailwind CSS 4 - Utility-first CSS
- Radix UI 1.4.3 - Headless UI components
- Motion 12.34.0 - Animation library (Framer Motion v12 ecosystem)
- shadcn/ui - Component library (via Radix)

**State Management:**
- Zustand 5.0.11 - Lightweight state store
- TanStack Query 5.90.21 - Server state/async data management
- TanStack Table 8.21.3 - Data table library

**Data & ORM:**
- Drizzle ORM 0.45.1 - TypeScript ORM for PostgreSQL
- Zod 4.3.6 - Runtime schema validation
- Better-Auth 1.4.18 - Authentication framework

**Testing:**
- Vitest 4.0.18 - Unit test runner
- Playwright 1.58.2 - E2E and visual regression testing (separate configs)

**Build & Dev:**
- Turborepo 2.8.8 - Monorepo task orchestration
- TypeScript 5.7.0 - Type checking
- Biome 2.3.15 - Linting and formatting
- esbuild 0.27.3 - JS bundler (dependencies)
- tsx 4.19.0 - TypeScript execution for scripts

**Utilities:**
- @tanstack/react-form 1.28.4 - Form state management
- nuqs 2.8.9 - URL search params management
- cmdk 1.1.1 - Command/palette UI
- Lucide React 0.564.0 - Icon library
- Iconify React 6.0.2 - Additional icon sets
- sonner 2.0.7 - Toast notifications
- vaul 1.1.2 - Drawer components
- react-grid-layout 2.2.2 - Grid layout system
- react-resizable-panels 4.7.1 - Resizable panel system
- recharts 3.7.0 - Charting library
- next-themes 0.4.6 - Theme management

## Key Dependencies

**Critical:**
- `drizzle-orm` 0.45.1 - Database ORM, essential for data access
- `@trpc/server` 11.0.0 - Type-safe API routing and contracts
- `fastify` 5.2.0 - High-performance backend server
- `better-auth` 1.4.18 - Authentication system for user management and SSO
- `@kubernetes/client-node` 1.4.0 - K8s API client for cluster operations

**Cloud/Infrastructure:**
- `@aws-sdk/client-sts` 3.996.0 - AWS STS for cluster credential handling
- `@azure/arm-containerservice` 24.1.0 - Azure AKS cluster operations
- `@azure/identity` 4.13.0 - Azure authentication
- `@google-cloud/container` 6.7.0 - Google Cloud GKE operations
- `redis` 5.10.0 - Redis client for caching/queues
- `pg` 8.13.0 - PostgreSQL native driver

**Observability:**
- `@sentry/nextjs` 10.38.0 - Frontend error tracking
- `@sentry/node` 10.38.0 - Backend error tracking
- `@sentry/profiling-node` 10.38.0 - Runtime profiling (optional)
- `@opentelemetry/sdk-node` 0.212.0 - Distributed tracing
- `@opentelemetry/exporter-trace-otlp-http` 0.212.0 - OTLP trace export
- `@opentelemetry/auto-instrumentations-node` 0.69.0 - Auto instrumentation

**Features & Configuration:**
- `@openfeature/server-sdk` 1.20.1 - Feature flag framework
- `@openfeature/flagd-provider` 0.13.4 - flagd feature flag provider
- `zod-openapi` 5.4.6 - OpenAPI schema generation
- `trpc-to-openapi` 3.1.0 - tRPC to OpenAPI conversion

**HTTP & Fastify Plugins:**
- `@fastify/compress` 8.3.1 - Gzip compression
- `@fastify/cors` 11.2.0 - CORS handling
- `@fastify/rate-limit` 10.3.0 - Rate limiting
- `@fastify/swagger` 9.7.0 - OpenAPI spec generation
- `@fastify/swagger-ui` 5.2.5 - Swagger UI interface

**Crypto/Auth:**
- `@aws-crypto/sha256-js` 5.2.0 - AWS Signature V4 signing
- `@smithy/protocol-http` 5.3.2 - HTTP protocol utilities
- `@smithy/signature-v4` 5.3.2 - AWS Signature V4 implementation

## Configuration

**Environment:**
- Environment variables via `.env` file (development) and Kubernetes secrets/ConfigMaps (production)
- Key env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLUSTER_CRED_ENCRYPTION_KEY`, `NODE_ENV`, `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Entra ID integration vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (optional)
- Feature flags: `FEATURE_FLAGS_FILE` (default: `feature-flags.json`) or via `FEATURE_FLAG_*` env vars

**Build:**
- `biome.json` - Code formatting and linting (2-space indent, 100-char line width, single quotes, no semicolons)
- `turbo.json` - Task dependencies and caching configuration
- `tsconfig.json` (root and per-package) - TypeScript compilation settings
- `next.config.ts` - Next.js build and runtime config (with conditional Sentry integration)
- `playwright.config.ts` - E2E test configuration
- `playwright.visual.config.ts` - Visual regression test config
- `drizzle.config.ts` - Database migration configuration (in packages/db)

## Platform Requirements

**Development:**
- Node.js 22 (specified in Dockerfile)
- pnpm 10.6.2 (specified in package.json packageManager field)
- Docker & Docker Compose (for local Postgres 17 + TimescaleDB + Redis 7)
- PostgreSQL 17 with TimescaleDB extension
- Redis 7 (Alpine)

**Production:**
- Kubernetes 1.24+ (implied by K8s API client version)
- PostgreSQL 17 + TimescaleDB (in Kubernetes namespace `voyager`)
- Redis 7 (in Kubernetes)
- Optional: Jaeger (for distributed tracing via OTEL_EXPORTER_OTLP_ENDPOINT)
- Optional: Sentry (for error tracking when SENTRY_DSN set)
- Container registry (for pushing Docker images)

## Deployment

**Container Images:**
- API: `docker/Dockerfile.api` - Multi-stage build producing `node:22-alpine` runtime
- Web: `docker/Dockerfile.web` - Next.js standalone output on `node:22-alpine`
- Base image: `node:22-alpine`

**Orchestration:**
- Kubernetes (EKS, AKS, GKE supported via SDK clients)
- Helm 3.x for deployment templating (`charts/voyager/`)
- Docker Compose for local development

**Database:**
- PostgreSQL 17 (container: `timescale/timescaledb:latest-pg17`)
- TimescaleDB extension enabled
- Schema source of truth: `charts/voyager/sql/init.sql`
- Migrations: Drizzle Kit via `drizzle.config.ts`

---

*Stack analysis: 2026-03-26*
