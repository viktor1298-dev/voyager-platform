# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**
- TypeScript ^6.0.2 — All application code (API, Web, shared packages)

**Secondary:**
- SQL — Database schema (`charts/voyager/sql/init.sql`), TimescaleDB queries
- YAML — Helm chart templates, Docker Compose, Kubernetes manifests

## Runtime

**Environment:**
- Node.js 22 (alpine) — Specified in `docker/Dockerfile.api` and `docker/Dockerfile.web` (`node:22-alpine`)
- No `.nvmrc` or `.node-version` file present

**Package Manager:**
- pnpm 10.6.2 — Declared in root `package.json` `"packageManager"` field
- Lockfile: `pnpm-lock.yaml` (present)
- Corepack: Enabled in Dockerfiles via `corepack enable`

## Monorepo Setup

**Workspace Tool:** Turborepo ^2.8.21
- Config: `turbo.json` (root)
- Task graph: `build` depends on `^build` (upstream first), `dev` is persistent/uncached
- Outputs: `.next/**`, `dist/**`

**Workspace Layout** (`pnpm-workspace.yaml`):
```
packages:
  - "apps/*"       # api, web
  - "packages/*"   # db, config, types, ui
```

**Workspace Package Prefix:** `@voyager/` (e.g., `@voyager/db`, `@voyager/config`, `@voyager/types`, `@voyager/ui`)

## Frameworks

**Core:**

| Package | Version | Location | Purpose |
|---------|---------|----------|---------|
| `fastify` | ^5.8.4 | `apps/api/package.json` | HTTP server (API) |
| `@trpc/server` | ^11.15.1 | `apps/api/package.json` | Type-safe API layer |
| `@trpc/client` | ^11.15.1 | `apps/web/package.json` | tRPC client |
| `@trpc/react-query` | ^11.15.1 | `apps/web/package.json` | tRPC React bindings |
| `next` | 16.2.1 | `apps/web/package.json` | Frontend framework (App Router) |
| `react` | 19.2.4 | `apps/web/package.json` | UI library |
| `react-dom` | 19.2.4 | `apps/web/package.json` | React DOM renderer |
| `drizzle-orm` | ^0.45.2 | `packages/db/package.json` | ORM / query builder |
| `better-auth` | ^1.5.6 | `apps/api/package.json` | Authentication framework |

**Testing:**

| Package | Version | Location | Purpose |
|---------|---------|----------|---------|
| `vitest` | ^4.1.2 | `apps/api/`, `apps/web/` devDeps | Unit testing |
| `@playwright/test` | ^1.58.2 | Root devDeps | E2E + visual regression testing |

**Build/Dev:**

| Package | Version | Location | Purpose |
|---------|---------|----------|---------|
| `turbo` | ^2.8.21 | Root devDeps | Monorepo task orchestration |
| `tsx` | ^4.21.0 | `apps/api/` devDeps | TypeScript execution (dev mode watch) |
| `esbuild` | ^0.27.4 | `apps/api/` devDeps | Build tooling (overridden in root) |
| `@biomejs/biome` | ^2.4.9 | Root + `apps/api/` devDeps | Linting + formatting |
| `drizzle-kit` | ^0.31.10 | `packages/db/` devDeps | DB migration generation |
| `tailwindcss` | ^4.2.2 | `apps/web/` devDeps | CSS framework |
| `@tailwindcss/postcss` | ^4.2.2 | `apps/web/` devDeps | PostCSS integration |

## Key Dependencies

### Backend (`apps/api/package.json`)

**Kubernetes:**
- `@kubernetes/client-node` ^1.4.0 — K8s API client (watch, exec, logs, all resource operations)

**Cloud Providers (multi-cloud auth):**
- `@aws-crypto/sha256-js` ^5.2.0 — EKS token signing
- `@aws-sdk/client-sts` ^3.1019.0 — AWS STS for EKS auth
- `@aws-sdk/util-format-url` ^3.972.8 — Presigned URL formatting
- `@smithy/protocol-http` ^5.3.12 — HTTP request model for SigV4
- `@smithy/signature-v4` ^5.3.12 — AWS Signature V4 signing
- `@azure/arm-containerservice` ^25.0.0 — AKS credential fetching
- `@azure/identity` ^4.13.1 — Azure DefaultAzureCredential
- `@google-cloud/container` ^6.7.0 — GKE cluster manager client

**Fastify Plugins:**
- `@fastify/compress` ^8.3.1 — Response compression
- `@fastify/cors` ^11.2.0 — CORS
- `@fastify/rate-limit` ^10.3.0 — Rate limiting (200 req/min default)
- `@fastify/swagger` ^9.7.0 — OpenAPI spec
- `@fastify/swagger-ui` ^5.2.5 — Swagger UI at `/docs`
- `@fastify/websocket` ^11.2.0 — WebSocket support (pod exec terminal)

**Observability:**
- `@sentry/node` ^10.46.0 — Error tracking (API)
- `@sentry/profiling-node` ^10.46.0 — Performance profiling
- `@opentelemetry/sdk-node` ^0.214.0 — Tracing SDK
- `@opentelemetry/auto-instrumentations-node` ^0.72.0 — Auto-instrumentation (HTTP, pg, ioredis)
- `@opentelemetry/exporter-trace-otlp-http` ^0.214.0 — OTLP trace export

