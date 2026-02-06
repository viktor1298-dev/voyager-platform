# Voyager Platform — Week 1 Implementation Guide

> **Version:** 1.0  
> **Date:** February 4, 2026  
> **Status:** Ready to execute  
> **Prerequisites:** Node.js 22+, pnpm 9+, Docker Desktop, Git  
> **Goal:** Working monorepo with auth, database, tRPC API, basic UI shell, and first real data flowing from Voyager Monitor

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Package.json Files](#2-packagejson-files)
3. [Configuration Files](#3-configuration-files)
4. [Week 1 Implementation Guide](#4-week-1-implementation-guide)
5. [Key Code Examples](#5-key-code-examples)
6. [Development Workflow](#6-development-workflow)

---

## 1. Project Structure

### 1.1 Complete Directory Tree (Week 1)

Every file listed here must exist by end of Week 1. Files marked with `(stub)` can be minimal placeholders; all others need real implementation.

```
voyager-platform/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                          # Lint + typecheck + test on PR
│   │   └── deploy.yml                      # Build + push Docker images (stub)
│   ├── PULL_REQUEST_TEMPLATE.md            # PR template
│   └── CODEOWNERS                          # Code ownership rules
│
├── apps/
│   ├── web/                                # Next.js 15 frontend
│   │   ├── public/
│   │   │   ├── favicon.ico
│   │   │   ├── logo.svg
│   │   │   └── logo-dark.svg
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── sign-in/
│   │   │   │   │   │   └── [[...sign-in]]/
│   │   │   │   │   │       └── page.tsx     # Clerk sign-in page
│   │   │   │   │   └── sign-up/
│   │   │   │   │       └── [[...sign-up]]/
│   │   │   │   │           └── page.tsx     # Clerk sign-up page
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── layout.tsx           # Dashboard layout (sidebar + header)
│   │   │   │   │   ├── page.tsx             # Root redirect to /clusters
│   │   │   │   │   ├── clusters/
│   │   │   │   │   │   ├── page.tsx         # Cluster overview (list all clusters)
│   │   │   │   │   │   └── [clusterId]/
│   │   │   │   │   │       ├── page.tsx     # Cluster detail (stub)
│   │   │   │   │   │       └── loading.tsx  # Loading skeleton
│   │   │   │   │   ├── costs/
│   │   │   │   │   │   └── page.tsx         # FinOps overview (stub)
│   │   │   │   │   ├── security/
│   │   │   │   │   │   └── page.tsx         # Security overview (stub)
│   │   │   │   │   └── settings/
│   │   │   │   │       └── page.tsx         # Settings page (stub)
│   │   │   │   ├── api/
│   │   │   │   │   └── trpc/
│   │   │   │   │       └── [trpc]/
│   │   │   │   │           └── route.ts     # tRPC HTTP handler (Next.js App Router)
│   │   │   │   ├── layout.tsx               # Root layout (providers, fonts, theme)
│   │   │   │   ├── globals.css              # Tailwind imports + CSS variables
│   │   │   │   └── not-found.tsx            # 404 page
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── sidebar.tsx          # Main sidebar navigation
│   │   │   │   │   ├── header.tsx           # Top header bar
│   │   │   │   │   ├── nav-item.tsx         # Sidebar navigation item
│   │   │   │   │   └── user-menu.tsx        # User avatar + dropdown
│   │   │   │   ├── clusters/
│   │   │   │   │   ├── cluster-card.tsx     # Cluster summary card
│   │   │   │   │   ├── cluster-grid.tsx     # Grid of cluster cards
│   │   │   │   │   ├── cluster-status.tsx   # Health status badge
│   │   │   │   │   └── metrics-chart.tsx    # Mini metrics sparkline
│   │   │   │   ├── providers/
│   │   │   │   │   ├── theme-provider.tsx   # Dark mode provider (next-themes)
│   │   │   │   │   ├── trpc-provider.tsx    # tRPC + React Query provider
│   │   │   │   │   └── clerk-provider.tsx   # Clerk auth provider wrapper
│   │   │   │   └── shared/
│   │   │   │       ├── loading-skeleton.tsx  # Reusable skeleton loader
│   │   │   │       ├── error-boundary.tsx   # Error boundary component
│   │   │   │       └── empty-state.tsx      # Empty state illustration
│   │   │   ├── lib/
│   │   │   │   ├── trpc.ts                  # tRPC client setup
│   │   │   │   ├── utils.ts                 # Utility functions (cn, formatters)
│   │   │   │   └── constants.ts             # App-wide constants
│   │   │   └── hooks/
│   │   │       ├── use-websocket.ts         # WebSocket hook for real-time data
│   │   │       └── use-clusters.ts          # Cluster data hook (wraps tRPC)
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── .env.local.example
│   │
│   ├── api/                                 # Fastify backend
│   │   ├── src/
│   │   │   ├── server.ts                    # Fastify server bootstrap
│   │   │   ├── app.ts                       # App factory (for testing)
│   │   │   ├── trpc/
│   │   │   │   ├── index.ts                 # tRPC root router
│   │   │   │   ├── context.ts               # tRPC context (auth, db)
│   │   │   │   ├── trpc.ts                  # tRPC instance + middleware
│   │   │   │   └── routers/
│   │   │   │       ├── cluster.ts           # Cluster CRUD + list
│   │   │   │       ├── metrics.ts           # Metrics query endpoints
│   │   │   │       └── health.ts            # Health check router
│   │   │   ├── routes/
│   │   │   │   ├── ingest.ts                # POST /api/v1/ingest — Voyager Monitor data
│   │   │   │   ├── health.ts                # GET /health, GET /ready
│   │   │   │   └── webhook.ts               # Webhook endpoints (Clerk, etc.)
│   │   │   ├── services/
│   │   │   │   ├── cluster.service.ts       # Cluster business logic
│   │   │   │   ├── metrics.service.ts       # Metrics processing + storage
│   │   │   │   └── ingestion.service.ts     # Data ingestion pipeline
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts                  # JWT / Clerk auth verification
│   │   │   │   ├── rate-limit.ts            # Rate limiting middleware
│   │   │   │   └── error-handler.ts         # Global error handler
│   │   │   ├── plugins/
│   │   │   │   ├── database.ts              # Drizzle DB plugin for Fastify
│   │   │   │   ├── redis.ts                 # Redis connection plugin
│   │   │   │   ├── websocket.ts             # WebSocket plugin (fastify-websocket)
│   │   │   │   └── cors.ts                  # CORS configuration
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts               # WebSocket connection handler
│   │   │   │   └── channels.ts              # WS channel definitions
│   │   │   └── lib/
│   │   │       ├── env.ts                   # Environment variable validation (zod)
│   │   │       ├── logger.ts                # Pino logger configuration
│   │   │       └── errors.ts                # Custom error classes
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   └── monitor/                             # Voyager Monitor reference (Go agent)
│       └── README.md                        # Reference doc — agent exists separately
│
├── packages/
│   ├── db/                                  # Drizzle ORM schemas + migrations
│   │   ├── src/
│   │   │   ├── index.ts                     # DB client export
│   │   │   ├── schema/
│   │   │   │   ├── index.ts                 # Re-export all schemas
│   │   │   │   ├── clusters.ts              # Clusters table
│   │   │   │   ├── nodes.ts                 # Nodes table
│   │   │   │   ├── workloads.ts             # Workloads table
│   │   │   │   ├── metrics.ts               # Metrics (TimescaleDB hypertable)
│   │   │   │   ├── events.ts                # K8s events table
│   │   │   │   ├── users.ts                 # Users / organizations table
│   │   │   │   └── api-keys.ts              # API keys for agent auth
│   │   │   ├── migrate.ts                   # Migration runner
│   │   │   └── seed.ts                      # Seed script for dev data
│   │   ├── drizzle/
│   │   │   └── 0000_initial.sql             # First migration
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── ui/                                  # Shared UI components (Shadcn)
│   │   ├── src/
│   │   │   ├── index.ts                     # Re-export all components
│   │   │   ├── components/
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   └── scroll-area.tsx
│   │   │   └── lib/
│   │   │       └── utils.ts                 # cn() utility
│   │   ├── tailwind.config.ts               # Shared Tailwind preset
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── types/                               # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── index.ts                     # Re-export all types
│   │   │   ├── cluster.ts                   # Cluster-related types
│   │   │   ├── metrics.ts                   # Metrics types
│   │   │   ├── events.ts                    # Event types
│   │   │   ├── api.ts                       # API request/response types
│   │   │   └── monitor.ts                   # Voyager Monitor payload types
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── config/                              # Shared configs
│       ├── eslint/
│       │   ├── base.js                      # Base ESLint config
│       │   ├── next.js                      # Next.js-specific rules
│       │   └── node.js                      # Node/Fastify-specific rules
│       ├── typescript/
│       │   ├── base.json                    # Base tsconfig
│       │   ├── next.json                    # Next.js tsconfig
│       │   └── node.json                    # Node.js tsconfig
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   ├── docker-compose.yml                   # Local dev stack
│   ├── docker-compose.prod.yml              # Production stack (reference)
│   └── init-scripts/
│       └── 01-init-timescaledb.sql          # Enable TimescaleDB extension
│
├── .env.example                             # Root env template
├── .gitignore
├── .npmrc                                   # pnpm config
├── turbo.json                               # Turborepo pipeline
├── pnpm-workspace.yaml                      # pnpm workspace definition
├── package.json                             # Root package.json
├── tsconfig.json                            # Root tsconfig
├── README.md                                # Project README
├── LICENSE                                  # MIT or Apache 2.0
└── CONTRIBUTING.md                          # Contribution guidelines (stub)
```

### 1.2 File Count Summary

| Directory | Files | Purpose |
|-----------|-------|---------|
| `.github/` | 4 | CI/CD, PR template |
| `apps/web/` | ~30 | Next.js frontend |
| `apps/api/` | ~20 | Fastify backend |
| `packages/db/` | ~12 | Database schemas + migrations |
| `packages/ui/` | ~16 | Shared components |
| `packages/types/` | ~7 | Shared types |
| `packages/config/` | ~7 | Shared configs |
| `docker/` | 3 | Docker compose + init |
| Root | ~8 | Monorepo config |
| **Total** | **~107** | |

---

## 2. Package.json Files

### 2.1 Root `package.json`

```json
{
  "name": "voyager-platform",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "db:generate": "pnpm --filter @voyager/db generate",
    "db:migrate": "pnpm --filter @voyager/db migrate",
    "db:push": "pnpm --filter @voyager/db push",
    "db:seed": "pnpm --filter @voyager/db seed",
    "db:studio": "pnpm --filter @voyager/db studio",
    "docker:up": "docker compose -f docker/docker-compose.yml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yml down",
    "docker:reset": "docker compose -f docker/docker-compose.yml down -v && docker compose -f docker/docker-compose.yml up -d",
    "clean": "turbo clean && rm -rf node_modules",
    "prepare": "husky"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.12",
    "husky": "^9.1.7",
    "lint-staged": "^15.4.3",
    "prettier": "^3.4.2",
    "prettier-plugin-tailwindcss": "^0.6.11",
    "turbo": "^2.3.4",
    "typescript": "^5.7.3"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### 2.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 2.3 `apps/web/package.json`

```json
{
  "name": "@voyager/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clerk/nextjs": "^6.9.6",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-dialog": "^1.1.5",
    "@radix-ui/react-dropdown-menu": "^2.1.5",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.7",
    "@tanstack/react-query": "^5.66.0",
    "@trpc/client": "^11.0.0",
    "@trpc/next": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "@voyager/types": "workspace:*",
    "@voyager/ui": "workspace:*",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.474.0",
    "next": "^15.1.6",
    "next-themes": "^0.4.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.1",
    "superjson": "^2.2.2",
    "tailwind-merge": "^3.0.1",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "@types/node": "^22.12.2",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "@voyager/config": "workspace:*",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.1",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.7.3"
  }
}
```

### 2.4 `apps/api/package.json`

```json
{
  "name": "@voyager/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsup src/server.ts --format esm --dts",
    "start": "node dist/server.js",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@clerk/backend": "^1.22.0",
    "@fastify/cors": "^10.0.2",
    "@fastify/helmet": "^12.0.2",
    "@fastify/rate-limit": "^10.2.2",
    "@fastify/websocket": "^11.0.2",
    "@trpc/server": "^11.0.0",
    "@voyager/db": "workspace:*",
    "@voyager/types": "workspace:*",
    "bullmq": "^5.34.8",
    "dotenv": "^16.4.7",
    "fastify": "^5.2.1",
    "fastify-plugin": "^5.0.1",
    "ioredis": "^5.4.2",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "superjson": "^2.2.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.12.2",
    "@types/ws": "^8.5.14",
    "@voyager/config": "workspace:*",
    "tsup": "^8.3.6",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

### 2.5 `packages/db/package.json`

```json
{
  "name": "@voyager/db",
  "version": "0.1.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "push": "drizzle-kit push",
    "studio": "drizzle-kit studio",
    "seed": "tsx src/seed.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.38.4",
    "postgres": "^3.4.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.4",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  }
}
```

### 2.6 `packages/ui/package.json`

```json
{
  "name": "@voyager/ui",
  "version": "0.1.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./components/*": "./src/components/*.tsx",
    "./lib/*": "./src/lib/*.ts",
    "./globals.css": "./src/globals.css"
  },
  "scripts": {
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-dialog": "^1.1.5",
    "@radix-ui/react-dropdown-menu": "^2.1.5",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.7",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.474.0",
    "tailwind-merge": "^3.0.1"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3"
  }
}
```

### 2.7 `packages/types/package.json`

```json
{
  "name": "@voyager/types",
  "version": "0.1.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "zod": "^3.24.1"
  }
}
```

### 2.8 `packages/config/package.json`

```json
{
  "name": "@voyager/config",
  "version": "0.1.0",
  "private": true,
  "exports": {
    "./eslint/base": "./eslint/base.js",
    "./eslint/next": "./eslint/next.js",
    "./eslint/node": "./eslint/node.js",
    "./typescript/base": "./typescript/base.json",
    "./typescript/next": "./typescript/next.json",
    "./typescript/node": "./typescript/node.json"
  }
}
```

---

## 3. Configuration Files

### 3.1 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env", ".env.local"],
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  ],
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"],
      "env": ["NODE_ENV"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 3.2 Root `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules"]
}
```

### 3.3 `packages/config/typescript/base.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "exclude": ["node_modules", "dist"]
}
```

### 3.4 `packages/config/typescript/next.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 3.5 `packages/config/typescript/node.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "ESNext",
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### 3.6 `apps/web/tsconfig.json`

```json
{
  "extends": "@voyager/config/typescript/next",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 3.7 `apps/api/tsconfig.json`

```json
{
  "extends": "@voyager/config/typescript/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.8 `packages/db/tsconfig.json`

```json
{
  "extends": "@voyager/config/typescript/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.9 `packages/config/eslint/base.js`

```js
/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  env: {
    es2022: true,
    node: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "import/order": [
      "warn",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          ["parent", "sibling"],
          "index",
        ],
        "newlines-between": "always",
        alphabetize: { order: "asc" },
      },
    ],
  },
  ignorePatterns: [
    "dist",
    ".next",
    "node_modules",
    "*.js",
    "*.mjs",
    "*.cjs",
  ],
};
```

### 3.10 `packages/config/eslint/next.js`

```js
/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    "./base.js",
    "next/core-web-vitals",
    "next/typescript",
  ],
  env: {
    browser: true,
    node: true,
  },
  rules: {
    "@next/next/no-html-link-for-pages": "off",
  },
};
```

### 3.11 `packages/config/eslint/node.js`

```js
/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["./base.js"],
  env: {
    node: true,
  },
  rules: {
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
  },
};
```

### 3.12 `apps/web/.eslintrc.js`

```js
module.exports = {
  extends: ["@voyager/config/eslint/next"],
};
```

### 3.13 `apps/api/.eslintrc.js`

```js
module.exports = {
  extends: ["@voyager/config/eslint/node"],
};
```

### 3.14 `apps/web/tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Voyager brand colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Status colors
        healthy: "hsl(var(--healthy))",
        warning: "hsl(var(--warning))",
        critical: "hsl(var(--critical))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
```

### 3.15 `apps/web/postcss.config.js`

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 3.16 `apps/web/next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: ["@voyager/ui", "@voyager/types"],

  // Experimental features
  experimental: {
    // Enable typed routes
    typedRoutes: true,
  },

  // Redirect root to clusters
  async redirects() {
    return [
      {
        source: "/",
        destination: "/clusters",
        permanent: false,
      },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default nextConfig;
```

### 3.17 `packages/db/drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

### 3.18 `docker/docker-compose.yml`

```yaml
# Voyager Platform — Local Development Stack
# Usage: docker compose -f docker/docker-compose.yml up -d
# Reset: docker compose -f docker/docker-compose.yml down -v && docker compose -f docker/docker-compose.yml up -d

version: "3.9"

services:
  # ─────────────────────────────────────────────
  # PostgreSQL + TimescaleDB
  # ─────────────────────────────────────────────
  postgres:
    image: timescale/timescaledb:latest-pg16
    container_name: voyager-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: voyager
      POSTGRES_PASSWORD: voyager_dev_password
      POSTGRES_DB: voyager
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U voyager -d voyager"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - voyager-network

  # ─────────────────────────────────────────────
  # Redis (cache + pub/sub + BullMQ)
  # ─────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: voyager-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - voyager-network

  # ─────────────────────────────────────────────
  # OpenSearch (log storage + search)
  # ─────────────────────────────────────────────
  opensearch:
    image: opensearchproject/opensearch:2.18.0
    container_name: voyager-opensearch
    restart: unless-stopped
    ports:
      - "9200:9200"
      - "9600:9600"
    environment:
      - discovery.type=single-node
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
      - DISABLE_SECURITY_PLUGIN=true  # Dev only — no SSL overhead
      - DISABLE_INSTALL_DEMO_CONFIG=true
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - opensearch_data:/usr/share/opensearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:9200 >/dev/null || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 5
    networks:
      - voyager-network

  # ─────────────────────────────────────────────
  # OpenSearch Dashboards (optional — for log exploration)
  # ─────────────────────────────────────────────
  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2.18.0
    container_name: voyager-opensearch-dashboards
    restart: unless-stopped
    ports:
      - "5601:5601"
    environment:
      - OPENSEARCH_HOSTS=["http://opensearch:9200"]
      - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
    depends_on:
      opensearch:
        condition: service_healthy
    networks:
      - voyager-network
    profiles:
      - dashboards  # Only start with: docker compose --profile dashboards up

volumes:
  postgres_data:
  redis_data:
  opensearch_data:

networks:
  voyager-network:
    driver: bridge
```

### 3.19 `docker/init-scripts/01-init-timescaledb.sql`

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Confirmation
DO $$
BEGIN
  RAISE NOTICE 'TimescaleDB and extensions initialized for Voyager Platform';
END
$$;
```

### 3.20 `apps/api/Dockerfile`

```dockerfile
# =============================================
# Voyager API — Multi-stage Dockerfile
# =============================================

# ── Stage 1: Base ──────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Stage 2: Dependencies ─────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter @voyager/api...

# ── Stage 3: Build ─────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY apps/api ./apps/api
COPY packages ./packages
COPY tsconfig.json ./

WORKDIR /app/apps/api
RUN pnpm build

# ── Stage 4: Production ───────────────────
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 voyager && \
    adduser --system --uid 1001 voyager
WORKDIR /app

COPY --from=builder --chown=voyager:voyager /app/apps/api/dist ./dist
COPY --from=builder --chown=voyager:voyager /app/apps/api/package.json ./
COPY --from=deps --chown=voyager:voyager /app/apps/api/node_modules ./node_modules

USER voyager
EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/server.js"]
```

### 3.21 `apps/web/Dockerfile` (reference — production build)

```dockerfile
# =============================================
# Voyager Web — Multi-stage Dockerfile
# =============================================

# ── Stage 1: Base ──────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Stage 2: Dependencies ─────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter @voyager/web...

# ── Stage 3: Build ─────────────────────────
FROM base AS builder
COPY --from=deps /app ./
COPY . .

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app/apps/web
RUN pnpm build

# ── Stage 4: Production ───────────────────
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 voyager && \
    adduser --system --uid 1001 voyager
WORKDIR /app

COPY --from=builder --chown=voyager:voyager /app/apps/web/.next/standalone ./
COPY --from=builder --chown=voyager:voyager /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=voyager:voyager /app/apps/web/public ./apps/web/public

USER voyager
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
```

### 3.22 `.env.example`

```bash
# ═══════════════════════════════════════════════
# Voyager Platform — Environment Variables
# ═══════════════════════════════════════════════
# Copy this file to .env and fill in your values.
# NEVER commit .env to version control.

# ── Application ────────────────────────────────
NODE_ENV=development
PORT=4000
WEB_URL=http://localhost:3000
API_URL=http://localhost:4000

# ── Database (PostgreSQL + TimescaleDB) ────────
DATABASE_URL=postgresql://voyager:voyager_dev_password@localhost:5432/voyager

# ── Redis ──────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── OpenSearch ─────────────────────────────────
OPENSEARCH_URL=http://localhost:9200

# ── Auth (Clerk) ───────────────────────────────
# Get these from https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/clusters
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/clusters

# ── API URLs (for frontend) ───────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000

# ── Voyager Monitor Agent ─────────────────────
# API key for agent authentication (generate a random UUID)
VOYAGER_AGENT_API_KEY=vgr_dev_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── AI / LLM (Phase 3 — not needed for Week 1)
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# ── Logging ────────────────────────────────────
LOG_LEVEL=debug
```

### 3.23 `.gitignore`

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
.next/
.turbo/
out/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/

# Debug
npm-debug.log*
pnpm-debug.log*

# Drizzle
packages/db/drizzle/meta/

# Docker volumes (if local)
docker/data/
```

### 3.24 `.npmrc`

```ini
# Use pnpm's hoisted node_modules for compatibility
shamefully-hoist=true
# Strict peer dependencies
strict-peer-dependencies=false
# Auto-install peers
auto-install-peers=true
```

### 3.25 `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9.15.4"

jobs:
  lint-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: lint-typecheck
    services:
      postgres:
        image: timescale/timescaledb:latest-pg16
        env:
          POSTGRES_USER: voyager
          POSTGRES_PASSWORD: voyager_test
          POSTGRES_DB: voyager_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://voyager:voyager_test@localhost:5432/voyager_test
      REDIS_URL: redis://localhost:6379
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        run: pnpm db:migrate

      - name: Run tests
        run: pnpm test

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: lint-typecheck
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm build
        env:
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_placeholder
          NEXT_PUBLIC_API_URL: http://localhost:4000
```

---

## 4. Week 1 Implementation Guide

### Day 1: Project Setup (Monday)

**Goal:** Monorepo initialized, all configs working, Docker dev stack running, CI pipeline green.

#### Step 1: Initialize the monorepo

```bash
# Create project directory
mkdir voyager-platform && cd voyager-platform

# Initialize git
git init
git checkout -b main

# Create root package.json
# (paste the root package.json from Section 2.1)

# Create pnpm-workspace.yaml
# (paste from Section 2.2)

# Create .npmrc
# (paste from Section 3.24)

# Create .gitignore
# (paste from Section 3.23)

# Create turbo.json
# (paste from Section 3.1)

# Create root tsconfig.json
# (paste from Section 3.2)
```

#### Step 2: Create directory structure

```bash
# Apps
mkdir -p apps/web/src/{app,components,lib,hooks}
mkdir -p apps/web/public
mkdir -p apps/api/src/{trpc/routers,routes,services,middleware,plugins,ws,lib}
mkdir -p apps/monitor

# Packages
mkdir -p packages/db/src/schema
mkdir -p packages/db/drizzle
mkdir -p packages/ui/src/{components,lib}
mkdir -p packages/types/src
mkdir -p packages/config/{eslint,typescript}

# Docker
mkdir -p docker/init-scripts

# GitHub
mkdir -p .github/workflows
```

#### Step 3: Install shared configs package

```bash
# Create packages/config/package.json
# (paste from Section 2.8)

# Create all ESLint configs
# (paste from Sections 3.9, 3.10, 3.11)

# Create all TypeScript configs
# (paste from Sections 3.3, 3.4, 3.5)
```

#### Step 4: Initialize apps/web

```bash
# Create apps/web/package.json
# (paste from Section 2.3)

# Create apps/web/tsconfig.json
# (paste from Section 3.6)

# Create next.config.ts
# (paste from Section 3.16)

# Create tailwind.config.ts
# (paste from Section 3.14)

# Create postcss.config.js
# (paste from Section 3.15)

# Create .eslintrc.js
# (paste from Section 3.12)
```

Create `apps/web/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
    --healthy: 142.1 76.2% 36.3%;
    --warning: 38 92% 50%;
    --critical: 0 84.2% 60.2%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
    --healthy: 142.1 70.6% 45.3%;
    --warning: 38 92% 50%;
    --critical: 0 72.2% 50.6%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

Create `apps/web/src/app/layout.tsx` (minimal root layout):

```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";

export const metadata: Metadata = {
  title: "Voyager Platform",
  description: "Unified cloud operations platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
```

#### Step 5: Initialize apps/api

```bash
# Create apps/api/package.json
# (paste from Section 2.4)

# Create apps/api/tsconfig.json
# (paste from Section 3.7)

# Create apps/api/.eslintrc.js
# (paste from Section 3.13)
```

Create minimal `apps/api/src/server.ts`:

```ts
import Fastify from "fastify";

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

server.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "4000", 10);
    await server.listen({ port, host: "0.0.0.0" });
    server.log.info(`Voyager API running on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
```

#### Step 6: Initialize packages

```bash
# Create packages/db/package.json (paste from Section 2.5)
# Create packages/db/tsconfig.json (paste from Section 3.8)
# Create packages/db/drizzle.config.ts (paste from Section 3.17)

# Create packages/ui/package.json (paste from Section 2.6)
# Create packages/types/package.json (paste from Section 2.7)
```

Create `packages/ui/src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Create `packages/ui/src/index.ts`:

```ts
export { cn } from "./lib/utils";
```

Create `packages/types/src/index.ts`:

```ts
export type * from "./cluster";
export type * from "./metrics";
export type * from "./events";
export type * from "./api";
export type * from "./monitor";
```

#### Step 7: Start Docker dev stack

```bash
# Create docker-compose.yml and init scripts
# (paste from Sections 3.18, 3.19)

# Create .env from .env.example
cp .env.example .env
# Edit .env with your Clerk keys

# Start infrastructure
pnpm docker:up

# Verify everything is running
docker ps
# Should see: voyager-postgres, voyager-redis, voyager-opensearch

# Test connections
docker exec voyager-postgres psql -U voyager -d voyager -c "SELECT version();"
docker exec voyager-redis redis-cli ping
curl http://localhost:9200
```

#### Step 8: Install all dependencies and verify

```bash
# Install all workspace dependencies
pnpm install

# Verify builds work
pnpm typecheck

# Start dev servers
pnpm dev

# Verify:
# - Web: http://localhost:3000
# - API: http://localhost:4000/health
```

#### Step 9: Set up CI

```bash
# Create .github/workflows/ci.yml
# (paste from Section 3.25)

# Create PR template
# (paste from Section 6.2)

# Initial commit
git add .
git commit -m "feat: initialize monorepo with Next.js + Fastify + packages"
git remote add origin <your-repo-url>
git push -u origin main
```

**Day 1 Checklist:**
- [ ] Monorepo structure created
- [ ] All package.json files in place
- [ ] All config files working
- [ ] `pnpm install` succeeds
- [ ] `pnpm typecheck` passes
- [ ] Docker stack running (PostgreSQL, Redis, OpenSearch)
- [ ] `pnpm dev` starts both web and api
- [ ] Web accessible at localhost:3000
- [ ] API health check at localhost:4000/health returns OK
- [ ] CI pipeline runs and passes on push

---

### Day 2: Auth + Database Foundation (Tuesday)

**Goal:** Clerk auth working, database schema defined, Drizzle ORM connected, first migration applied.

#### Step 1: Set up Clerk

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create new application "Voyager Platform"
3. Enable sign-in methods: Email, Google, GitHub
4. Copy publishable key and secret key to `.env`
5. Set redirect URLs:
   - After sign-in: `/clusters`
   - After sign-up: `/clusters`
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`

Install Clerk and font packages:

```bash
cd apps/web
pnpm add @clerk/nextjs geist
```

Update `apps/web/src/app/layout.tsx` — full version with providers:

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/providers/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Voyager Platform",
  description:
    "Unified cloud operations — cluster management, cost optimization, and runtime security in one dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

Create `apps/web/src/components/providers/theme-provider.tsx`:

```tsx
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

Create `apps/web/src/middleware.ts` (Clerk auth middleware):

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/trpc(.*)",  // tRPC handles its own auth
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
```

Create `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-card shadow-lg",
          },
        }}
      />
    </div>
  );
}
```

Create `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-card shadow-lg",
          },
        }}
      />
    </div>
  );
}
```

#### Step 2: Define database schema

Create `packages/db/src/schema/users.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  clerkOrgId: varchar("clerk_org_id", { length: 255 }).unique(),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  maxNodes: varchar("max_nodes", { length: 10 }).notNull().default("5"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  avatarUrl: text("avatar_url"),
  organizationId: uuid("organization_id").references(() => organizations.id),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Create `packages/db/src/schema/clusters.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  integer,
  boolean,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import { organizations } from "./users";

export const clusters = pgTable("clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  provider: varchar("provider", { length: 50 }).notNull(), // 'aws', 'azure', 'gcp', 'on-prem'
  region: varchar("region", { length: 100 }),
  kubernetesVersion: varchar("kubernetes_version", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  // 'healthy', 'warning', 'critical', 'unreachable', 'pending'
  nodeCount: integer("node_count").notNull().default(0),
  podCount: integer("pod_count").notNull().default(0),
  namespaceCount: integer("namespace_count").notNull().default(0),
  cpuCapacity: real("cpu_capacity"), // Total CPU cores
  cpuUsage: real("cpu_usage"), // Current CPU usage (cores)
  memoryCapacity: real("memory_capacity"), // Total memory (bytes)
  memoryUsage: real("memory_usage"), // Current memory usage (bytes)
  monthlyCostEstimate: real("monthly_cost_estimate"), // USD
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  agentVersion: varchar("agent_version", { length: 50 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Create `packages/db/src/schema/nodes.ts`:

```ts
import {
  pgTable,
  timestamp,
  varchar,
  uuid,
  integer,
  real,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { clusters } from "./clusters";

export const nodes = pgTable("nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clusterId: uuid("cluster_id")
    .notNull()
    .references(() => clusters.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("unknown"),
  // 'ready', 'not-ready', 'unknown'
  role: varchar("role", { length: 50 }), // 'master', 'worker'
  instanceType: varchar("instance_type", { length: 100 }),
  availabilityZone: varchar("availability_zone", { length: 100 }),
  kubeletVersion: varchar("kubelet_version", { length: 50 }),
  osImage: varchar("os_image", { length: 255 }),
  containerRuntime: varchar("container_runtime", { length: 100 }),
  cpuCapacity: real("cpu_capacity"),
  cpuUsage: real("cpu_usage"),
  memoryCapacity: real("memory_capacity"),
  memoryUsage: real("memory_usage"),
  podCapacity: integer("pod_capacity"),
  podCount: integer("pod_count").notNull().default(0),
  conditions: jsonb("conditions").$type<
    Array<{ type: string; status: string; message?: string }>
  >(),
  labels: jsonb("labels").$type<Record<string, string>>(),
  hourlyRate: real("hourly_rate"), // USD per hour for this node
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Create `packages/db/src/schema/workloads.ts`:

```ts
import {
  pgTable,
  timestamp,
  varchar,
  uuid,
  integer,
  real,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { clusters } from "./clusters";

export const workloads = pgTable("workloads", {
  id: uuid("id").primaryKey().defaultRandom(),
  clusterId: uuid("cluster_id")
    .notNull()
    .references(() => clusters.id, { onDelete: "cascade" }),
  namespace: varchar("namespace", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 50 }).notNull(),
  // 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'
  status: varchar("status", { length: 50 }).notNull().default("unknown"),
  replicas: integer("replicas").default(0),
  readyReplicas: integer("ready_replicas").default(0),
  cpuRequest: real("cpu_request"),
  cpuLimit: real("cpu_limit"),
  cpuUsage: real("cpu_usage"),
  memoryRequest: real("memory_request"),
  memoryLimit: real("memory_limit"),
  memoryUsage: real("memory_usage"),
  images: jsonb("images").$type<string[]>(),
  labels: jsonb("labels").$type<Record<string, string>>(),
  restartCount: integer("restart_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Create `packages/db/src/schema/metrics.ts`:

```ts
import {
  pgTable,
  timestamp,
  varchar,
  uuid,
  real,
  text,
  jsonb,
} from "drizzle-orm/pg-core";

// This table will be converted to a TimescaleDB hypertable
// in the migration for efficient time-series queries
export const metrics = pgTable("metrics", {
  time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  clusterId: uuid("cluster_id").notNull(),
  nodeId: uuid("node_id"),
  namespace: varchar("namespace", { length: 255 }),
  workloadName: varchar("workload_name", { length: 255 }),
  metricName: varchar("metric_name", { length: 255 }).notNull(),
  // e.g., 'cpu_usage', 'memory_usage', 'network_rx', 'disk_usage'
  value: real("value").notNull(),
  unit: varchar("unit", { length: 50 }),
  // 'cores', 'bytes', 'percent', 'bytes_per_sec'
  labels: jsonb("labels").$type<Record<string, string>>(),
});
```

Create `packages/db/src/schema/events.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clusterId: uuid("cluster_id").notNull(),
  namespace: varchar("namespace", { length: 255 }),
  involvedObject: varchar("involved_object", { length: 255 }),
  // e.g., 'Pod/my-pod-abc123'
  involvedObjectKind: varchar("involved_object_kind", { length: 50 }),
  // 'Pod', 'Deployment', 'Node', etc.
  type: varchar("type", { length: 50 }).notNull(),
  // 'Normal', 'Warning'
  reason: varchar("reason", { length: 255 }).notNull(),
  // e.g., 'Scheduled', 'Pulling', 'OOMKilled', 'BackOff'
  message: text("message"),
  source: varchar("source", { length: 255 }),
  count: integer("count").default(1),
  firstSeen: timestamp("first_seen", { withTimezone: true }),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Create `packages/db/src/schema/api-keys.ts`:

```ts
import {
  pgTable,
  timestamp,
  varchar,
  uuid,
  boolean,
  text,
} from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { clusters } from "./clusters";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  clusterId: uuid("cluster_id").references(() => clusters.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
  // e.g., 'vgr_xxxx' — first 8 chars for identification
  scopes: text("scopes").array(),
  // ['ingest', 'read', 'admin']
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Create `packages/db/src/schema/index.ts`:

```ts
export * from "./users";
export * from "./clusters";
export * from "./nodes";
export * from "./workloads";
export * from "./metrics";
export * from "./events";
export * from "./api-keys";
```

#### Step 3: Set up Drizzle ORM connection

Create `packages/db/src/index.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// For query purposes (connection pooling)
const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

// Export types
export type Database = typeof db;
export { schema };

// Re-export drizzle utilities
export { eq, and, or, desc, asc, sql, count, avg, sum, min, max, gt, gte, lt, lte, ne, isNull, isNotNull, inArray, notInArray, like, ilike, between } from "drizzle-orm";
```

#### Step 4: Create first migration

Create `packages/db/drizzle/0000_initial.sql`:

```sql
-- ═══════════════════════════════════════════════
-- Voyager Platform — Initial Migration
-- ═══════════════════════════════════════════════

-- Enable required extensions (should already be set by init script)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ─────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  clerk_org_id VARCHAR(255) UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  max_nodes VARCHAR(10) NOT NULL DEFAULT '5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Clusters ──────────────────────────────────
CREATE TABLE IF NOT EXISTS clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  provider VARCHAR(50) NOT NULL,
  region VARCHAR(100),
  kubernetes_version VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  node_count INTEGER NOT NULL DEFAULT 0,
  pod_count INTEGER NOT NULL DEFAULT 0,
  namespace_count INTEGER NOT NULL DEFAULT 0,
  cpu_capacity REAL,
  cpu_usage REAL,
  memory_capacity REAL,
  memory_usage REAL,
  monthly_cost_estimate REAL,
  last_heartbeat TIMESTAMPTZ,
  agent_version VARCHAR(50),
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clusters_org ON clusters(organization_id);
CREATE INDEX idx_clusters_status ON clusters(status);

-- ── Nodes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'unknown',
  role VARCHAR(50),
  instance_type VARCHAR(100),
  availability_zone VARCHAR(100),
  kubelet_version VARCHAR(50),
  os_image VARCHAR(255),
  container_runtime VARCHAR(100),
  cpu_capacity REAL,
  cpu_usage REAL,
  memory_capacity REAL,
  memory_usage REAL,
  pod_capacity INTEGER,
  pod_count INTEGER NOT NULL DEFAULT 0,
  conditions JSONB,
  labels JSONB,
  hourly_rate REAL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nodes_cluster ON nodes(cluster_id);
CREATE INDEX idx_nodes_status ON nodes(status);

-- ── Workloads ─────────────────────────────────
CREATE TABLE IF NOT EXISTS workloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  namespace VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'unknown',
  replicas INTEGER DEFAULT 0,
  ready_replicas INTEGER DEFAULT 0,
  cpu_request REAL,
  cpu_limit REAL,
  cpu_usage REAL,
  memory_request REAL,
  memory_limit REAL,
  memory_usage REAL,
  images JSONB,
  labels JSONB,
  restart_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workloads_cluster ON workloads(cluster_id);
CREATE INDEX idx_workloads_namespace ON workloads(cluster_id, namespace);
CREATE INDEX idx_workloads_kind ON workloads(kind);

-- ── Metrics (TimescaleDB Hypertable) ──────────
CREATE TABLE IF NOT EXISTS metrics (
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cluster_id UUID NOT NULL,
  node_id UUID,
  namespace VARCHAR(255),
  workload_name VARCHAR(255),
  metric_name VARCHAR(255) NOT NULL,
  value REAL NOT NULL,
  unit VARCHAR(50),
  labels JSONB
);

-- Convert metrics to a TimescaleDB hypertable for efficient time-series queries
-- chunk_time_interval = 1 day, which is good for 7-30 day retention
SELECT create_hypertable('metrics', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- Compression policy: compress chunks older than 3 days
ALTER TABLE metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'cluster_id,metric_name',
  timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('metrics', INTERVAL '3 days', if_not_exists => TRUE);

-- Retention policy: drop data older than 30 days (free tier)
SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);

-- Indexes for common metric queries
CREATE INDEX idx_metrics_cluster_metric ON metrics (cluster_id, metric_name, time DESC);
CREATE INDEX idx_metrics_node ON metrics (node_id, metric_name, time DESC) WHERE node_id IS NOT NULL;
CREATE INDEX idx_metrics_workload ON metrics (cluster_id, namespace, workload_name, metric_name, time DESC)
  WHERE namespace IS NOT NULL AND workload_name IS NOT NULL;

-- ── Events ────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL,
  namespace VARCHAR(255),
  involved_object VARCHAR(255),
  involved_object_kind VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  message TEXT,
  source VARCHAR(255),
  count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_cluster ON events(cluster_id, created_at DESC);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_reason ON events(reason);
CREATE INDEX idx_events_namespace ON events(cluster_id, namespace, created_at DESC);

-- ── API Keys ──────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(10) NOT NULL,
  scopes TEXT[],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ── Updated At Trigger ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_clusters_updated_at
  BEFORE UPDATE ON clusters FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_nodes_updated_at
  BEFORE UPDATE ON nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_workloads_updated_at
  BEFORE UPDATE ON workloads FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════
-- Migration complete
-- ═══════════════════════════════════════════════
```

#### Step 5: Create migration runner

Create `packages/db/src/migrate.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

async function main() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete!");
  await migrationClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

#### Step 6: Create seed script

Create `packages/db/src/seed.ts`:

```ts
import { db, schema, eq } from "./index";

async function seed() {
  console.log("🌱 Seeding database...");

  // Create default organization
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Voyager Dev",
      slug: "voyager-dev",
      plan: "team",
      maxNodes: "100",
    })
    .onConflictDoNothing({ target: schema.organizations.slug })
    .returning();

  const orgId = org?.id;
  if (!orgId) {
    console.log("Organization already exists, fetching...");
    const existing = await db.query.organizations.findFirst({
      where: eq(schema.organizations.slug, "voyager-dev"),
    });
    if (!existing) throw new Error("Could not find or create organization");
    return seedClusters(existing.id);
  }

  await seedClusters(orgId);
}

async function seedClusters(orgId: string) {
  // EKS Cluster
  const [eksCluster] = await db
    .insert(schema.clusters)
    .values({
      organizationId: orgId,
      name: "prod-eks-us-east-1",
      displayName: "Production EKS",
      provider: "aws",
      region: "us-east-1",
      kubernetesVersion: "1.29",
      status: "healthy",
      nodeCount: 12,
      podCount: 147,
      namespaceCount: 8,
      cpuCapacity: 48,
      cpuUsage: 28.5,
      memoryCapacity: 192 * 1024 * 1024 * 1024, // 192 GiB in bytes
      memoryUsage: 118 * 1024 * 1024 * 1024,
      monthlyCostEstimate: 4250.0,
      lastHeartbeat: new Date(),
      agentVersion: "0.3.1",
    })
    .returning();

  // AKS Cluster
  const [aksCluster] = await db
    .insert(schema.clusters)
    .values({
      organizationId: orgId,
      name: "prod-aks-westeurope",
      displayName: "Production AKS",
      provider: "azure",
      region: "westeurope",
      kubernetesVersion: "1.28",
      status: "warning",
      nodeCount: 8,
      podCount: 93,
      namespaceCount: 6,
      cpuCapacity: 32,
      cpuUsage: 24.8,
      memoryCapacity: 128 * 1024 * 1024 * 1024,
      memoryUsage: 98 * 1024 * 1024 * 1024,
      monthlyCostEstimate: 3100.0,
      lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      agentVersion: "0.3.0",
    })
    .returning();

  // Dev Cluster
  await db.insert(schema.clusters).values({
    organizationId: orgId,
    name: "dev-eks-us-west-2",
    displayName: "Development EKS",
    provider: "aws",
    region: "us-west-2",
    kubernetesVersion: "1.29",
    status: "healthy",
    nodeCount: 4,
    podCount: 35,
    namespaceCount: 3,
    cpuCapacity: 16,
    cpuUsage: 6.2,
    memoryCapacity: 64 * 1024 * 1024 * 1024,
    memoryUsage: 22 * 1024 * 1024 * 1024,
    monthlyCostEstimate: 890.0,
    lastHeartbeat: new Date(),
    agentVersion: "0.3.1",
  });

  // Seed nodes for EKS cluster
  if (eksCluster) {
    const nodeNames = [
      "ip-10-0-1-100",
      "ip-10-0-1-101",
      "ip-10-0-1-102",
      "ip-10-0-2-100",
      "ip-10-0-2-101",
      "ip-10-0-2-102",
    ];

    for (const name of nodeNames) {
      await db.insert(schema.nodes).values({
        clusterId: eksCluster.id,
        name,
        status: "ready",
        role: "worker",
        instanceType: "m5.xlarge",
        availabilityZone: `us-east-1${name.includes("-1-") ? "a" : "b"}`,
        kubeletVersion: "v1.29.2",
        osImage: "Amazon Linux 2",
        containerRuntime: "containerd://1.7.2",
        cpuCapacity: 4,
        cpuUsage: Math.random() * 3 + 0.5,
        memoryCapacity: 16 * 1024 * 1024 * 1024,
        memoryUsage: Math.random() * 12 * 1024 * 1024 * 1024 + 2 * 1024 * 1024 * 1024,
        podCapacity: 110,
        podCount: Math.floor(Math.random() * 30) + 10,
        hourlyRate: 0.192,
      });
    }
  }

  console.log("✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

#### Step 7: Run migration + seed

```bash
# Make sure Docker stack is running
pnpm docker:up

# Run migration
pnpm db:migrate

# Seed dev data
pnpm db:seed

# Verify with Drizzle Studio
pnpm db:studio
# Opens a web UI at https://local.drizzle.studio to explore your database
```

**Day 2 Checklist:**
- [ ] Clerk application created and configured
- [ ] Clerk integration working in Next.js (sign-in/sign-up pages render)
- [ ] Auth middleware protecting dashboard routes
- [ ] All 7 database tables defined in Drizzle schema
- [ ] Migration runs successfully (including TimescaleDB hypertable)
- [ ] Seed data creates 3 clusters + 6 nodes
- [ ] Drizzle Studio shows seeded data
- [ ] `pnpm typecheck` still passes

---

### Day 3: tRPC Setup + First API Routes (Wednesday)

**Goal:** tRPC server on Fastify, tRPC client on Next.js, `cluster.list` endpoint returning real data from DB.

#### Step 1: Set up tRPC on Fastify

Create `apps/api/src/lib/env.ts`:

```ts
import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  VOYAGER_AGENT_API_KEY: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
```

Create `apps/api/src/lib/logger.ts`:

```ts
import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
```

Create `apps/api/src/lib/errors.ts`:

```ts
import { TRPCError } from "@trpc/server";

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof AppError) {
    return new TRPCError({
      code: error.statusCode === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : "Unknown error",
  });
}
```

Create `apps/api/src/trpc/context.ts`:

```ts
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { verifyToken } from "@clerk/backend";

import { db } from "@voyager/db";

import { env } from "../lib/env";
import { logger } from "../lib/logger";

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  // Extract auth token from Authorization header
  const authHeader = req.headers.authorization;
  let userId: string | null = null;
  let orgId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = await verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
      });
      userId = payload.sub;
      orgId = (payload as Record<string, unknown>).org_id as string | null;
    } catch {
      // Invalid token — userId remains null
      logger.debug("Invalid auth token");
    }
  }

  return {
    db,
    userId,
    orgId,
    req,
    res,
    logger,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

Create `apps/api/src/trpc/trpc.ts`:

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

// Auth middleware — requires valid Clerk session
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to access this resource",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

Create `apps/api/src/trpc/routers/health.ts`:

```ts
import { router, publicProcedure } from "../trpc";
import { sql } from "@voyager/db";

export const healthRouter = router({
  ping: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  dbCheck: publicProcedure.query(async ({ ctx }) => {
    try {
      const result = await ctx.db.execute(sql`SELECT 1 as check`);
      return { database: "connected", timestamp: new Date().toISOString() };
    } catch {
      return { database: "disconnected", timestamp: new Date().toISOString() };
    }
  }),
});
```

Create `apps/api/src/trpc/routers/cluster.ts`:

```ts
import { z } from "zod";
import { eq, and, desc, count } from "@voyager/db";
import { schema } from "@voyager/db";

import { router, protectedProcedure } from "../trpc";

export const clusterRouter = router({
  // List all clusters for the user's organization
  list: protectedProcedure.query(async ({ ctx }) => {
    // For MVP, return all clusters (multi-tenant scoping comes in Phase 4)
    const clusters = await ctx.db
      .select()
      .from(schema.clusters)
      .where(eq(schema.clusters.isActive, true))
      .orderBy(desc(schema.clusters.updatedAt));

    return clusters;
  }),

  // Get a single cluster by ID with its nodes
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const cluster = await ctx.db.query.clusters.findFirst({
        where: eq(schema.clusters.id, input.id),
      });

      if (!cluster) {
        throw new Error("Cluster not found");
      }

      const nodes = await ctx.db
        .select()
        .from(schema.nodes)
        .where(
          and(
            eq(schema.nodes.clusterId, input.id),
            eq(schema.nodes.isActive, true),
          ),
        )
        .orderBy(schema.nodes.name);

      return { ...cluster, nodes };
    }),

  // Get cluster summary stats
  summary: protectedProcedure.query(async ({ ctx }) => {
    const clusters = await ctx.db
      .select()
      .from(schema.clusters)
      .where(eq(schema.clusters.isActive, true));

    const totalNodes = clusters.reduce((sum, c) => sum + c.nodeCount, 0);
    const totalPods = clusters.reduce((sum, c) => sum + c.podCount, 0);
    const totalCost = clusters.reduce(
      (sum, c) => sum + (c.monthlyCostEstimate ?? 0),
      0,
    );
    const healthyClusters = clusters.filter(
      (c) => c.status === "healthy",
    ).length;
    const warningClusters = clusters.filter(
      (c) => c.status === "warning",
    ).length;
    const criticalClusters = clusters.filter(
      (c) => c.status === "critical",
    ).length;

    return {
      totalClusters: clusters.length,
      totalNodes,
      totalPods,
      totalMonthlyCost: totalCost,
      healthyClusters,
      warningClusters,
      criticalClusters,
    };
  }),

  // Update cluster (used by ingestion service)
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z
          .enum(["healthy", "warning", "critical", "unreachable", "pending"])
          .optional(),
        nodeCount: z.number().optional(),
        podCount: z.number().optional(),
        namespaceCount: z.number().optional(),
        cpuUsage: z.number().optional(),
        memoryUsage: z.number().optional(),
        lastHeartbeat: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [updated] = await ctx.db
        .update(schema.clusters)
        .set(updates)
        .where(eq(schema.clusters.id, id))
        .returning();

      return updated;
    }),
});
```

Create `apps/api/src/trpc/routers/metrics.ts`:

```ts
import { z } from "zod";
import { sql } from "@voyager/db";

import { router, protectedProcedure } from "../trpc";

export const metricsRouter = router({
  // Get latest metrics for a cluster
  getLatest: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        metricNames: z.array(z.string()).optional(),
        interval: z.enum(["5m", "1h", "6h", "24h", "7d"]).default("1h"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const intervalMap: Record<string, string> = {
        "5m": "5 minutes",
        "1h": "1 hour",
        "6h": "6 hours",
        "24h": "24 hours",
        "7d": "7 days",
      };

      const bucketSize = input.interval === "5m" ? "1 minute" :
                         input.interval === "1h" ? "5 minutes" :
                         input.interval === "6h" ? "15 minutes" :
                         input.interval === "24h" ? "1 hour" : "6 hours";

      const result = await ctx.db.execute(sql`
        SELECT
          time_bucket(${bucketSize}::interval, time) AS bucket,
          metric_name,
          avg(value) as avg_value,
          max(value) as max_value,
          min(value) as min_value
        FROM metrics
        WHERE cluster_id = ${input.clusterId}
          AND time > NOW() - ${intervalMap[input.interval]}::interval
          ${input.metricNames ? sql`AND metric_name = ANY(${input.metricNames})` : sql``}
        GROUP BY bucket, metric_name
        ORDER BY bucket ASC
      `);

      return result;
    }),
});
```

Create `apps/api/src/trpc/index.ts` (root router):

```ts
import { router } from "./trpc";
import { clusterRouter } from "./routers/cluster";
import { metricsRouter } from "./routers/metrics";
import { healthRouter } from "./routers/health";

export const appRouter = router({
  cluster: clusterRouter,
  metrics: metricsRouter,
  health: healthRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
```

#### Step 2: Wire tRPC into Fastify

Update `apps/api/src/server.ts`:

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";

import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { appRouter, type AppRouter } from "./trpc";
import { createContext } from "./trpc/context";
import { ingestRoutes } from "./routes/ingest";
import { healthRoutes } from "./routes/health";

async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    maxParamLength: 5000,
  });

  // Security
  await server.register(helmet, { contentSecurityPolicy: false });

  // CORS
  await server.register(cors, {
    origin: [env.WEB_URL, "http://localhost:3000"],
    credentials: true,
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
  });

  // Health check routes (no auth)
  await server.register(healthRoutes, { prefix: "/" });

  // Data ingestion routes (API key auth)
  await server.register(ingestRoutes, { prefix: "/api/v1" });

  // tRPC
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        logger.error(`tRPC error on '${path}':`, error.message);
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  return server;
}

async function start() {
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: "0.0.0.0" });
    logger.info(
      `🚀 Voyager API running on http://localhost:${env.PORT}`,
    );
    logger.info(`   tRPC: http://localhost:${env.PORT}/trpc`);
    logger.info(`   Health: http://localhost:${env.PORT}/health`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
```

Create `apps/api/src/routes/health.ts`:

```ts
import type { FastifyInstance } from "fastify";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health", async () => ({
    status: "ok",
    service: "voyager-api",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  server.get("/ready", async () => {
    // Check database connection
    // Check Redis connection
    return {
      status: "ready",
      timestamp: new Date().toISOString(),
    };
  });
}
```

Create `apps/api/src/routes/ingest.ts` (placeholder for Day 5):

```ts
import type { FastifyInstance } from "fastify";

export async function ingestRoutes(server: FastifyInstance) {
  // POST /api/v1/ingest — receives data from Voyager Monitor
  server.post("/ingest", async (request, reply) => {
    // TODO: Day 5 — implement ingestion pipeline
    return reply.status(202).send({ status: "accepted" });
  });
}
```

#### Step 3: Set up tRPC client in Next.js

Create `apps/web/src/lib/trpc.ts`:

```ts
"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@voyager/api/src/trpc";

export const trpc = createTRPCReact<AppRouter>();

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    // Browser — use relative URL or env var
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  }
  // SSR — use localhost
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
}