**Feature Flags:**
- `@openfeature/server-sdk` ^1.20.2 — OpenFeature SDK
- `@openfeature/core` ^1.9.2 — OpenFeature core
- `@openfeature/flagd-provider` ^0.14.0 — flagd provider (uses InMemoryProvider in practice)

**Data:**
- `redis` ^5.11.0 — Redis client (caching, fallback path)
- `pg` ^8.20.0 — PostgreSQL driver (via `packages/db`)
- `zod` ^4.3.6 — Schema validation (all packages)

**API:**
- `trpc-to-openapi` 3.2.0 — REST/OpenAPI endpoints from tRPC
- `zod-openapi` ^5.4.6 — Zod to OpenAPI schema

### Frontend (`apps/web/package.json`)

**UI Components:**
- `@radix-ui/react-collapsible` ^1.1.12
- `@radix-ui/react-popover` ^1.1.15
- `@radix-ui/react-progress` ^1.1.8
- `@radix-ui/react-tabs` ^1.1.13
- `@radix-ui/react-tooltip` ^1.2.8
- `lucide-react` ^1.7.0 — Icons
- `class-variance-authority` ^0.7.1 — Component variants
- `clsx` ^2.1.1 — Class name utility
- `tailwind-merge` ^3.5.0 — Tailwind class merging

**State & Data:**
- `@tanstack/react-query` ^5.95.2 — Server state management
- `@tanstack/react-form` ^1.28.5 — Form management (login, users, teams)
- `@tanstack/react-table` ^8.21.3 — Table component
- `zustand` ^5.0.12 — Client state management
- `nuqs` ^2.8.9 — URL query state

**Visualization:**
- `recharts` ^3.8.1 — Charts/graphs
- `@xyflow/react` ^12.10.2 — React Flow (topology, network policy graphs)
- `@dagrejs/dagre` ^3.0.0 — Graph layout (dagre)
- `react-grid-layout` ^2.2.3 — Dashboard layouts

**Terminal:**
- `@xterm/xterm` ^6.0.0 — Terminal emulator (pod exec)
- `@xterm/addon-fit` ^0.11.0 — Terminal resize addon

**Misc:**
- `motion` ^12.38.0 — Animations (Framer Motion v12)
- `cmdk` ^1.1.1 — Command palette
- `sonner` ^2.0.7 — Toast notifications
- `vaul` ^1.1.2 — Drawer component
- `next-themes` ^0.4.6 — Theme switching (dark/light)
- `react-diff-viewer-continued` ^4.2.0 — YAML diff viewer
- `react-resizable-panels` ^4.7.6 — Resizable panels
- `yaml` ^2.8.3 — YAML parsing
- `@sentry/nextjs` ^10.46.0 — Error tracking (Web)
- `@iconify-json/simple-icons` ^1.2.75 — Brand icons
- `@iconify/react` ^6.0.2 — Iconify React component

## TypeScript Configuration

**Base Config:** `packages/config/tsconfig.base.json`
- Target: ES2022
- Module: ESNext
- Module Resolution: bundler
- Strict: true

**API:** Extends base config, `outDir: ./dist`, `rootDir: ./src`
**Web:** Standalone config, Target: ES2017, Module: esnext, JSX: react-jsx, paths alias `@/*` -> `./src/*`
**All packages:** ESM (`"type": "module"` in package.json), `.js` extensions in imports even for `.ts` files

## Code Quality

**Linter/Formatter:** Biome ^2.4.9
- Config: `biome.json` (root)
- Schema version: 2.3.15
- Indent: 2 spaces, line width: 100
- Quotes: single, semicolons: as-needed
- Rules: recommended + custom overrides (`noExplicitAny: off`, `noNonNullAssertion: off`, `noThenProperty: off`)

## Build & Docker

**API Build:** `tsc` -> `dist/` (plain Node.js, no bundler)
- Dockerfile: `docker/Dockerfile.api` — multi-stage (deps -> builder -> runner)
- Base image: `node:22-alpine`
- Uses `pnpm deploy --prod --legacy` for minimal production deps
- Exposes port 4000

**Web Build:** `next build` with `output: 'standalone'`
- Dockerfile: `docker/Dockerfile.web` — multi-stage (deps -> builder -> runner)
- Base image: `node:22-alpine`
- Experimental features: `viewTransition`, `optimizePackageImports`
- Exposes port 3000

## Local Infrastructure

**Docker Compose** (`docker-compose.yml`):
- PostgreSQL: `timescale/timescaledb:latest-pg17` (port 5432)
- Redis: `redis:7-alpine` (port 6379)
- DB auto-initializes schema via mounted `charts/voyager/sql/init.sql`

## Helm Chart

**Chart:** `charts/voyager/` (type: application, version: 0.1.0)
- Deploys: API, Web, PostgreSQL (17-alpine), Redis (7-alpine), Jaeger (1.62.0)
- Ingress: nginx class, host: `voyager-platform.voyagerlabs.co`
- Deploy pattern: Always `helm uninstall` + `helm install` (never `helm upgrade`)

## Platform Requirements

**Development:**
- Node.js 22
- pnpm 10.6.2 (corepack)
- Docker + Docker Compose (for Postgres + Redis)
- Kubernetes cluster optional (`K8S_ENABLED=false` for local dev)

**Production:**
- Kubernetes cluster (minikube for dev, EKS/AKS/GKE for production)
- Helm 3
- PostgreSQL 17 with TimescaleDB extension
- Redis 7
- nginx Ingress Controller

---

*Stack analysis: 2026-03-30*