export function getTRPCLinks(getToken: () => Promise<string | null>) {
  return [
    httpBatchLink({
      url: `${getBaseUrl()}/trpc`,
      transformer: superjson,
      async headers() {
        const token = await getToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ];
}
```

Create `apps/web/src/components/providers/trpc-provider.tsx`:

```tsx
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

import { trpc, getTRPCLinks } from "@/lib/trpc";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: getTRPCLinks(getToken),
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

Update `apps/web/src/app/layout.tsx` to include TRPCProvider:

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { TRPCProvider } from "@/components/providers/trpc-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Voyager Platform",
  description:
    "Unified cloud operations — cluster management, cost optimization, and runtime security in one dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <TRPCProvider>{children}</TRPCProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

#### Step 4: Verify end-to-end

```bash
# Start both dev servers
pnpm dev

# Test tRPC endpoint directly
curl http://localhost:4000/trpc/health.ping

# Open http://localhost:3000
# Should redirect to sign-in page
# Sign in → should redirect to /clusters
```

**Day 3 Checklist:**
- [ ] tRPC server running on Fastify
- [ ] `cluster.list` returns seeded clusters
- [ ] `cluster.getById` returns cluster + nodes
- [ ] `cluster.summary` returns aggregate stats
- [ ] tRPC client configured in Next.js with Clerk token
- [ ] Health endpoint accessible at /trpc/health.ping
- [ ] Environment validation working (zod)
- [ ] Auth middleware blocks unauthenticated requests

---

### Day 4: Basic UI Shell (Thursday)

**Goal:** Dashboard layout with sidebar, header, dark mode, cluster overview page showing real data.

#### Step 1: Shared UI components

We'll use Shadcn UI patterns. Create the core components:

Create `packages/ui/src/components/button.tsx`:

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

Create `packages/ui/src/components/card.tsx`:

```tsx
import * as React from "react";
import { cn } from "../lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-2xl font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

Create `packages/ui/src/components/badge.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        healthy: "border-transparent bg-green-500/15 text-green-600 dark:text-green-400",
        warning: "border-transparent bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
        critical: "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
```

Create `packages/ui/src/components/skeleton.tsx`:

```tsx
import { cn } from "../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

Update `packages/ui/src/index.ts`:

```ts
export { cn } from "./lib/utils";
export { Button, buttonVariants } from "./components/button";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./components/card";
export { Badge, badgeVariants } from "./components/badge";
export { Skeleton } from "./components/skeleton";
```

#### Step 2: Dashboard layout

Create `apps/web/src/app/(dashboard)/layout.tsx`:

```tsx
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Server,
  DollarSign,
  Shield,
  Settings,
  Activity,
  Rocket,
} from "lucide-react";

import { cn } from "@voyager/ui";

const navigation = [
  {
    name: "Clusters",
    href: "/clusters",
    icon: Server,
    description: "Cluster management & health",
  },
  {
    name: "Costs",
    href: "/costs",
    icon: DollarSign,
    description: "FinOps & cost optimization",
  },
  {
    name: "Security",
    href: "/security",
    icon: Shield,
    description: "Runtime security & compliance",
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Configuration & preferences",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Rocket className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Voyager</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>Voyager v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
```

Create `apps/web/src/components/layout/header.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { UserButton } from "@clerk/nextjs";
import { Moon, Sun, Bell } from "lucide-react";

import { Button } from "@voyager/ui";

export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      {/* Left: Breadcrumb placeholder */}
      <div className="flex items-center gap-2">
        {/* Breadcrumbs will go here */}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User menu (Clerk) */}
        <UserButton
          afterSignOutUrl="/sign-in"
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        />
      </div>
    </header>
  );
}
```

#### Step 3: Cluster overview page

Create `apps/web/src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

Create `apps/web/src/components/clusters/cluster-status.tsx`:

```tsx
import { Badge } from "@voyager/ui";

type Status = "healthy" | "warning" | "critical" | "unreachable" | "pending";

const statusConfig: Record<Status, { label: string; variant: "healthy" | "warning" | "critical" | "secondary" }> = {
  healthy: { label: "Healthy", variant: "healthy" },
  warning: { label: "Warning", variant: "warning" },
  critical: { label: "Critical", variant: "critical" },
  unreachable: { label: "Unreachable", variant: "secondary" },
  pending: { label: "Pending", variant: "secondary" },
};

export function ClusterStatus({ status }: { status: string }) {
  const config = statusConfig[status as Status] ?? statusConfig.pending;

  return (
    <Badge variant={config.variant}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
```

Create `apps/web/src/components/clusters/cluster-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Server, Cpu, MemoryStick, Box, Cloud } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@voyager/ui";
import { ClusterStatus } from "./cluster-status";
import { formatBytes, formatCurrency, formatPercent, timeAgo } from "@/lib/utils";

interface ClusterCardProps {
  cluster: {
    id: string;
    name: string;
    displayName: string | null;
    provider: string;
    region: string | null;
    kubernetesVersion: string | null;
    status: string;
    nodeCount: number;
    podCount: number;
    cpuCapacity: number | null;
    cpuUsage: number | null;
    memoryCapacity: number | null;
    memoryUsage: number | null;
    monthlyCostEstimate: number | null;
    lastHeartbeat: Date | string | null;
    agentVersion: string | null;
  };
}

const providerIcons: Record<string, string> = {
  aws: "🟧",
  azure: "🔵",
  gcp: "🔴",
  "on-prem": "🖥️",
};

export function ClusterCard({ cluster }: ClusterCardProps) {
  const cpuPercent =
    cluster.cpuCapacity && cluster.cpuUsage
      ? Math.round((cluster.cpuUsage / cluster.cpuCapacity) * 100)
      : 0;
  const memPercent =
    cluster.memoryCapacity && cluster.memoryUsage
      ? Math.round((cluster.memoryUsage / cluster.memoryCapacity) * 100)
      : 0;

  return (
    <Link href={`/clusters/${cluster.id}`}>
      <Card className="transition-all hover:border-primary/50 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">
                {providerIcons[cluster.provider] ?? "☁️"}{" "}
                {cluster.displayName ?? cluster.name}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {cluster.name} · {cluster.region} · K8s {cluster.kubernetesVersion}
              </p>
            </div>
            <ClusterStatus status={cluster.status} />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Resource summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{cluster.nodeCount}</p>
              <p className="text-xs text-muted-foreground">Nodes</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{cluster.podCount}</p>
              <p className="text-xs text-muted-foreground">Pods</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(cluster.monthlyCostEstimate)}
              </p>
              <p className="text-xs text-muted-foreground">/month</p>
            </div>
          </div>

          {/* Resource bars */}
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Cpu className="h-3 w-3" /> CPU
                </span>
                <span>
                  {cluster.cpuUsage?.toFixed(1) ?? "0"} / {cluster.cpuCapacity ?? "0"} cores ({cpuPercent}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    cpuPercent > 85
                      ? "bg-red-500"
                      : cpuPercent > 70
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(cpuPercent, 100)}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MemoryStick className="h-3 w-3" /> Memory
                </span>
                <span>
                  {formatBytes(cluster.memoryUsage)} / {formatBytes(cluster.memoryCapacity)} ({memPercent}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    memPercent > 85
                      ? "bg-red-500"
                      : memPercent > 70
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(memPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Agent {cluster.agentVersion ?? "unknown"}</span>
            <span>Last seen {timeAgo(cluster.lastHeartbeat)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

Create `apps/web/src/components/clusters/cluster-grid.tsx`:

```tsx
"use client";

import { trpc } from "@/lib/trpc";
import { ClusterCard } from "./cluster-card";
import { Skeleton } from "@voyager/ui";

export function ClusterGrid() {
  const { data: clusters, isLoading, error } = trpc.cluster.list.useQuery();

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <p className="text-lg font-medium text-destructive">
          Failed to load clusters
        </p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!clusters?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <p className="text-lg font-medium">No clusters connected</p>
        <p className="text-sm text-muted-foreground">
          Install Voyager Monitor on your first cluster to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {clusters.map((cluster) => (
        <ClusterCard key={cluster.id} cluster={cluster} />
      ))}
    </div>
  );
}
```

Create `apps/web/src/app/(dashboard)/clusters/page.tsx`:

```tsx
"use client";

import { Server, Cpu, MemoryStick, DollarSign } from "lucide-react";

import { Card, CardContent } from "@voyager/ui";
import { ClusterGrid } from "@/components/clusters/cluster-grid";
import { trpc } from "@/lib/trpc";
import { formatBytes, formatCurrency } from "@/lib/utils";

export default function ClustersPage() {
  const { data: summary } = trpc.cluster.summary.useQuery();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clusters</h1>
        <p className="text-muted-foreground">
          Monitor and manage your Kubernetes clusters across all environments.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          title="Total Clusters"
          value={summary?.totalClusters ?? 0}
          icon={Server}
          detail={
            summary
              ? `${summary.healthyClusters} healthy · ${summary.warningClusters} warning · ${summary.criticalClusters} critical`
              : "Loading..."
          }
        />
        <SummaryCard
          title="Total Nodes"
          value={summary?.totalNodes ?? 0}
          icon={Cpu}
          detail="Across all clusters"
        />
        <SummaryCard
          title="Total Pods"
          value={summary?.totalPods ?? 0}
          icon={MemoryStick}
          detail="Running workloads"
        />
        <SummaryCard
          title="Monthly Cost"
          value={formatCurrency(summary?.totalMonthlyCost)}
          icon={DollarSign}
          detail="Estimated total"
        />
      </div>

      {/* Cluster grid */}
      <ClusterGrid />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  detail,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

Create `apps/web/src/app/(dashboard)/page.tsx` (redirect):

```tsx
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/clusters");
}
```

Create stub pages for other tabs:

`apps/web/src/app/(dashboard)/costs/page.tsx`:

```tsx
import { DollarSign } from "lucide-react";

export default function CostsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <DollarSign className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">FinOps</h1>
      <p className="text-muted-foreground mt-2">
        Cost optimization and allocation — coming in Phase 1.
      </p>
    </div>
  );
}
```

`apps/web/src/app/(dashboard)/security/page.tsx`:

```tsx
import { Shield } from "lucide-react";

export default function SecurityPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Shield className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Security</h1>
      <p className="text-muted-foreground mt-2">
        Runtime security and compliance — coming in Phase 1.
      </p>
    </div>
  );
}
```

`apps/web/src/app/(dashboard)/settings/page.tsx`:

```tsx
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Settings className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground mt-2">
        Configuration and preferences — coming soon.
      </p>
    </div>
  );
}
```

**Day 4 Checklist:**
- [ ] Sidebar navigation working between all 4 tabs
- [ ] Header with dark mode toggle and Clerk user menu
- [ ] Dark mode fully functional (toggle + persistence)
- [ ] Cluster overview page showing summary cards
- [ ] Cluster grid rendering cards for seeded clusters
- [ ] CPU/memory progress bars showing usage percentages
- [ ] Status badges (healthy/warning/critical) color-coded
- [ ] Clicking a cluster card navigates to detail page (stub)
- [ ] Loading skeletons while data fetches
- [ ] Empty state when no clusters exist

---

### Day 5: Data Pipeline Foundation (Friday)

**Goal:** Voyager Monitor can POST data to the API, data gets stored in TimescaleDB, cluster overview shows real data.

#### Step 1: Define ingestion payload types

Create `packages/types/src/monitor.ts`:

```ts
import { z } from "zod";

// Schema for data sent by Voyager Monitor agent
export const MonitorHeartbeatSchema = z.object({
  agentVersion: z.string(),
  clusterName: z.string(),
  timestamp: z.string().datetime(),
  nodes: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["Ready", "NotReady", "Unknown"]),
      role: z.string().optional(),
      instanceType: z.string().optional(),
      availabilityZone: z.string().optional(),
      kubeletVersion: z.string().optional(),
      resources: z.object({
        cpuCapacity: z.number(),
        cpuUsage: z.number(),
        memoryCapacity: z.number(),
        memoryUsage: z.number(),
        podCapacity: z.number(),
        podCount: z.number(),
      }),
    }),
  ),
  namespaces: z.array(
    z.object({
      name: z.string(),
      podCount: z.number(),
      workloads: z.array(
        z.object({
          name: z.string(),
          kind: z.string(),
          replicas: z.number(),
          readyReplicas: z.number(),
          restartCount: z.number(),
          images: z.array(z.string()),
          resources: z.object({
            cpuRequest: z.number().optional(),
            cpuLimit: z.number().optional(),
            cpuUsage: z.number().optional(),
            memoryRequest: z.number().optional(),
            memoryLimit: z.number().optional(),
            memoryUsage: z.number().optional(),
          }),
        }),
      ),
    }),
  ),
  metrics: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      unit: z.string().optional(),
      labels: z.record(z.string()).optional(),
      nodeId: z.string().optional(),
      namespace: z.string().optional(),
      workload: z.string().optional(),
    }),
  ).optional(),
  events: z.array(
    z.object({
      type: z.string(),
      reason: z.string(),
      message: z.string().optional(),
      involvedObject: z.string().optional(),
      involvedObjectKind: z.string().optional(),
      namespace: z.string().optional(),
      count: z.number().optional(),
      firstSeen: z.string().datetime().optional(),
      lastSeen: z.string().datetime().optional(),
    }),
  ).optional(),
});

export type MonitorHeartbeat = z.infer<typeof MonitorHeartbeatSchema>;
```

Create `packages/types/src/cluster.ts`:

```ts
export interface ClusterSummary {
  totalClusters: number;
  totalNodes: number;
  totalPods: number;
  totalMonthlyCost: number;
  healthyClusters: number;
  warningClusters: number;
  criticalClusters: number;
}

export interface ClusterInfo {
  id: string;
  name: string;
  displayName: string | null;
  provider: string;
  region: string | null;
  kubernetesVersion: string | null;
  status: string;
  nodeCount: number;
  podCount: number;
  cpuCapacity: number | null;
  cpuUsage: number | null;
  memoryCapacity: number | null;
  memoryUsage: number | null;
  monthlyCostEstimate: number | null;
  lastHeartbeat: Date | null;
  agentVersion: string | null;
}
```

Create `packages/types/src/metrics.ts`:

```ts
export interface MetricDataPoint {
  bucket: string;
  metricName: string;
  avgValue: number;
  maxValue: number;
  minValue: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
  interval: "5m" | "1h" | "6h" | "24h" | "7d";
}
```

Create `packages/types/src/events.ts`:

```ts
export interface KubernetesEvent {
  id: string;
  clusterId: string;
  namespace: string | null;
  involvedObject: string | null;
  involvedObjectKind: string | null;
  type: string;
  reason: string;
  message: string | null;
  count: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  createdAt: Date;
}
```

Create `packages/types/src/api.ts`:

```ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}
```

#### Step 2: Implement ingestion service

Create `apps/api/src/services/ingestion.service.ts`:

```ts
import { db, schema, eq, and, sql } from "@voyager/db";
import type { MonitorHeartbeat } from "@voyager/types";
import { logger } from "../lib/logger";

export class IngestionService {
  /**
   * Process a heartbeat from Voyager Monitor.
   * Updates cluster status, nodes, workloads, and stores metrics.
   */
  async processHeartbeat(
    clusterId: string,
    payload: MonitorHeartbeat,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Update cluster status
      await this.updateClusterFromHeartbeat(clusterId, payload);

      // 2. Upsert nodes
      await this.upsertNodes(clusterId, payload);

      // 3. Upsert workloads
      await this.upsertWorkloads(clusterId, payload);

      // 4. Store metrics
      if (payload.metrics?.length) {
        await this.storeMetrics(clusterId, payload);
      }

      // 5. Store events
      if (payload.events?.length) {
        await this.storeEvents(clusterId, payload);
      }

      const elapsed = Date.now() - startTime;
      logger.info(
        { clusterId, elapsed, nodes: payload.nodes.length },
        `Heartbeat processed in ${elapsed}ms`,
      );
    } catch (error) {
      logger.error({ clusterId, error }, "Failed to process heartbeat");
      throw error;
    }
  }

  private async updateClusterFromHeartbeat(
    clusterId: string,
    payload: MonitorHeartbeat,
  ) {
    const totalNodes = payload.nodes.length;
    const totalPods = payload.namespaces.reduce(
      (sum, ns) => sum + ns.podCount,
      0,
    );
    const totalNamespaces = payload.namespaces.length;

    const totalCpuCapacity = payload.nodes.reduce(
      (sum, n) => sum + n.resources.cpuCapacity,
      0,
    );
    const totalCpuUsage = payload.nodes.reduce(
      (sum, n) => sum + n.resources.cpuUsage,
      0,
    );
    const totalMemCapacity = payload.nodes.reduce(
      (sum, n) => sum + n.resources.memoryCapacity,
      0,
    );
    const totalMemUsage = payload.nodes.reduce(
      (sum, n) => sum + n.resources.memoryUsage,
      0,
    );

    // Determine cluster health status
    const unhealthyNodes = payload.nodes.filter(
      (n) => n.status !== "Ready",
    ).length;
    let status = "healthy";
    if (unhealthyNodes > totalNodes * 0.5) status = "critical";
    else if (unhealthyNodes > 0) status = "warning";

    await db
      .update(schema.clusters)
      .set({
        status,
        nodeCount: totalNodes,
        podCount: totalPods,
        namespaceCount: totalNamespaces,
        cpuCapacity: totalCpuCapacity,
        cpuUsage: totalCpuUsage,
        memoryCapacity: totalMemCapacity,
        memoryUsage: totalMemUsage,
        lastHeartbeat: new Date(),
        agentVersion: payload.agentVersion,
      })
      .where(eq(schema.clusters.id, clusterId));
  }

  private async upsertNodes(
    clusterId: string,
    payload: MonitorHeartbeat,
  ) {
    // Mark all existing nodes as inactive first
    await db
      .update(schema.nodes)
      .set({ isActive: false })
      .where(eq(schema.nodes.clusterId, clusterId));

    // Upsert each node
    for (const node of payload.nodes) {
      await db
        .insert(schema.nodes)
        .values({
          clusterId,
          name: node.name,
          status: node.status === "Ready" ? "ready" : "not-ready",
          role: node.role,
          instanceType: node.instanceType,
          availabilityZone: node.availabilityZone,
          kubeletVersion: node.kubeletVersion,
          cpuCapacity: node.resources.cpuCapacity,
          cpuUsage: node.resources.cpuUsage,
          memoryCapacity: node.resources.memoryCapacity,
          memoryUsage: node.resources.memoryUsage,
          podCapacity: node.resources.podCapacity,
          podCount: node.resources.podCount,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [schema.nodes.clusterId, schema.nodes.name],
          set: {
            status: node.status === "Ready" ? "ready" : "not-ready",
            cpuUsage: node.resources.cpuUsage,
            memoryUsage: node.resources.memoryUsage,
            podCount: node.resources.podCount,
            isActive: true,
          },
        });
    }
  }

  private async upsertWorkloads(
    clusterId: string,
    payload: MonitorHeartbeat,
  ) {
    for (const ns of payload.namespaces) {
      for (const wl of ns.workloads) {
        await db
          .insert(schema.workloads)
          .values({
            clusterId,
            namespace: ns.name,
            name: wl.name,
            kind: wl.kind,
            status:
              wl.readyReplicas === wl.replicas ? "running" : "degraded",
            replicas: wl.replicas,
            readyReplicas: wl.readyReplicas,
            cpuRequest: wl.resources.cpuRequest,
            cpuLimit: wl.resources.cpuLimit,
            cpuUsage: wl.resources.cpuUsage,
            memoryRequest: wl.resources.memoryRequest,
            memoryLimit: wl.resources.memoryLimit,
            memoryUsage: wl.resources.memoryUsage,
            images: wl.images,
            restartCount: wl.restartCount,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [
              schema.workloads.clusterId,
              schema.workloads.namespace,
              schema.workloads.name,
            ],
            set: {
              status:
                wl.readyReplicas === wl.replicas ? "running" : "degraded",
              readyReplicas: wl.readyReplicas,
              cpuUsage: wl.resources.cpuUsage,
              memoryUsage: wl.resources.memoryUsage,
              restartCount: wl.restartCount,
              isActive: true,
            },
          });
      }
    }
  }

  private async storeMetrics(
    clusterId: string,
    payload: MonitorHeartbeat,
  ) {
    if (!payload.metrics?.length) return;

    const now = new Date();
    const rows = payload.metrics.map((m) => ({
      time: now,
      clusterId,
      metricName: m.name,
      value: m.value,
      unit: m.unit ?? null,
      namespace: m.namespace ?? null,
      workloadName: m.workload ?? null,
      labels: m.labels ?? null,
    }));

    // Batch insert metrics
    await db.insert(schema.metrics).values(rows);
  }

  private async storeEvents(
    clusterId: string,
    payload: MonitorHeartbeat,
  ) {
    if (!payload.events?.length) return;

    const rows = payload.events.map((e) => ({
      clusterId,
      type: e.type,
      reason: e.reason,
      message: e.message ?? null,
      involvedObject: e.involvedObject ?? null,
      involvedObjectKind: e.involvedObjectKind ?? null,
      namespace: e.namespace ?? null,
      count: e.count ?? 1,
      firstSeen: e.firstSeen ? new Date(e.firstSeen) : null,
      lastSeen: e.lastSeen ? new Date(e.lastSeen) : null,
    }));

    await db.insert(schema.events).values(rows);
  }
}

export const ingestionService = new IngestionService();
```

#### Step 3: Implement ingestion route with API key auth

Update `apps/api/src/routes/ingest.ts`:

```ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { MonitorHeartbeatSchema } from "@voyager/types";
import { db, schema, eq, and } from "@voyager/db";
import { ingestionService } from "../services/ingestion.service";
import { logger } from "../lib/logger";

export async function ingestRoutes(server: FastifyInstance) {
  // Authenticate via API key
  server.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const apiKey = request.headers["x-api-key"] as string;

      if (!apiKey) {
        return reply.status(401).send({
          error: "Missing X-API-Key header",
        });
      }

      // For MVP: check against env var
      // For production: check against hashed keys in api_keys table
      const validKey = process.env.VOYAGER_AGENT_API_KEY;
      if (apiKey !== validKey) {
        return reply.status(403).send({
          error: "Invalid API key",
        });
      }
    },
  );

  // POST /api/v1/ingest — receives heartbeat from Voyager Monitor
  server.post("/ingest", async (request, reply) => {
    try {
      // Validate payload
      const parsed = MonitorHeartbeatSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid payload",
          details: parsed.error.flatten(),
        });
      }

      const payload = parsed.data;

      // Look up cluster by name
      const cluster = await db.query.clusters.findFirst({
        where: eq(schema.clusters.name, payload.clusterName),
      });

      if (!cluster) {
        return reply.status(404).send({
          error: `Cluster '${payload.clusterName}' not found. Register it first.`,
        });
      }

      // Process heartbeat asynchronously
      // For MVP: process inline. For production: push to BullMQ queue.
      await ingestionService.processHeartbeat(cluster.id, payload);

      return reply.status(202).send({
        status: "accepted",
        clusterId: cluster.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, "Ingestion failed");
      return reply.status(500).send({
        error: "Internal server error",
      });
    }
  });

  // GET /api/v1/ingest/status — check if ingestion is working
  server.get("/ingest/status", async () => {
    return {
      status: "ok",
      endpoint: "POST /api/v1/ingest",
      auth: "X-API-Key header required",
    };
  });
}
```

#### Step 4: WebSocket setup for real-time updates

Create `apps/api/src/ws/channels.ts`:

```ts
export const WS_CHANNELS = {
  CLUSTER_UPDATE: "cluster:update",
  CLUSTER_METRICS: "cluster:metrics",
  CLUSTER_EVENTS: "cluster:events",
  CLUSTER_LOGS: "cluster:logs",
} as const;

export type WSChannel = (typeof WS_CHANNELS)[keyof typeof WS_CHANNELS];

export interface WSMessage {
  channel: WSChannel;
  data: unknown;
  clusterId?: string;
  timestamp: string;
}
```

Create `apps/api/src/ws/handler.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { logger } from "../lib/logger";
import { WS_CHANNELS, type WSMessage } from "./channels";

// Track connected clients
const clients = new Set<WebSocket>();

export async function registerWebSocketHandler(server: FastifyInstance) {
  server.get("/ws", { websocket: true }, (socket, req) => {
    clients.add(socket);
    logger.info(`WebSocket client connected (total: ${clients.size})`);

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Handle subscription messages, etc.
        logger.debug({ msg }, "WebSocket message received");
      } catch {
        // Ignore invalid messages
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
      logger.info(`WebSocket client disconnected (total: ${clients.size})`);
    });

    // Send initial connection confirmation
    socket.send(
      JSON.stringify({
        channel: "system",
        data: { connected: true },
        timestamp: new Date().toISOString(),
      }),
    );
  });
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
export function broadcast(message: WSMessage) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) {
      // OPEN
      client.send(payload);
    }
  }
}

/**
 * Broadcast cluster update to all clients
 */
export function broadcastClusterUpdate(
  clusterId: string,
  data: unknown,
) {
  broadcast({
    channel: WS_CHANNELS.CLUSTER_UPDATE,
    clusterId,
    data,
    timestamp: new Date().toISOString(),
  });
}
```

Create `apps/web/src/hooks/use-websocket.ts`:

```ts
"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface WSMessage {
  channel: string;
  data: unknown;
  clusterId?: string;
  timestamp: string;
}

export function useWebSocket(url?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);

  const wsUrl =
    url ??
    process.env.NEXT_PUBLIC_WS_URL ??
    "ws://localhost:4000/ws";

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        console.log("[WS] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          setLastMessage(msg);
        } catch {
          // Ignore invalid messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect with exponential backoff
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000,
        );
        reconnectAttemptsRef.current++;
        console.log(`[WS] Disconnected. Reconnecting in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Connection failed, will retry via onclose
    }
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { isConnected, lastMessage, send };
}
```

#### Step 5: Test the full data flow

```bash
# 1. Start the dev stack
pnpm docker:up
pnpm dev

# 2. Send a test heartbeat (simulating Voyager Monitor)
curl -X POST http://localhost:4000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vgr_dev_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "agentVersion": "0.3.1",
    "clusterName": "prod-eks-us-east-1",
    "timestamp": "2026-02-07T20:00:00Z",
    "nodes": [
      {
        "name": "ip-10-0-1-100",
        "status": "Ready",
        "role": "worker",
        "instanceType": "m5.xlarge",
        "availabilityZone": "us-east-1a",
        "kubeletVersion": "v1.29.2",
        "resources": {
          "cpuCapacity": 4,
          "cpuUsage": 2.3,
          "memoryCapacity": 17179869184,
          "memoryUsage": 10737418240,
          "podCapacity": 110,
          "podCount": 24
        }
      }
    ],
    "namespaces": [
      {
        "name": "default",
        "podCount": 5,
        "workloads": [
          {
            "name": "nginx",
            "kind": "Deployment",
            "replicas": 3,
            "readyReplicas": 3,
            "restartCount": 0,
            "images": ["nginx:1.25"],
            "resources": {
              "cpuRequest": 0.1,
              "cpuUsage": 0.05,
              "memoryRequest": 134217728,
              "memoryUsage": 67108864
            }
          }
        ]
      }
    ],
    "metrics": [
      { "name": "cpu_usage", "value": 2.3, "unit": "cores" },
      { "name": "memory_usage", "value": 10737418240, "unit": "bytes" }
    ],
    "events": [
      {
        "type": "Normal",
        "reason": "Scheduled",
        "message": "Successfully assigned default/nginx-abc123 to ip-10-0-1-100",
        "involvedObject": "Pod/nginx-abc123",
        "involvedObjectKind": "Pod",
        "namespace": "default"
      }
    ]
  }'

# Should return: {"status":"accepted","clusterId":"...","timestamp":"..."}

# 3. Open http://localhost:3000/clusters
# The cluster card should now show updated data from the heartbeat
```

**Day 5 Checklist:**
- [ ] Ingestion endpoint accepts Voyager Monitor heartbeats
- [ ] API key authentication working on ingestion route
- [ ] Heartbeat updates cluster status in database
- [ ] Node data upserted correctly
- [ ] Workload data upserted correctly
- [ ] Metrics stored in TimescaleDB hypertable
- [ ] Events stored in events table
- [ ] WebSocket handler registered and clients can connect
- [ ] Cluster overview updates after ingestion (via page refresh or tRPC refetch)
- [ ] Full end-to-end flow: Monitor → API → DB → Dashboard

---

## 5. Key Code Examples

This section contains the complete, production-ready code for the critical pieces. These are referenced in the Day-by-Day guide above but collected here for easy reference.

### 5.1 tRPC Router Setup (`apps/api/src/trpc/index.ts`)

See Day 3, Step 1 — root router combining cluster, metrics, and health routers.

### 5.2 tRPC Client Setup (`apps/web/src/lib/trpc.ts`)

See Day 3, Step 3 — client with Clerk auth token integration.

### 5.3 Drizzle Schema for Clusters

See Day 2, Step 2 — `packages/db/src/schema/clusters.ts`.

### 5.4 First Migration

See Day 2, Step 4 — `packages/db/drizzle/0000_initial.sql`.

### 5.5 Layout Component

See Day 4, Steps 2-3 — sidebar + header components.

### 5.6 Cluster Overview Page

See Day 4, Step 3 — complete page with summary cards and cluster grid.

### 5.7 WebSocket Setup

See Day 5, Step 4 — server handler and client hook.

### 5.8 Auth Middleware

See Day 3, Step 1 — `apps/api/src/trpc/trpc.ts` (tRPC middleware) and Day 2, Step 1 — `apps/web/src/middleware.ts` (Clerk middleware).

---

## 6. Development Workflow

### 6.1 Git Branching Strategy

```
main (production)
 └── develop (integration)
      ├── feat/cluster-overview
      ├── feat/trpc-setup
      ├── fix/auth-redirect
      └── chore/ci-pipeline
```

**Rules:**
- `main` is always deployable. Protected branch — requires PR.
- `develop` is the integration branch. All feature branches merge here.
- Feature branches: `feat/<description>`
- Bug fixes: `fix/<description>`
- Chores: `chore/<description>`
- Hotfixes: `hotfix/<description>` (branch from `main`, merge to both `main` and `develop`)
- Delete branches after merge.

### 6.2 PR Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What

<!-- Brief description of changes -->

## Why

<!-- Why is this change needed? Link to issue if applicable -->

## How

<!-- Technical approach / implementation details -->

## Testing

<!-- How was this tested? -->
- [ ] Ran locally with `pnpm dev`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Manual testing of affected pages/endpoints

## Screenshots

<!-- If UI changes, include before/after screenshots -->

## Checklist

- [ ] Self-reviewed the diff
- [ ] Added/updated types in `packages/types` if needed
- [ ] Database migration included if schema changed
- [ ] No secrets or credentials in code
```

### 6.3 Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `chore` — Maintenance (deps, configs, CI)
- `docs` — Documentation
- `style` — Formatting (no logic change)
- `refactor` — Code restructuring (no feature/fix)
- `test` — Adding tests
- `perf` — Performance improvements

**Scope:** `web`, `api`, `db`, `ui`, `types`, `config`, `ci`

**Examples:**
```
feat(api): add cluster.list tRPC endpoint
fix(web): correct dark mode toggle persistence
chore(ci): add PostgreSQL service to test job
docs: add Week 1 implementation guide
feat(db): add initial migration with TimescaleDB hypertable
```

### 6.4 Local Development Commands

```bash
# ── Setup ──────────────────────────────────────
pnpm install                  # Install all dependencies
pnpm docker:up                # Start PostgreSQL, Redis, OpenSearch
cp .env.example .env          # Create env file (edit with your keys)

# ── Development ────────────────────────────────
pnpm dev                      # Start all apps in dev mode (turbo)
pnpm --filter @voyager/web dev    # Start only web
pnpm --filter @voyager/api dev    # Start only api

# ── Database ───────────────────────────────────
pnpm db:generate              # Generate migration from schema changes
pnpm db:migrate               # Run pending migrations
pnpm db:push                  # Push schema changes (no migration file)
pnpm db:seed                  # Seed development data
pnpm db:studio                # Open Drizzle Studio UI

# ── Quality ────────────────────────────────────
pnpm typecheck                # TypeScript check all packages
pnpm lint                     # Lint all packages
pnpm format                   # Format all files with Prettier
pnpm test                     # Run all tests

# ── Build ──────────────────────────────────────
pnpm build                    # Build all packages for production

# ── Docker ─────────────────────────────────────
pnpm docker:up                # Start dev infrastructure
pnpm docker:down              # Stop dev infrastructure
pnpm docker:reset             # Reset (destroy volumes + restart)

# ── Cleanup ────────────────────────────────────
pnpm clean                    # Remove all build artifacts + node_modules
```

### 6.5 Testing Strategy

#### Framework: Vitest (API) + Playwright (Web E2E eventually)

**Week 1 — Testing priorities (minimal but important):**

| What to Test | Framework | Why First |
|-------------|-----------|-----------|
| tRPC routers (cluster.list, cluster.getById) | Vitest | Core data flow |
| Ingestion service | Vitest | Critical path — data correctness |
| Env validation | Vitest | Catches config errors early |
| Database schema | Migration test | Ensures migration runs cleanly |

**Not testing in Week 1:** UI components (too early, still iterating), E2E flows (need stable UI first).

**Example test: `apps/api/src/trpc/routers/__tests__/cluster.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { db, schema, eq } from "@voyager/db";

describe("cluster router", () => {
  let testOrgId: string;

  beforeAll(async () => {
    // Create test org
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Test Org", slug: `test-${Date.now()}` })
      .returning();
    testOrgId = org.id;

    // Create test cluster
    await db.insert(schema.clusters).values({
      organizationId: testOrgId,
      name: "test-cluster",
      provider: "aws",
      status: "healthy",
      nodeCount: 3,
      podCount: 10,
    });
  });

  it("should list active clusters", async () => {
    const clusters = await db
      .select()
      .from(schema.clusters)
      .where(eq(schema.clusters.isActive, true));

    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0]).toHaveProperty("name");
    expect(clusters[0]).toHaveProperty("status");
  });
});
```

**Vitest config: `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**"],
    },
  },
});
```

### 6.6 Week 1 Definition of Done

By end of Friday, these must all be true:

**Infrastructure:**
- [ ] Monorepo builds cleanly (`pnpm build` — zero errors)
- [ ] CI pipeline passes on every push
- [ ] Docker dev stack boots in < 30 seconds
- [ ] All environment variables documented in `.env.example`

**Backend:**
- [ ] Fastify server starts and responds to `/health`
- [ ] tRPC router serves `cluster.list`, `cluster.getById`, `cluster.summary`
- [ ] Database has 7 tables with proper indexes
- [ ] TimescaleDB hypertable created for metrics
- [ ] Ingestion endpoint accepts and processes Voyager Monitor heartbeats
- [ ] WebSocket endpoint accepts connections

**Frontend:**
- [ ] Auth flow works (sign-up → sign-in → dashboard)
- [ ] Dashboard layout renders (sidebar + header + content)
- [ ] Sidebar navigation between 4 tabs
- [ ] Dark mode toggle works and persists
- [ ] Cluster overview shows summary cards with real data
- [ ] Cluster grid renders cards with status badges and resource bars
- [ ] Loading states and empty states handled

**Data Flow:**
- [ ] End-to-end: Voyager Monitor heartbeat → API → DB → Dashboard
- [ ] Cluster status updates reflected in UI after heartbeat
- [ ] Seed script creates realistic dev data

**Quality:**
- [ ] Zero TypeScript errors across all packages
- [ ] ESLint passes with zero warnings
- [ ] At least 2 test files exist and pass
- [ ] Git history is clean with conventional commits

---

## Appendix A: Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo tool | Turborepo + pnpm | Fast, simple, great DX; no need for Nx complexity |
| API framework | Fastify | Fastest Node.js framework; first-class TypeScript; plugin system |
| ORM | Drizzle | Type-safe, lightweight, SQL-like API; better than Prisma for complex queries |
| Time-series DB | TimescaleDB (PostgreSQL extension) | One database for everything; avoid operational overhead of separate TSDB |
| State management | TanStack Query + Zustand | TanStack for server state caching; Zustand for minimal client state |
| Component library | Shadcn/ui (copy-paste) | Full control, no library lock-in, excellent DX |
| Auth | Clerk | 5-minute integration, OAuth built-in, generous free tier |
| tRPC version | v11 | Latest stable, Fastify adapter, better error handling |

## Appendix B: Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Runtime environment |
| `PORT` | No | `4000` | API server port |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `CLERK_SECRET_KEY` | **Yes** | — | Clerk backend secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Yes** | — | Clerk frontend key |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:4000` | API URL for frontend |
| `NEXT_PUBLIC_WS_URL` | No | `ws://localhost:4000/ws` | WebSocket URL |
| `VOYAGER_AGENT_API_KEY` | No | — | API key for Voyager Monitor |
| `LOG_LEVEL` | No | `info` | Pino log level |

## Appendix C: Useful Links

- [Next.js 15 Docs](https://nextjs.org/docs)
- [Fastify Docs](https://fastify.dev/docs/latest/)
- [tRPC v11 Docs](https://trpc.io/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [TimescaleDB Docs](https://docs.timescale.com/)
- [Shadcn/ui](https://ui.shadcn.com/)
- [Clerk Docs](https://clerk.com/docs)
- [Turborepo Docs](https://turbo.build/repo/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)

---

*This guide is a living document. Update it as decisions change during implementation.*

*Last updated: February 4, 2026*