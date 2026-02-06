# Voyager Platform — API Specification

> **Version:** 1.0  
> **Date:** February 4, 2026  
> **Author:** Atlas — Senior Backend Architect  
> **Status:** Technical specification — ready for implementation  
> **Based on:** Product Strategy v1.0, Voyager Monitor existing architecture

---

## Table of Contents

1. [API Architecture Overview](#1-api-architecture-overview)
2. [Shared Types & Schemas](#2-shared-types--schemas)
3. [tRPC Router Structure (Internal API)](#3-trpc-router-structure-internal-api)
4. [WebSocket Events (Real-Time)](#4-websocket-events-real-time)
5. [REST API (Public v1)](#5-rest-api-public-v1)
6. [Data Ingestion API (gRPC)](#6-data-ingestion-api-grpc)
7. [Error Handling](#7-error-handling)
8. [Middleware Stack](#8-middleware-stack)
9. [Implementation Guide](#9-implementation-guide)

---

## 1. API Architecture Overview

### 1.1 Three-Layer API Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                   │
│                                                                         │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Next.js App │  │ External Tools   │  │  Voyager Monitor       │   │
│  │  (Dashboard) │  │ (CI/CD, Slack…)  │  │  (DaemonSet Agent)     │   │
│  └──────┬───────┘  └────────┬─────────┘  └───────────┬────────────┘   │
│         │                   │                         │                 │
│      tRPC/WS            REST v1                   gRPC                 │
│         │                   │                         │                 │
└─────────┼───────────────────┼─────────────────────────┼─────────────────┘
          │                   │                         │
┌─────────┼───────────────────┼─────────────────────────┼─────────────────┐
│         ▼                   ▼                         ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    MIDDLEWARE STACK                               │  │
│  │  Auth → Tenant → RateLimit → CORS → Logging → Validation        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  tRPC Router │  │   REST Router    │  │   gRPC Server          │   │
│  │  (Internal)  │  │   (Public v1)    │  │   (Ingestion)          │   │
│  └──────┬───────┘  └────────┬─────────┘  └───────────┬────────────┘   │
│         │                   │                         │                 │
│         └───────────────────┴─────────────────────────┘                 │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │  Service Layer  │                                  │
│                    │  (Business      │                                  │
│                    │   Logic)        │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│  ┌──────────────────────────┴──────────────────────────────────────┐   │
│  │                    DATA LAYER                                    │   │
│  │  PostgreSQL │ TimescaleDB │ OpenSearch │ Redis │ S3/MinIO        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                         BACKEND                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 API Protocol Rationale

| Protocol | Use Case | Why |
|----------|----------|-----|
| **tRPC** | Dashboard ↔ Backend | End-to-end type safety with Next.js; zero API docs overhead; auto-generated client |
| **WebSocket** | Real-time updates | Live logs, metrics streaming, alert notifications; bidirectional communication |
| **REST** | Public API v1 | Industry-standard for external integrations; OpenAPI spec for SDK generation |
| **gRPC** | Monitor → Backend | High-throughput binary protocol; streaming; built for telemetry ingestion at scale |

### 1.3 Authentication Summary

| API Layer | Auth Method | Token Type | Scope |
|-----------|-------------|------------|-------|
| tRPC | Session cookie + JWT | Short-lived access token (15m) + refresh token (7d) | User session |
| WebSocket | JWT in connection handshake | Same as tRPC | User session |
| REST v1 | API key in `X-API-Key` header | Long-lived, revocable | Per-key scopes |
| gRPC | mTLS + bearer token | Cluster-specific token | Per-cluster |

---

## 2. Shared Types & Schemas

### 2.1 Base Schemas (Zod)

These shared schemas are used across all API layers. They live in `packages/shared/src/schemas/`.

```typescript
// packages/shared/src/schemas/base.ts
import { z } from "zod";

// ─── Identifiers ───────────────────────────────────────────────────────────

export const IdSchema = z.string().uuid();
export const ClusterIdSchema = z.string().uuid();
export const TenantIdSchema = z.string().uuid();
export const SlugSchema = z.string().regex(/^[a-z0-9-]+$/).min(2).max(63);

// ─── Pagination ────────────────────────────────────────────────────────────

export const CursorPaginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  direction: z.enum(["forward", "backward"]).default("forward"),
});

export const CursorPaginationOutput = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    totalCount: z.number().int().optional(), // optional — expensive for large sets
  });

// ─── Time Range ────────────────────────────────────────────────────────────

export const TimeRangeInput = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  granularity: z.enum(["1m", "5m", "15m", "1h", "6h", "1d", "7d"]).optional(),
});

// ─── Sort & Filter ─────────────────────────────────────────────────────────

export const SortOrder = z.enum(["asc", "desc"]).default("desc");

export const SortInput = z.object({
  field: z.string(),
  order: SortOrder,
});

// ─── Common Resource Fields ────────────────────────────────────────────────

export const ResourceMetadata = z.object({
  id: IdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const K8sResourceMeta = z.object({
  name: z.string(),
  namespace: z.string().optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
  uid: z.string(),
  creationTimestamp: z.coerce.date(),
});

// ─── Health & Status ───────────────────────────────────────────────────────

export const HealthStatus = z.enum(["healthy", "warning", "critical", "unknown"]);

export const ResourceQuantity = z.object({
  cpu: z.number(),          // millicores
  memory: z.number(),       // bytes
  storage: z.number().optional(),  // bytes
  pods: z.number().optional(),
});

// ─── Cluster ───────────────────────────────────────────────────────────────

export const CloudProvider = z.enum(["aws", "azure", "gcp", "on-prem", "other"]);

export const ClusterSchema = z.object({
  ...ResourceMetadata.shape,
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  provider: CloudProvider,
  region: z.string(),
  kubernetesVersion: z.string(),
  status: HealthStatus,
  nodeCount: z.number().int(),
  podCount: z.number().int(),
  namespaceCount: z.number().int(),
  resourceUsage: ResourceQuantity,
  resourceCapacity: ResourceQuantity,
  lastHeartbeat: z.coerce.date(),
  monthlyCostEstimate: z.number().optional(),
  securityScore: z.number().min(0).max(100).optional(),
  tenantId: TenantIdSchema,
});

// ─── Node ──────────────────────────────────────────────────────────────────

export const NodeCondition = z.object({
  type: z.string(),
  status: z.enum(["True", "False", "Unknown"]),
  lastTransitionTime: z.coerce.date(),
  reason: z.string().optional(),
  message: z.string().optional(),
});

export const NodeSchema = z.object({
  ...K8sResourceMeta.shape,
  clusterId: ClusterIdSchema,
  status: HealthStatus,
  roles: z.array(z.string()),
  instanceType: z.string().optional(),
  osImage: z.string(),
  kubeletVersion: z.string(),
  containerRuntime: z.string(),
  allocatable: ResourceQuantity,
  capacity: ResourceQuantity,
  usage: ResourceQuantity,
  conditions: z.array(NodeCondition),
  podCount: z.number().int(),
  unschedulable: z.boolean(),
});

// ─── Namespace ─────────────────────────────────────────────────────────────

export const NamespaceSchema = z.object({
  ...K8sResourceMeta.shape,
  clusterId: ClusterIdSchema,
  status: z.enum(["Active", "Terminating"]),
  podCount: z.number().int(),
  workloadCount: z.number().int(),
  resourceUsage: ResourceQuantity,
  resourceLimits: ResourceQuantity.optional(),
  costPerDay: z.number().optional(),
});

// ─── Workload ──────────────────────────────────────────────────────────────

export const WorkloadKind = z.enum(["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"]);

export const WorkloadSchema = z.object({
  ...K8sResourceMeta.shape,
  clusterId: ClusterIdSchema,
  kind: WorkloadKind,
  replicas: z.object({
    desired: z.number().int(),
    ready: z.number().int(),
    available: z.number().int(),
    unavailable: z.number().int().default(0),
  }),
  images: z.array(z.string()),
  strategy: z.string().optional(),
  resourceUsage: ResourceQuantity,
  resourceRequests: ResourceQuantity,
  resourceLimits: ResourceQuantity,
  restartCount: z.number().int(),
  status: HealthStatus,
  costPerDay: z.number().optional(),
  vulnerabilityCount: z.object({
    critical: z.number().int(),
    high: z.number().int(),
    medium: z.number().int(),
    low: z.number().int(),
  }).optional(),
});

// ─── Pod ───────────────────────────────────────────────────────────────────

export const PodPhase = z.enum(["Pending", "Running", "Succeeded", "Failed", "Unknown"]);

export const ContainerState = z.object({
  state: z.enum(["waiting", "running", "terminated"]),
  reason: z.string().optional(),
  message: z.string().optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
  exitCode: z.number().int().optional(),
  restartCount: z.number().int(),
});

export const ContainerSchema = z.object({
  name: z.string(),
  image: z.string(),
  imageId: z.string().optional(),
  state: ContainerState,
  resources: z.object({
    requests: ResourceQuantity.optional(),
    limits: ResourceQuantity.optional(),
    usage: ResourceQuantity,
  }),
  ports: z.array(z.object({
    name: z.string().optional(),
    containerPort: z.number().int(),
    protocol: z.string(),
  })).optional(),
});

export const PodSchema = z.object({
  ...K8sResourceMeta.shape,
  clusterId: ClusterIdSchema,
  nodeName: z.string(),
  phase: PodPhase,
  status: HealthStatus,
  ip: z.string().optional(),
  containers: z.array(ContainerSchema),
  ownerKind: WorkloadKind.optional(),
  ownerName: z.string().optional(),
  qosClass: z.enum(["Guaranteed", "Burstable", "BestEffort"]),
  restartCount: z.number().int(),
  startTime: z.coerce.date().optional(),
  conditions: z.array(z.object({
    type: z.string(),
    status: z.enum(["True", "False", "Unknown"]),
    lastTransitionTime: z.coerce.date(),
    reason: z.string().optional(),
  })),
});

// ─── K8s Event ─────────────────────────────────────────────────────────────

export const K8sEventSchema = z.object({
  id: IdSchema,
  clusterId: ClusterIdSchema,
  namespace: z.string(),
  involvedObject: z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string().optional(),
    uid: z.string(),
  }),
  reason: z.string(),
  message: z.string(),
  type: z.enum(["Normal", "Warning"]),
  count: z.number().int(),
  firstTimestamp: z.coerce.date(),
  lastTimestamp: z.coerce.date(),
  source: z.object({
    component: z.string(),
    host: z.string().optional(),
  }),
});

// ─── Cost ──────────────────────────────────────────────────────────────────

export const CostBreakdown = z.object({
  cpu: z.number(),
  memory: z.number(),
  storage: z.number(),
  network: z.number(),
  total: z.number(),
});

export const CostAllocation = z.object({
  name: z.string(),
  kind: z.enum(["cluster", "namespace", "workload", "node", "team", "label"]),
  cost: CostBreakdown,
  efficiency: z.number().min(0).max(100), // percentage of allocated resources actually used
  trend: z.number(), // percentage change from previous period
});

export const WasteItem = z.object({
  id: IdSchema,
  clusterId: ClusterIdSchema,
  namespace: z.string(),
  workloadName: z.string(),
  workloadKind: WorkloadKind,
  wasteType: z.enum([
    "idle",             // < 5% CPU for 24h+
    "oversized",        // requests > 3x actual usage
    "abandoned",        // no traffic for 7d+
    "orphaned_pvc",     // PVC not mounted
    "orphaned_service", // Service with no endpoints
  ]),
  currentCostPerDay: z.number(),
  potentialSavingsPerDay: z.number(),
  recommendation: z.string(),
  detectedAt: z.coerce.date(),
  severity: z.enum(["low", "medium", "high"]),
});

// ─── Security ──────────────────────────────────────────────────────────────

export const VulnerabilitySeverity = z.enum(["critical", "high", "medium", "low", "negligible"]);

export const VulnerabilitySchema = z.object({
  id: IdSchema,
  cveId: z.string(),
  severity: VulnerabilitySeverity,
  title: z.string(),
  description: z.string(),
  packageName: z.string(),
  installedVersion: z.string(),
  fixedVersion: z.string().nullable(),
  image: z.string(),
  clusterId: ClusterIdSchema,
  namespaces: z.array(z.string()),
  workloads: z.array(z.string()),
  inUse: z.boolean(), // whether the vulnerable package is actually loaded at runtime
  cvssScore: z.number().min(0).max(10).optional(),
  publishedAt: z.coerce.date().optional(),
  firstDetected: z.coerce.date(),
  lastSeen: z.coerce.date(),
});

export const RuntimeAlertSchema = z.object({
  id: IdSchema,
  clusterId: ClusterIdSchema,
  namespace: z.string(),
  podName: z.string(),
  containerName: z.string(),
  alertType: z.enum([
    "shell_spawn",
    "privilege_escalation",
    "suspicious_process",
    "file_integrity",
    "network_anomaly",
    "crypto_mining",
    "reverse_shell",
  ]),
  severity: VulnerabilitySeverity,
  description: z.string(),
  process: z.string().optional(),
  filePath: z.string().optional(),
  timestamp: z.coerce.date(),
  acknowledged: z.boolean(),
});

export const SecurityPosture = z.object({
  clusterId: ClusterIdSchema,
  overallScore: z.number().min(0).max(100),
  categories: z.array(z.object({
    name: z.string(), // e.g., "CIS Benchmark", "Network Policies", "RBAC", "Image Security"
    score: z.number().min(0).max(100),
    passedChecks: z.number().int(),
    totalChecks: z.number().int(),
    criticalFindings: z.number().int(),
  })),
  lastScanAt: z.coerce.date(),
});

// ─── Alert ─────────────────────────────────────────────────────────────────

export const AlertSeverity = z.enum(["critical", "high", "medium", "low", "info"]);
export const AlertStatus = z.enum(["firing", "acknowledged", "resolved", "silenced"]);
export const AlertDomain = z.enum(["ops", "cost", "security"]);

export const AlertSchema = z.object({
  id: IdSchema,
  tenantId: TenantIdSchema,
  clusterId: ClusterIdSchema,
  namespace: z.string().optional(),
  title: z.string(),
  description: z.string(),
  severity: AlertSeverity,
  status: AlertStatus,
  domain: AlertDomain,
  source: z.string(), // e.g., "cpu_threshold", "pod_crashloop", "cve_critical", "cost_spike"
  labels: z.record(z.string()),
  fingerprint: z.string(), // for deduplication
  firedAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable(),
  acknowledgedAt: z.coerce.date().nullable(),
  acknowledgedBy: IdSchema.nullable(),
  silencedUntil: z.coerce.date().nullable(),
  relatedResources: z.array(z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string().optional(),
  })),
});

export const AlertRuleSchema = z.object({
  id: IdSchema,
  tenantId: TenantIdSchema,
  name: z.string(),
  description: z.string().optional(),
  domain: AlertDomain,
  enabled: z.boolean(),
  condition: z.object({
    metric: z.string(),
    operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
    threshold: z.number(),
    duration: z.string(), // e.g., "5m", "15m", "1h"
    scope: z.object({
      clusters: z.array(ClusterIdSchema).optional(),
      namespaces: z.array(z.string()).optional(),
      workloads: z.array(z.string()).optional(),
    }).optional(),
  }),
  notifications: z.array(z.object({
    channel: z.enum(["slack", "pagerduty", "email", "webhook"]),
    target: z.string(), // channel URL, email address, webhook URL
    templateId: z.string().optional(),
  })),
  cooldown: z.string().default("5m"), // minimum time between repeated alerts
  createdBy: IdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ─── User & Auth ───────────────────────────────────────────────────────────

export const UserRole = z.enum(["owner", "admin", "member", "viewer"]);

export const UserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().url().optional(),
  role: UserRole,
  tenantId: TenantIdSchema,
  teamIds: z.array(IdSchema),
  lastLoginAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
});

export const TeamSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slug: SlugSchema,
  tenantId: TenantIdSchema,
  memberCount: z.number().int(),
  clusterPermissions: z.array(z.object({
    clusterId: ClusterIdSchema,
    namespaces: z.array(z.string()).optional(), // null = all namespaces
    role: UserRole,
  })),
  createdAt: z.coerce.date(),
});

// ─── AI ────────────────────────────────────────────────────────────────────

export const AIQuerySchema = z.object({
  query: z.string().min(1).max(2000),
  context: z.object({
    clusterId: ClusterIdSchema.optional(),
    namespace: z.string().optional(),
    workload: z.string().optional(),
    timeRange: TimeRangeInput.optional(),
  }).optional(),
  sessionId: z.string().optional(), // for multi-turn conversations
});

export const AIResponseSchema = z.object({
  sessionId: z.string(),
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.object({
    type: z.enum(["metric", "log", "event", "cost", "security", "config"]),
    reference: z.string(),
    snippet: z.string().optional(),
  })),
  suggestedActions: z.array(z.object({
    action: z.string(),
    description: z.string(),
    risk: z.enum(["none", "low", "medium", "high"]),
    estimatedImpact: z.string().optional(),
  })).optional(),
  followUpQuestions: z.array(z.string()).optional(),
});
```

### 2.2 API Context Type

```typescript
// packages/backend/src/trpc/context.ts
import { inferAsyncReturnType } from "@trpc/server";
import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

export interface TRPCContext {
  user: {
    id: string;
    email: string;
    name: string;
    role: "owner" | "admin" | "member" | "viewer";
    tenantId: string;
    teamIds: string[];
  } | null;
  tenantId: string | null;
  requestId: string;
  ip: string;
  userAgent: string;
}

export async function createContext(
  opts: CreateFastifyContextOptions
): Promise<TRPCContext> {
  const { req } = opts;
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = token ? await verifyToken(token) : null;
  
  return {
    user,
    tenantId: user?.tenantId ?? null,
    requestId: req.id as string,
    ip: req.ip,
    userAgent: req.headers["user-agent"] ?? "",
  };
}
```

---

## 3. tRPC Router Structure (Internal API)

### 3.1 Router Organization

```
src/trpc/routers/
├── index.ts           # Root appRouter — merges all sub-routers
├── cluster.ts         # Cluster & node management
├── namespace.ts       # Namespace browsing
├── workload.ts        # Deployments, StatefulSets, DaemonSets
├── pod.ts             # Pod detail, logs (streaming), events
├── cost.ts            # FinOps: cost overview, trends, waste
├── security.ts        # SecurityOps: vulns, runtime alerts, posture
├── alert.ts           # Unified alerting
├── ai.ts              # AI query, investigate, suggest
├── auth.ts            # Authentication
└── admin.ts           # Admin: users, teams, settings
```

### 3.2 Root Router

```typescript
// src/trpc/routers/index.ts
import { router } from "../trpc";
import { clusterRouter } from "./cluster";
import { namespaceRouter } from "./namespace";
import { workloadRouter } from "./workload";
import { podRouter } from "./pod";
import { costRouter } from "./cost";
import { securityRouter } from "./security";
import { alertRouter } from "./alert";
import { aiRouter } from "./ai";
import { authRouter } from "./auth";
import { adminRouter } from "./admin";

export const appRouter = router({
  cluster: clusterRouter,
  namespace: namespaceRouter,
  workload: workloadRouter,
  pod: podRouter,
  cost: costRouter,
  security: securityRouter,
  alert: alertRouter,
  ai: aiRouter,
  auth: authRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
```

### 3.3 tRPC Base Setup

```typescript
// src/trpc/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { TRPCContext } from "./context";
import { RateLimiter } from "../lib/rate-limiter";

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        voyagerCode: error.cause instanceof VoyagerError ? error.cause.code : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// ─── Auth Middleware ───────────────────────────────────────────────────────

const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.tenantId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,         // now non-null
      tenantId: ctx.tenantId, // now non-null
    },
  });
});

const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user || !["owner", "admin"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

const isOwner = middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next({ ctx });
});

// ─── Rate Limiting Middleware ──────────────────────────────────────────────

function rateLimit(config: { windowMs: number; max: number; key?: string }) {
  const limiter = new RateLimiter(config);
  return middleware(async ({ ctx, next }) => {
    const key = config.key ?? ctx.user?.id ?? ctx.ip;
    const result = await limiter.check(key);
    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Retry after ${result.retryAfterMs}ms`,
      });
    }
    return next({ ctx });
  });
}

// ─── Procedure Builders ───────────────────────────────────────────────────

export const protectedProcedure = publicProcedure.use(isAuthenticated);
export const adminProcedure = protectedProcedure.use(isAdmin);
export const ownerProcedure = protectedProcedure.use(isOwner);

// Rate-limited variants
export const rateLimitedProcedure = (config: { windowMs: number; max: number }) =>
  protectedProcedure.use(rateLimit(config));
```

---

### 3.4 Cluster Router

```typescript
// src/trpc/routers/cluster.ts
import { z } from "zod";
import { router, protectedProcedure, adminProcedure, rateLimitedProcedure } from "../trpc";
import {
  ClusterIdSchema, ClusterSchema, NodeSchema,
  CursorPaginationInput, HealthStatus, CloudProvider, SlugSchema,
} from "@voyager/shared/schemas";

export const clusterRouter = router({

  // ─── cluster.list ──────────────────────────────────────────────────────
  // Lists all clusters the user has access to.
  // Auth: authenticated user (filtered by tenant + team permissions)
  // Rate limit: 60 req/min
  // Cache: 30s TTL, invalidated on cluster.register/delete
  list: protectedProcedure
    .input(z.object({
      status: HealthStatus.optional(),
      provider: CloudProvider.optional(),
      search: z.string().max(100).optional(),
      sort: z.object({
        field: z.enum(["name", "nodeCount", "podCount", "status", "monthlyCost", "lastHeartbeat"]),
        order: z.enum(["asc", "desc"]).default("asc"),
      }).optional(),
    }).optional())
    .output(z.object({
      clusters: z.array(ClusterSchema),
      summary: z.object({
        total: z.number().int(),
        healthy: z.number().int(),
        warning: z.number().int(),
        critical: z.number().int(),
        totalNodes: z.number().int(),
        totalPods: z.number().int(),
        totalMonthlyCost: z.number(),
      }),
    }))
    .query(async ({ ctx, input }) => {
      return clusterService.listClusters(ctx.tenantId, ctx.user, input);
    }),

  // ─── cluster.get ───────────────────────────────────────────────────────
  // Gets detailed info for a single cluster.
  // Auth: authenticated user with cluster access
  // Rate limit: 120 req/min
  // Cache: 15s TTL per cluster
  get: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
    }))
    .output(z.object({
      cluster: ClusterSchema.extend({
        connectionStatus: z.enum(["connected", "disconnected", "degraded"]),
        agentVersion: z.string(),
        apiServerUrl: z.string().optional(),
        features: z.object({
          metricsEnabled: z.boolean(),
          logsEnabled: z.boolean(),
          securityEnabled: z.boolean(),
          costEnabled: z.boolean(),
        }),
        topNamespaces: z.array(z.object({
          name: z.string(),
          podCount: z.number().int(),
          cpuUsage: z.number(),
          memoryUsage: z.number(),
          costPerDay: z.number(),
        })).max(10),
        recentEvents: z.array(z.object({
          type: z.enum(["Normal", "Warning"]),
          reason: z.string(),
          message: z.string(),
          timestamp: z.coerce.date(),
          count: z.number().int(),
        })).max(20),
      }),
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return clusterService.getCluster(ctx.tenantId, input.clusterId);
    }),

  // ─── cluster.register ─────────────────────────────────────────────────
  // Registers a new cluster. Returns a cluster token for Voyager Monitor.
  // Auth: admin role
  // Rate limit: 10 req/hour
  // No cache
  register: adminProcedure
    .use(rateLimit({ windowMs: 3600_000, max: 10 }))
    .input(z.object({
      name: z.string().min(1).max(255),
      slug: SlugSchema,
      provider: CloudProvider,
      region: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      labels: z.record(z.string()).optional(),
    }))
    .output(z.object({
      cluster: ClusterSchema,
      token: z.string(),     // bearer token for Voyager Monitor → Backend auth
      helmValues: z.string(), // YAML snippet for Helm chart values
      installCommand: z.string(), // helm install command
    }))
    .mutation(async ({ ctx, input }) => {
      return clusterService.registerCluster(ctx.tenantId, ctx.user.id, input);
    }),

  // ─── cluster.delete ────────────────────────────────────────────────────
  // Deletes a cluster registration. Does NOT affect the actual cluster.
  // Auth: owner role
  // Rate limit: 5 req/hour
  // Invalidates all cluster caches
  delete: ownerProcedure
    .use(rateLimit({ windowMs: 3600_000, max: 5 }))
    .input(z.object({
      clusterId: ClusterIdSchema,
      confirmName: z.string(), // must match cluster name for safety
    }))
    .output(z.object({
      success: z.boolean(),
      deletedAt: z.coerce.date(),
      dataRetentionDays: z.number().int(), // how long data is kept post-deletion
    }))
    .mutation(async ({ ctx, input }) => {
      return clusterService.deleteCluster(ctx.tenantId, input.clusterId, input.confirmName);
    }),

  // ─── cluster.nodes sub-router ──────────────────────────────────────────
  nodes: router({

    // ─── cluster.nodes.list ────────────────────────────────────────────
    // Lists all nodes in a cluster.
    // Auth: authenticated user with cluster access
    // Rate limit: 60 req/min
    // Cache: 30s TTL
    list: protectedProcedure
      .input(z.object({
        clusterId: ClusterIdSchema,
        status: HealthStatus.optional(),
        role: z.string().optional(), // "master", "worker"
        sort: z.object({
          field: z.enum(["name", "status", "cpuUsage", "memoryUsage", "podCount", "age"]),
          order: z.enum(["asc", "desc"]).default("asc"),
        }).optional(),
        ...CursorPaginationInput.shape,
      }))
      .output(z.object({
        items: z.array(NodeSchema),
        nextCursor: z.string().nullable(),
        summary: z.object({
          total: z.number().int(),
          ready: z.number().int(),
          notReady: z.number().int(),
          totalCpuCapacity: z.number(),
          totalCpuUsage: z.number(),
          totalMemoryCapacity: z.number(),
          totalMemoryUsage: z.number(),
        }),
      }))
      .query(async ({ ctx, input }) => {
        await assertClusterAccess(ctx.user, input.clusterId);
        return clusterService.listNodes(ctx.tenantId, input);
      }),

    // ─── cluster.nodes.get ─────────────────────────────────────────────
    // Gets detailed info for a single node.
    // Auth: authenticated user with cluster access
    // Rate limit: 120 req/min
    // Cache: 15s TTL
    get: protectedProcedure
      .input(z.object({
        clusterId: ClusterIdSchema,
        nodeName: z.string(),
      }))
      .output(z.object({
        node: NodeSchema.extend({
          pods: z.array(z.object({
            name: z.string(),
            namespace: z.string(),
            phase: z.string(),
            cpuUsage: z.number(),
            memoryUsage: z.number(),
            restartCount: z.number().int(),
          })),
          metrics: z.object({
            cpuHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
            memoryHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
            networkRxHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
            networkTxHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          }),
          events: z.array(z.object({
            type: z.string(),
            reason: z.string(),
            message: z.string(),
            timestamp: z.coerce.date(),
          })),
        }),
      }))
      .query(async ({ ctx, input }) => {
        await assertClusterAccess(ctx.user, input.clusterId);
        return clusterService.getNode(ctx.tenantId, input);
      }),
  }),
});
```

### 3.5 Namespace Router

```typescript
// src/trpc/routers/namespace.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { ClusterIdSchema, NamespaceSchema, CursorPaginationInput } from "@voyager/shared/schemas";

export const namespaceRouter = router({

  // ─── namespace.list ────────────────────────────────────────────────────
  // Lists namespaces in a cluster.
  // Auth: authenticated, scoped to user's accessible namespaces
  // Rate limit: 60 req/min
  // Cache: 30s TTL, invalidated on namespace creation/deletion events
  list: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      search: z.string().max(100).optional(),
      includeSystem: z.boolean().default(false), // kube-system, kube-public, etc.
      sort: z.object({
        field: z.enum(["name", "podCount", "cpuUsage", "memoryUsage", "costPerDay", "status"]),
        order: z.enum(["asc", "desc"]).default("asc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(NamespaceSchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return namespaceService.listNamespaces(ctx.tenantId, input);
    }),

  // ─── namespace.get ─────────────────────────────────────────────────────
  // Gets detailed namespace info with resource breakdown.
  // Auth: authenticated, namespace-level access check
  // Rate limit: 120 req/min
  // Cache: 15s TTL
  get: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string().min(1).max(253),
    }))
    .output(z.object({
      namespace: NamespaceSchema.extend({
        workloads: z.object({
          deployments: z.number().int(),
          statefulSets: z.number().int(),
          daemonSets: z.number().int(),
          jobs: z.number().int(),
          cronJobs: z.number().int(),
        }),
        resourceQuota: z.object({
          cpuRequests: z.object({ used: z.number(), hard: z.number() }).optional(),
          cpuLimits: z.object({ used: z.number(), hard: z.number() }).optional(),
          memoryRequests: z.object({ used: z.number(), hard: z.number() }).optional(),
          memoryLimits: z.object({ used: z.number(), hard: z.number() }).optional(),
          podCount: z.object({ used: z.number().int(), hard: z.number().int() }).optional(),
        }).optional(),
        limitRanges: z.array(z.object({
          type: z.string(),
          resource: z.string(),
          defaultValue: z.number().optional(),
          defaultRequest: z.number().optional(),
          max: z.number().optional(),
          min: z.number().optional(),
        })).optional(),
        costBreakdown: CostBreakdown.optional(),
        securitySummary: z.object({
          vulnerabilities: z.object({ critical: z.number(), high: z.number(), medium: z.number(), low: z.number() }),
          runtimeAlerts: z.number().int(),
        }).optional(),
        topWorkloads: z.array(z.object({
          name: z.string(),
          kind: WorkloadKind,
          cpuUsage: z.number(),
          memoryUsage: z.number(),
          status: HealthStatus,
          podCount: z.number().int(),
        })).max(10),
      }),
    }))
    .query(async ({ ctx, input }) => {
      await assertNamespaceAccess(ctx.user, input.clusterId, input.namespace);
      return namespaceService.getNamespace(ctx.tenantId, input);
    }),
});
```

### 3.6 Workload Router

```typescript
// src/trpc/routers/workload.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  ClusterIdSchema, WorkloadSchema, WorkloadKind,
  CursorPaginationInput, HealthStatus, TimeRangeInput,
} from "@voyager/shared/schemas";

export const workloadRouter = router({

  // ─── workload.list ─────────────────────────────────────────────────────
  // Lists workloads across a cluster, optionally filtered by namespace/kind.
  // Auth: authenticated, filtered by namespace-level access
  // Rate limit: 60 req/min
  // Cache: 15s TTL
  list: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string().optional(), // null = all accessible namespaces
      kind: WorkloadKind.optional(),
      status: HealthStatus.optional(),
      search: z.string().max(100).optional(),
      sort: z.object({
        field: z.enum([
          "name", "kind", "namespace", "status", "replicas",
          "cpuUsage", "memoryUsage", "restartCount", "costPerDay", "age",
        ]),
        order: z.enum(["asc", "desc"]).default("asc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(WorkloadSchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
      summary: z.object({
        total: z.number().int(),
        healthy: z.number().int(),
        warning: z.number().int(),
        critical: z.number().int(),
        byKind: z.record(WorkloadKind, z.number().int()),
      }),
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return workloadService.listWorkloads(ctx.tenantId, ctx.user, input);
    }),

  // ─── workload.get ──────────────────────────────────────────────────────
  // Gets detailed workload info including pods, metrics history, events.
  // Auth: authenticated, namespace-level access check
  // Rate limit: 120 req/min
  // Cache: 10s TTL
  get: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string(),
      name: z.string(),
      kind: WorkloadKind,
      metricsRange: TimeRangeInput.optional(),
    }))
    .output(z.object({
      workload: WorkloadSchema.extend({
        pods: z.array(z.object({
          name: z.string(),
          nodeName: z.string(),
          phase: z.string(),
          status: HealthStatus,
          cpuUsage: z.number(),
          memoryUsage: z.number(),
          restartCount: z.number().int(),
          age: z.string(),
        })),
        metrics: z.object({
          cpuHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          memoryHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          replicaHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          restartHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
        }),
        events: z.array(K8sEventSchema).max(50),
        spec: z.object({
          selector: z.record(z.string()),
          template: z.object({
            containers: z.array(z.object({
              name: z.string(),
              image: z.string(),
              ports: z.array(z.object({ containerPort: z.number(), protocol: z.string() })).optional(),
              env: z.array(z.object({ name: z.string(), valueFrom: z.string().optional() })).optional(),
              resources: z.object({
                requests: ResourceQuantity.optional(),
                limits: ResourceQuantity.optional(),
              }),
            })),
          }),
          strategy: z.string().optional(),
          minReadySeconds: z.number().int().optional(),
          revisionHistoryLimit: z.number().int().optional(),
        }),
        conditions: z.array(z.object({
          type: z.string(),
          status: z.string(),
          reason: z.string().optional(),
          message: z.string().optional(),
          lastTransitionTime: z.coerce.date(),
        })),
        costBreakdown: CostBreakdown.optional(),
        vulnerabilities: z.array(z.object({
          cveId: z.string(),
          severity: VulnerabilitySeverity,
          packageName: z.string(),
          fixedVersion: z.string().nullable(),
          inUse: z.boolean(),
        })).optional(),
      }),
    }))
    .query(async ({ ctx, input }) => {
      await assertNamespaceAccess(ctx.user, input.clusterId, input.namespace);
      return workloadService.getWorkload(ctx.tenantId, input);
    }),
});
```

### 3.7 Pod Router

```typescript
// src/trpc/routers/pod.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  ClusterIdSchema, PodSchema, K8sEventSchema,
  CursorPaginationInput, TimeRangeInput, HealthStatus,
} from "@voyager/shared/schemas";

export const podRouter = router({

  // ─── pod.list ──────────────────────────────────────────────────────────
  // Lists pods, optionally scoped to namespace/node/workload.
  // Auth: authenticated, filtered by namespace access
  // Rate limit: 60 req/min
  // Cache: 10s TTL (pods change frequently)
  list: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string().optional(),
      nodeName: z.string().optional(),
      ownerName: z.string().optional(),
      ownerKind: z.string().optional(),
      phase: z.array(z.string()).optional(),
      status: HealthStatus.optional(),
      search: z.string().max(100).optional(),
      sort: z.object({
        field: z.enum([
          "name", "namespace", "nodeName", "phase", "status",
          "cpuUsage", "memoryUsage", "restartCount", "age",
        ]),
        order: z.enum(["asc", "desc"]).default("asc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(PodSchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return podService.listPods(ctx.tenantId, ctx.user, input);
    }),

  // ─── pod.get ───────────────────────────────────────────────────────────
  // Gets detailed pod info with containers, metrics, events.
  // Auth: authenticated, namespace-level access
  // Rate limit: 120 req/min
  // Cache: 5s TTL
  get: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string(),
      podName: z.string(),
      metricsRange: TimeRangeInput.optional(),
    }))
    .output(z.object({
      pod: PodSchema.extend({
        metrics: z.object({
          cpuHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          memoryHistory: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          networkRx: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
          networkTx: z.array(z.object({ timestamp: z.coerce.date(), value: z.number() })),
        }),
        events: z.array(K8sEventSchema),
        previousContainerLogs: z.boolean(), // whether previous container logs are available
      }),
    }))
    .query(async ({ ctx, input }) => {
      await assertNamespaceAccess(ctx.user, input.clusterId, input.namespace);
      return podService.getPod(ctx.tenantId, input);
    }),

  // ─── pod.logs (subscription — streaming) ───────────────────────────────
  // Streams container logs in real-time via tRPC subscription.
  // Auth: authenticated, namespace-level access
  // Rate limit: 10 concurrent streams per user
  // Cache: none (real-time stream)
  logs: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string(),
      podName: z.string(),
      containerName: z.string(),
      follow: z.boolean().default(true),
      tailLines: z.number().int().min(1).max(10000).default(100),
      sinceSeconds: z.number().int().optional(),
      timestamps: z.boolean().default(true),
      filter: z.string().max(200).optional(), // grep-like filter
      previous: z.boolean().default(false),   // logs from previous container instance
    }))
    .subscription(async function* ({ ctx, input }) {
      await assertNamespaceAccess(ctx.user, input.clusterId, input.namespace);
      await assertStreamLimit(ctx.user.id, 10);

      const stream = await podService.streamLogs(ctx.tenantId, input);

      try {
        for await (const chunk of stream) {
          yield {
            timestamp: chunk.timestamp,
            line: chunk.line,
            stream: chunk.stream as "stdout" | "stderr",
          };
        }
      } finally {
        await releaseStreamSlot(ctx.user.id);
      }
    }),

  // ─── pod.events ────────────────────────────────────────────────────────
  // Lists K8s events related to a pod.
  // Auth: authenticated, namespace-level access
  // Rate limit: 60 req/min
  // Cache: 15s TTL
  events: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string(),
      podName: z.string(),
      type: z.enum(["Normal", "Warning"]).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(K8sEventSchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
    }))
    .query(async ({ ctx, input }) => {
      await assertNamespaceAccess(ctx.user, input.clusterId, input.namespace);
      return podService.getPodEvents(ctx.tenantId, input);
    }),
});
```

### 3.8 Cost Router

```typescript
// src/trpc/routers/cost.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  ClusterIdSchema, CostBreakdown, CostAllocation, WasteItem,
  TimeRangeInput, CursorPaginationInput,
} from "@voyager/shared/schemas";

export const costRouter = router({

  // ─── cost.overview ─────────────────────────────────────────────────────
  // High-level cost overview across all clusters or a specific cluster.
  // Auth: authenticated
  // Rate limit: 30 req/min
  // Cache: 5min TTL (cost data is computed, expensive)
  overview: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(), // null = all clusters
      timeRange: TimeRangeInput.optional(),  // default = current month
    }))
    .output(z.object({
      totalCost: CostBreakdown,
      previousPeriodCost: CostBreakdown,
      changePercent: z.number(),
      monthlyCostForecast: z.number(),
      efficiency: z.number().min(0).max(100), // overall resource efficiency
      totalSavingsOpportunity: z.number(),
      clusterBreakdown: z.array(z.object({
        clusterId: ClusterIdSchema,
        clusterName: z.string(),
        cost: CostBreakdown,
        nodeCount: z.number().int(),
        efficiency: z.number(),
      })),
      costByCategory: z.object({
        compute: z.number(),   // CPU + memory
        storage: z.number(),   // PVs, EBS, etc.
        network: z.number(),   // data transfer
        other: z.number(),     // LBs, IPs, etc.
      }),
    }))
    .query(async ({ ctx, input }) => {
      return costService.getOverview(ctx.tenantId, ctx.user, input);
    }),

  // ─── cost.byNamespace ──────────────────────────────────────────────────
  // Cost breakdown by namespace.
  // Auth: authenticated, filtered by namespace access
  // Rate limit: 30 req/min
  // Cache: 5min TTL
  byNamespace: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      timeRange: TimeRangeInput.optional(),
      sort: z.object({
        field: z.enum(["name", "totalCost", "cpuCost", "memoryCost", "efficiency", "trend"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(CostAllocation.extend({
        namespace: z.string(),
        podCount: z.number().int(),
        workloadCount: z.number().int(),
      })),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
      clusterTotal: CostBreakdown,
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return costService.getCostByNamespace(ctx.tenantId, input);
    }),

  // ─── cost.byWorkload ──────────────────────────────────────────────────
  // Cost breakdown by individual workload.
  // Auth: authenticated, namespace-level access
  // Rate limit: 30 req/min
  // Cache: 5min TTL
  byWorkload: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
      namespace: z.string().optional(),
      kind: z.enum(["Deployment", "StatefulSet", "DaemonSet"]).optional(),
      sort: z.object({
        field: z.enum(["name", "kind", "namespace", "totalCost", "efficiency", "trend"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(CostAllocation.extend({
        namespace: z.string(),
        workloadName: z.string(),
        workloadKind: z.string(),
        replicas: z.number().int(),
        cpuRequested: z.number(),
        cpuUsed: z.number(),
        memoryRequested: z.number(),
        memoryUsed: z.number(),
      })),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return costService.getCostByWorkload(ctx.tenantId, ctx.user, input);
    }),

  // ─── cost.trend ────────────────────────────────────────────────────────
  // Time-series cost data for charting.
  // Auth: authenticated
  // Rate limit: 20 req/min
  // Cache: 10min TTL
  trend: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      workload: z.string().optional(),
      timeRange: TimeRangeInput,
      groupBy: z.enum(["cluster", "namespace", "workload", "category"]).default("cluster"),
    }))
    .output(z.object({
      dataPoints: z.array(z.object({
        timestamp: z.coerce.date(),
        groups: z.array(z.object({
          name: z.string(),
          cost: CostBreakdown,
        })),
        totalCost: z.number(),
      })),
      summary: z.object({
        totalCost: z.number(),
        averageDailyCost: z.number(),
        projectedMonthlyCost: z.number(),
        trendDirection: z.enum(["up", "down", "stable"]),
        trendPercent: z.number(),
      }),
    }))
    .query(async ({ ctx, input }) => {
      return costService.getCostTrend(ctx.tenantId, ctx.user, input);
    }),

  // ─── cost.waste ────────────────────────────────────────────────────────
  // Identifies wasted resources and optimization opportunities.
  // Auth: authenticated
  // Rate limit: 20 req/min
  // Cache: 15min TTL (waste analysis is expensive)
  waste: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      wasteType: z.enum(["idle", "oversized", "abandoned", "orphaned_pvc", "orphaned_service"]).optional(),
      minSavingsPerDay: z.number().optional(), // filter by minimum savings
      sort: z.object({
        field: z.enum(["potentialSavings", "wasteType", "severity", "detectedAt"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(WasteItem),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
      summary: z.object({
        totalWastePerDay: z.number(),
        totalWastePerMonth: z.number(),
        byType: z.record(z.string(), z.object({
          count: z.number().int(),
          savingsPerDay: z.number(),
        })),
        bySeverity: z.record(z.string(), z.number().int()),
      }),
    }))
    .query(async ({ ctx, input }) => {
      return costService.getWaste(ctx.tenantId, ctx.user, input);
    }),
});
```

### 3.9 Security Router

```typescript
// src/trpc/routers/security.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  ClusterIdSchema, VulnerabilitySchema, RuntimeAlertSchema,
  SecurityPosture, VulnerabilitySeverity,
  CursorPaginationInput, TimeRangeInput,
} from "@voyager/shared/schemas";

export const securityRouter = router({

  // ─── security.vulnerabilities ──────────────────────────────────────────
  // Lists container image vulnerabilities.
  // Auth: authenticated, filtered by cluster/namespace access
  // Rate limit: 30 req/min
  // Cache: 5min TTL (scan results don't change rapidly)
  vulnerabilities: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      severity: z.array(VulnerabilitySeverity).optional(),
      fixAvailable: z.boolean().optional(),
      inUse: z.boolean().optional(),  // filter to only runtime-loaded packages
      search: z.string().max(200).optional(), // search by CVE ID, package name, image
      sort: z.object({
        field: z.enum(["severity", "cvssScore", "cveId", "image", "firstDetected", "lastSeen"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(VulnerabilitySchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
      summary: z.object({
        critical: z.number().int(),
        high: z.number().int(),
        medium: z.number().int(),
        low: z.number().int(),
        negligible: z.number().int(),
        fixable: z.number().int(),
        inUse: z.number().int(),      // vulns in packages actually loaded at runtime
        uniqueImages: z.number().int(),
      }),
    }))
    .query(async ({ ctx, input }) => {
      return securityService.listVulnerabilities(ctx.tenantId, ctx.user, input);
    }),

  // ─── security.byImage ─────────────────────────────────────────────────
  // Groups vulnerabilities by container image.
  // Auth: authenticated
  // Rate limit: 30 req/min
  // Cache: 5min TTL
  byImage: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      search: z.string().max(200).optional(),
      sort: z.object({
        field: z.enum(["image", "criticalCount", "totalCount", "lastScanned"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(z.object({
        image: z.string(),
        tag: z.string(),
        digest: z.string().optional(),
        clusters: z.array(z.object({ id: ClusterIdSchema, name: z.string() })),
        namespaces: z.array(z.string()),
        workloads: z.array(z.string()),
        vulnerabilities: z.object({
          critical: z.number().int(),
          high: z.number().int(),
          medium: z.number().int(),
          low: z.number().int(),
        }),
        lastScanned: z.coerce.date(),
        scanStatus: z.enum(["completed", "scanning", "failed", "queued"]),
      })),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
    }))
    .query(async ({ ctx, input }) => {
      return securityService.getVulnsByImage(ctx.tenantId, ctx.user, input);
    }),

  // ─── security.runtimeAlerts ────────────────────────────────────────────
  // Lists runtime security alerts (shell-in-container, privilege escalation, etc.).
  // Auth: authenticated
  // Rate limit: 60 req/min
  // Cache: 10s TTL (security events are time-sensitive)
  runtimeAlerts: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      alertType: z.array(z.enum([
        "shell_spawn", "privilege_escalation", "suspicious_process",
        "file_integrity", "network_anomaly", "crypto_mining", "reverse_shell",
      ])).optional(),
      severity: z.array(VulnerabilitySeverity).optional(),
      acknowledged: z.boolean().optional(),
      timeRange: TimeRangeInput.optional(),
      sort: z.object({
        field: z.enum(["severity", "timestamp", "alertType", "podName"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(RuntimeAlertSchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
      summary: z.object({
        total: z.number().int(),
        unacknowledged: z.number().int(),
        byType: z.record(z.string(), z.number().int()),
        bySeverity: z.record(z.string(), z.number().int()),
      }),
    }))
    .query(async ({ ctx, input }) => {
      return securityService.listRuntimeAlerts(ctx.tenantId, ctx.user, input);
    }),

  // ─── security.posture ──────────────────────────────────────────────────
  // Returns overall security posture score for a cluster.
  // Auth: authenticated
  // Rate limit: 20 req/min
  // Cache: 10min TTL (posture scans run periodically)
  posture: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema,
    }))
    .output(z.object({
      posture: SecurityPosture,
      history: z.array(z.object({
        date: z.coerce.date(),
        score: z.number(),
      })).max(30), // last 30 days
      recommendations: z.array(z.object({
        category: z.string(),
        title: z.string(),
        description: z.string(),
        severity: z.enum(["critical", "high", "medium", "low"]),
        effort: z.enum(["low", "medium", "high"]),
        impact: z.string(),
      })).max(20),
    }))
    .query(async ({ ctx, input }) => {
      await assertClusterAccess(ctx.user, input.clusterId);
      return securityService.getPosture(ctx.tenantId, input.clusterId);
    }),
});
```

### 3.10 Alert Router

```typescript
// src/trpc/routers/alert.ts
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import {
  IdSchema, ClusterIdSchema, AlertSchema, AlertRuleSchema,
  AlertSeverity, AlertStatus, AlertDomain,
  CursorPaginationInput, TimeRangeInput,
} from "@voyager/shared/schemas";

export const alertRouter = router({

  // ─── alert.list ────────────────────────────────────────────────────────
  // Lists alerts (fired, acknowledged, resolved, silenced).
  // Auth: authenticated
  // Rate limit: 60 req/min
  // Cache: 5s TTL (alerts are time-critical)
  list: protectedProcedure
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      severity: z.array(AlertSeverity).optional(),
      status: z.array(AlertStatus).optional(),
      domain: z.array(AlertDomain).optional(),
      search: z.string().max(200).optional(),
      timeRange: TimeRangeInput.optional(),
      sort: z.object({
        field: z.enum(["severity", "status", "firedAt", "domain", "title"]),
        order: z.enum(["asc", "desc"]).default("desc"),
      }).optional(),
      ...CursorPaginationInput.shape,
    }))
    .output(z.object({
      items: z.array(AlertSchema),
      nextCursor: z.string().nullable(),
      totalCount: z.number().int(),
      summary: z.object({
        firing: z.number().int(),
        acknowledged: z.number().int(),
        resolved: z.number().int(),
        silenced: z.number().int(),
        bySeverity: z.record(AlertSeverity, z.number().int()),
        byDomain: z.record(AlertDomain, z.number().int()),
      }),
    }))
    .query(async ({ ctx, input }) => {
      return alertService.listAlerts(ctx.tenantId, ctx.user, input);
    }),

  // ─── alert.create ──────────────────────────────────────────────────────
  // Creates a new alert rule.
  // Auth: admin role
  // Rate limit: 30 req/hour
  // No cache
  create: adminProcedure
    .use(rateLimit({ windowMs: 3600_000, max: 30 }))
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      domain: AlertDomain,
      enabled: z.boolean().default(true),
      condition: z.object({
        metric: z.string(),
        operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
        threshold: z.number(),
        duration: z.string().regex(/^\d+[smhd]$/), // e.g., "5m", "1h"
        scope: z.object({
          clusters: z.array(ClusterIdSchema).optional(),
          namespaces: z.array(z.string()).optional(),
          workloads: z.array(z.string()).optional(),
          labels: z.record(z.string()).optional(),
        }).optional(),
      }),
      notifications: z.array(z.object({
        channel: z.enum(["slack", "pagerduty", "email", "webhook"]),
        target: z.string(),
        templateId: z.string().optional(),
      })).min(1),
      cooldown: z.string().regex(/^\d+[smhd]$/).default("5m"),
    }))
    .output(z.object({
      rule: AlertRuleSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return alertService.createRule(ctx.tenantId, ctx.user.id, input);
    }),

  // ─── alert.update ──────────────────────────────────────────────────────
  // Updates an existing alert rule.
  // Auth: admin role
  // Rate limit: 30 req/hour
  // Invalidates rule cache
  update: adminProcedure
    .input(z.object({
      ruleId: IdSchema,
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      enabled: z.boolean().optional(),
      condition: z.object({
        metric: z.string(),
        operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
        threshold: z.number(),
        duration: z.string().regex(/^\d+[smhd]$/),
        scope: z.object({
          clusters: z.array(ClusterIdSchema).optional(),
          namespaces: z.array(z.string()).optional(),
          workloads: z.array(z.string()).optional(),
          labels: z.record(z.string()).optional(),
        }).optional(),
      }).optional(),
      notifications: z.array(z.object({
        channel: z.enum(["slack", "pagerduty", "email", "webhook"]),
        target: z.string(),
        templateId: z.string().optional(),
      })).optional(),
      cooldown: z.string().regex(/^\d+[smhd]$/).optional(),
    }))
    .output(z.object({
      rule: AlertRuleSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return alertService.updateRule(ctx.tenantId, input);
    }),

  // ─── alert.acknowledge ─────────────────────────────────────────────────
  // Acknowledges a firing alert.
  // Auth: authenticated (member+)
  // Rate limit: 120 req/min
  // No cache
  acknowledge: protectedProcedure
    .input(z.object({
      alertId: IdSchema,
      note: z.string().max(500).optional(),
    }))
    .output(z.object({
      alert: AlertSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return alertService.acknowledgeAlert(ctx.tenantId, ctx.user.id, input);
    }),

  // ─── alert.silence ─────────────────────────────────────────────────────
  // Silences an alert for a specified duration.
  // Auth: admin role
  // Rate limit: 30 req/hour
  // No cache
  silence: adminProcedure
    .input(z.object({
      alertId: IdSchema.optional(),          // silence a specific alert
      fingerprint: z.string().optional(),     // silence by fingerprint (all matching alerts)
      ruleId: IdSchema.optional(),            // silence all alerts from this rule
      duration: z.string().regex(/^\d+[smhd]$/), // e.g., "1h", "24h", "7d"
      reason: z.string().min(1).max(500),
    }).refine(
      (data) => data.alertId || data.fingerprint || data.ruleId,
      "Must specify alertId, fingerprint, or ruleId"
    ))
    .output(z.object({
      silencedCount: z.number().int(),
      silencedUntil: z.coerce.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      return alertService.silenceAlerts(ctx.tenantId, ctx.user.id, input);
    }),
});
```

### 3.11 AI Router

```typescript
// src/trpc/routers/ai.ts
import { z } from "zod";
import { router, protectedProcedure, rateLimitedProcedure } from "../trpc";
import { ClusterIdSchema, AIQuerySchema, AIResponseSchema, TimeRangeInput } from "@voyager/shared/schemas";

export const aiRouter = router({

  // ─── ai.query ──────────────────────────────────────────────────────────
  // Natural language query against cluster data. Supports multi-turn.
  // Auth: authenticated
  // Rate limit: 20 req/min (AI is expensive)
  // Cache: none (queries are contextual and non-deterministic)
  query: protectedProcedure
    .use(rateLimit({ windowMs: 60_000, max: 20 }))
    .input(AIQuerySchema)
    .output(AIResponseSchema)
    .mutation(async ({ ctx, input }) => {
      return aiService.query(ctx.tenantId, ctx.user, input);
    }),

  // ─── ai.investigate ────────────────────────────────────────────────────
  // Automated cross-domain investigation of an incident or anomaly.
  // Takes an alert/event as input and returns a comprehensive analysis.
  // Auth: authenticated
  // Rate limit: 10 req/min (heavyweight, multi-step AI pipeline)
  // Cache: 5min TTL per investigation target
  investigate: protectedProcedure
    .use(rateLimit({ windowMs: 60_000, max: 10 }))
    .input(z.object({
      // Investigation target — at least one required
      alertId: z.string().optional(),
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      workload: z.string().optional(),
      podName: z.string().optional(),
      // What happened? (optional hint to focus the investigation)
      symptom: z.string().max(500).optional(),
      timeRange: TimeRangeInput.optional(),
    }).refine(
      (data) => data.alertId || data.clusterId || data.podName,
      "Must specify at least alertId, clusterId, or podName"
    ))
    .output(z.object({
      investigationId: z.string(),
      summary: z.string(),
      timeline: z.array(z.object({
        timestamp: z.coerce.date(),
        domain: z.enum(["ops", "cost", "security"]),
        event: z.string(),
        severity: z.enum(["info", "warning", "critical"]),
        details: z.string().optional(),
      })),
      rootCause: z.object({
        description: z.string(),
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.object({
          type: z.string(),
          source: z.string(),
          detail: z.string(),
        })),
      }).nullable(),
      impact: z.object({
        affectedResources: z.array(z.object({
          kind: z.string(),
          name: z.string(),
          namespace: z.string().optional(),
        })),
        costImpact: z.number().optional(),
        securityImpact: z.string().optional(),
        userFacingImpact: z.string().optional(),
      }),
      recommendations: z.array(z.object({
        action: z.string(),
        description: z.string(),
        risk: z.enum(["none", "low", "medium", "high"]),
        estimatedImpact: z.string(),
        command: z.string().optional(), // kubectl or API command to execute
        automated: z.boolean(),         // can Voyager execute this automatically?
      })),
      relatedAlerts: z.array(z.object({
        id: z.string(),
        title: z.string(),
        severity: z.string(),
        domain: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      return aiService.investigate(ctx.tenantId, ctx.user, input);
    }),

  // ─── ai.suggest ────────────────────────────────────────────────────────
  // Proactive suggestions: cost savings, security fixes, performance improvements.
  // Auth: authenticated
  // Rate limit: 10 req/min
  // Cache: 30min TTL (suggestions are computed periodically)
  suggest: protectedProcedure
    .use(rateLimit({ windowMs: 60_000, max: 10 }))
    .input(z.object({
      clusterId: ClusterIdSchema.optional(),
      namespace: z.string().optional(),
      domain: z.enum(["ops", "cost", "security", "all"]).default("all"),
      limit: z.number().int().min(1).max(20).default(10),
    }))
    .output(z.object({
      suggestions: z.array(z.object({
        id: z.string(),
        domain: z.enum(["ops", "cost", "security"]),
        category: z.string(), // "rightsizing", "vulnerability", "scaling", "cleanup"
        title: z.string(),
        description: z.string(),
        impact: z.object({
          costSavingsPerMonth: z.number().optional(),
          securityImprovement: z.string().optional(),
          performanceImprovement: z.string().optional(),
        }),
        effort: z.enum(["trivial", "low", "medium", "high"]),
        priority: z.number().min(0).max(100),
        affectedResources: z.array(z.object({
          kind: z.string(),
          name: z.string(),
          namespace: z.string().optional(),
          cluster: z.string(),
        })),
        action: z.object({
          type: z.enum(["manual", "one_click", "scheduled"]),
          description: z.string(),
          command: z.string().optional(),
        }),
        createdAt: z.coerce.date(),
        dismissedAt: z.coerce.date().nullable(),
      })),
    }))
    .query(async ({ ctx, input }) => {
      return aiService.getSuggestions(ctx.tenantId, ctx.user, input);
    }),
});
```

### 3.12 Auth Router

```typescript
// src/trpc/routers/auth.ts
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { UserSchema } from "@voyager/shared/schemas";

export const authRouter = router({

  // ─── auth.register ─────────────────────────────────────────────────────
  // Registers a new user and creates their tenant (organization).
  // Auth: none (public)
  // Rate limit: 5 req/hour per IP
  // No cache
  register: publicProcedure
    .use(rateLimit({ windowMs: 3600_000, max: 5, key: "ip" }))
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8).max(128),
      name: z.string().min(1).max(255),
      organizationName: z.string().min(1).max(255),
    }))
    .output(z.object({
      user: UserSchema,
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresAt: z.coerce.date(),
    }))
    .mutation(async ({ input }) => {
      return authService.register(input);
    }),

  // ─── auth.login ────────────────────────────────────────────────────────
  // Authenticates a user and returns tokens.
  // Auth: none (public)
  // Rate limit: 10 req/min per IP (brute force protection)
  // No cache
  login: publicProcedure
    .use(rateLimit({ windowMs: 60_000, max: 10, key: "ip" }))
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .output(z.object({
      user: UserSchema,
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresAt: z.coerce.date(),
    }))
    .mutation(async ({ input }) => {
      return authService.login(input);
    }),

  // ─── auth.refresh ──────────────────────────────────────────────────────
  // Refreshes an expired access token.
  // Auth: refresh token in body
  // Rate limit: 30 req/min
  // No cache
  refresh: publicProcedure
    .use(rateLimit({ windowMs: 60_000, max: 30 }))
    .input(z.object({
      refreshToken: z.string(),
    }))
    .output(z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
      expiresAt: z.coerce.date(),
    }))
    .mutation(async ({ input }) => {
      return authService.refreshToken(input.refreshToken);
    }),

  // ─── auth.logout ───────────────────────────────────────────────────────
  // Invalidates refresh token.
  // Auth: authenticated
  // Rate limit: 30 req/min
  // No cache
  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      return authService.logout(ctx.user.id);
    }),

  // ─── auth.profile ──────────────────────────────────────────────────────
  // Gets or updates the current user's profile.
  // Auth: authenticated
  // Rate limit: 60 req/min
  // Cache: 1min TTL
  profile: protectedProcedure
    .input(z.object({
      update: z.object({
        name: z.string().min(1).max(255).optional(),
        avatarUrl: z.string().url().optional(),
        notificationPreferences: z.object({
          email: z.boolean(),
          slack: z.boolean(),
          alertSeverities: z.array(z.enum(["critical", "high", "medium", "low", "info"])),
          quietHours: z.object({
            enabled: z.boolean(),
            start: z.string(), // "22:00"
            end: z.string(),   // "08:00"
            timezone: z.string(),
          }).optional(),
        }).optional(),
      }).optional(),
    }).optional())
    .output(z.object({
      user: UserSchema.extend({
        organization: z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          plan: z.enum(["free", "team", "pro", "enterprise"]),
          nodeLimit: z.number().int(),
          currentNodeCount: z.number().int(),
        }),
        notificationPreferences: z.object({
          email: z.boolean(),
          slack: z.boolean(),
          alertSeverities: z.array(z.string()),
          quietHours: z.object({
            enabled: z.boolean(),
            start: z.string(),
            end: z.string(),
            timezone: z.string(),
          }).nullable(),
        }),
      }),
    }))
    .query(async ({ ctx, input }) => {
      if (input?.update) {
        return authService.updateProfile(ctx.user.id, input.update);
      }
      return authService.getProfile(ctx.user.id);
    }),

  // ─── auth.oauth ────────────────────────────────────────────────────────
  // Initiates OAuth flow (GitHub, Google).
  // Auth: none (public)
  // Rate limit: 20 req/min per IP
  // No cache
  oauth: publicProcedure
    .input(z.object({
      provider: z.enum(["github", "google"]),
      redirectUrl: z.string().url(),
    }))
    .output(z.object({
      authUrl: z.string().url(),
      state: z.string(),
    }))
    .mutation(async ({ input }) => {
      return authService.initiateOAuth(input);
    }),
});
```

### 3.13 Admin Router

```typescript
// src/trpc/routers/admin.ts
import { z } from "zod";
import { router, adminProcedure, ownerProcedure } from "../trpc";
import {
  IdSchema, UserSchema, TeamSchema, UserRole,
  ClusterIdSchema, CursorPaginationInput,
} from "@voyager/shared/schemas";

export const adminRouter = router({

  // ─── admin.users ───────────────────────────────────────────────────────
  // Manages organization users (list, invite, update role, remove).
  // Auth: admin role
  // Rate limit: 30 req/min
  // Cache: 1min TTL for list
  users: router({
    list: adminProcedure
      .input(z.object({
        search: z.string().max(100).optional(),
        role: UserRole.optional(),
        sort: z.object({
          field: z.enum(["name", "email", "role", "lastLoginAt", "createdAt"]),
          order: z.enum(["asc", "desc"]).default("asc"),
        }).optional(),
        ...CursorPaginationInput.shape,
      }))
      .output(z.object({
        items: z.array(UserSchema),
        nextCursor: z.string().nullable(),
        totalCount: z.number().int(),
      }))
      .query(async ({ ctx, input }) => {
        return adminService.listUsers(ctx.tenantId, input);
      }),

    invite: adminProcedure
      .use(rateLimit({ windowMs: 3600_000, max: 20 }))
      .input(z.object({
        email: z.string().email(),
        role: UserRole.default("member"),
        teamIds: z.array(IdSchema).optional(),
      }))
      .output(z.object({
        inviteId: z.string(),
        inviteUrl: z.string().url(),
        expiresAt: z.coerce.date(),
      }))
      .mutation(async ({ ctx, input }) => {
        return adminService.inviteUser(ctx.tenantId, ctx.user.id, input);
      }),

    updateRole: adminProcedure
      .input(z.object({
        userId: IdSchema,
        role: UserRole,
      }))
      .output(z.object({ user: UserSchema }))
      .mutation(async ({ ctx, input }) => {
        // Only owners can promote to admin/owner
        if (["admin", "owner"].includes(input.role) && ctx.user.role !== "owner") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can assign admin/owner roles" });
        }
        return adminService.updateUserRole(ctx.tenantId, input);
      }),

    remove: adminProcedure
      .input(z.object({
        userId: IdSchema,
      }))
      .output(z.object({ success: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove yourself" });
        }
        return adminService.removeUser(ctx.tenantId, input.userId);
      }),
  }),

  // ─── admin.teams ───────────────────────────────────────────────────────
  // Manages teams (RBAC groups with cluster/namespace permissions).
  // Auth: admin role
  // Rate limit: 30 req/min
  // Cache: 1min TTL for list
  teams: router({
    list: adminProcedure
      .input(z.object({
        search: z.string().max(100).optional(),
        ...CursorPaginationInput.shape,
      }))
      .output(z.object({
        items: z.array(TeamSchema),
        nextCursor: z.string().nullable(),
        totalCount: z.number().int(),
      }))
      .query(async ({ ctx, input }) => {
        return adminService.listTeams(ctx.tenantId, input);
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(63),
        memberIds: z.array(IdSchema).optional(),
        clusterPermissions: z.array(z.object({
          clusterId: ClusterIdSchema,
          namespaces: z.array(z.string()).optional(), // null = all
          role: UserRole,
        })).optional(),
      }))
      .output(z.object({ team: TeamSchema }))
      .mutation(async ({ ctx, input }) => {
        return adminService.createTeam(ctx.tenantId, input);
      }),

    update: adminProcedure
      .input(z.object({
        teamId: IdSchema,
        name: z.string().min(1).max(255).optional(),
        memberIds: z.array(IdSchema).optional(),
        clusterPermissions: z.array(z.object({
          clusterId: ClusterIdSchema,
          namespaces: z.array(z.string()).optional(),
          role: UserRole,
        })).optional(),
      }))
      .output(z.object({ team: TeamSchema }))
      .mutation(async ({ ctx, input }) => {
        return adminService.updateTeam(ctx.tenantId, input);
      }),

    delete: adminProcedure
      .input(z.object({ teamId: IdSchema }))
      .output(z.object({ success: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        return adminService.deleteTeam(ctx.tenantId, input.teamId);
      }),
  }),

  // ─── admin.settings ────────────────────────────────────────────────────
  // Organization-level settings.
  // Auth: owner role
  // Rate limit: 10 req/min
  // Cache: 5min TTL for get
  settings: router({
    get: ownerProcedure
      .output(z.object({
        organization: z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          plan: z.enum(["free", "team", "pro", "enterprise"]),
          createdAt: z.coerce.date(),
        }),
        billing: z.object({
          plan: z.string(),
          nodeLimit: z.number().int(),
          currentNodeCount: z.number().int(),
          currentMonthCost: z.number(),
          nextBillingDate: z.coerce.date().nullable(),
          paymentMethodConfigured: z.boolean(),
        }),
        retention: z.object({
          metrics: z.string(),  // "30d", "90d", "1y"
          logs: z.string(),
          events: z.string(),
          costData: z.string(),
          securityData: z.string(),
        }),
        notifications: z.object({
          defaultChannels: z.array(z.object({
            type: z.enum(["slack", "pagerduty", "email", "webhook"]),
            name: z.string(),
            target: z.string(),
            enabled: z.boolean(),
          })),
        }),
        security: z.object({
          mfaRequired: z.boolean(),
          sessionTimeoutMinutes: z.number().int(),
          allowedDomains: z.array(z.string()),
          ssoEnabled: z.boolean(),
          ssoProvider: z.string().nullable(),
        }),
        apiKeys: z.array(z.object({
          id: z.string(),
          name: z.string(),
          prefix: z.string(),     // first 8 chars for identification
          scopes: z.array(z.string()),
          lastUsedAt: z.coerce.date().nullable(),
          expiresAt: z.coerce.date().nullable(),
          createdAt: z.coerce.date(),
        })),
      }))
      .query(async ({ ctx }) => {
        return adminService.getSettings(ctx.tenantId);
      }),

    update: ownerProcedure
      .input(z.object({
        organizationName: z.string().min(1).max(255).optional(),
        notifications: z.object({
          defaultChannels: z.array(z.object({
            type: z.enum(["slack", "pagerduty", "email", "webhook"]),
            name: z.string(),
            target: z.string(),
            enabled: z.boolean(),
          })),
        }).optional(),
        security: z.object({
          mfaRequired: z.boolean().optional(),
          sessionTimeoutMinutes: z.number().int().min(15).max(1440).optional(),
          allowedDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).optional(),
        }).optional(),
      }))
      .output(z.object({ success: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        return adminService.updateSettings(ctx.tenantId, input);
      }),

    // API key management
    createApiKey: ownerProcedure
      .use(rateLimit({ windowMs: 3600_000, max: 10 }))
      .input(z.object({
        name: z.string().min(1).max(255),
        scopes: z.array(z.enum([
          "clusters:read", "clusters:write",
          "metrics:read",
          "alerts:read", "alerts:write",
          "cost:read",
          "security:read",
        ])).min(1),
        expiresInDays: z.number().int().min(1).max(365).optional(),
      }))
      .output(z.object({
        id: z.string(),
        key: z.string(), // full key — shown only once
        name: z.string(),
        scopes: z.array(z.string()),
        expiresAt: z.coerce.date().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        return adminService.createApiKey(ctx.tenantId, ctx.user.id, input);
      }),

    revokeApiKey: ownerProcedure
      .input(z.object({ keyId: z.string() }))
      .output(z.object({ success: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        return adminService.revokeApiKey(ctx.tenantId, input.keyId);
      }),
  }),
});
```

### 3.14 Caching Strategy Summary

| Router | Endpoint | TTL | Invalidation Strategy |
|--------|----------|-----|----------------------|
| `cluster.list` | 30s | On cluster register/delete event |
| `cluster.get` | 15s | On cluster data update |
| `cluster.nodes.list` | 30s | On node status change |
| `cluster.nodes.get` | 15s | On node metrics update |
| `namespace.list` | 30s | On namespace create/delete |
| `namespace.get` | 15s | On namespace resource change |
| `workload.list` | 15s | On workload state change |
| `workload.get` | 10s | On workload update/events |
| `pod.list` | 10s | On pod lifecycle events |
| `pod.get` | 5s | On pod state change |
| `pod.logs` | none | Real-time stream |
| `cost.overview` | 5min | On cost recalculation job |
| `cost.byNamespace` | 5min | On cost recalculation job |
| `cost.byWorkload` | 5min | On cost recalculation job |
| `cost.trend` | 10min | On new data ingestion |
| `cost.waste` | 15min | On waste analysis job |
| `security.vulnerabilities` | 5min | On new scan results |
| `security.byImage` | 5min | On new scan results |
| `security.runtimeAlerts` | 10s | On new runtime event |
| `security.posture` | 10min | On posture scan completion |
| `alert.list` | 5s | On alert state change |
| `ai.query` | none | Non-deterministic |
| `ai.investigate` | 5min | Per investigation target |
| `ai.suggest` | 30min | On data change |
| `auth.profile` | 1min | On profile update |
| `admin.users.list` | 1min | On user change |
| `admin.teams.list` | 1min | On team change |
| `admin.settings.get` | 5min | On settings update |

**Cache implementation:**

```typescript
// src/lib/cache.ts
import { Redis } from "ioredis";

export class CacheManager {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Cache key format: voyager:{tenantId}:{resource}:{params_hash}
  buildKey(tenantId: string, resource: string, params?: Record<string, unknown>): string {
    const base = `voyager:${tenantId}:${resource}`;
    if (!params || Object.keys(params).length === 0) return base;
    const hash = createHash("sha256")
      .update(JSON.stringify(sortKeys(params)))
      .digest("hex")
      .slice(0, 12);
    return `${base}:${hash}`;
  }
}
```

---

## 4. WebSocket Events (Real-Time)

### 4.1 Connection Architecture

```typescript
// src/ws/server.ts
import { Server as SocketIOServer } from "socket.io";
import { Redis } from "ioredis";

/**
 * WebSocket Architecture:
 * 
 * - Built on Socket.IO for automatic reconnection, rooms, namespaces
 * - Redis adapter for horizontal scaling (multiple backend instances)
 * - JWT authentication on connection handshake
 * - Tenant isolation via Redis pub/sub channels
 * - Automatic cleanup on disconnect
 * 
 * Connection flow:
 * 1. Client connects with JWT in auth handshake
 * 2. Server validates JWT, extracts user/tenant
 * 3. Client joins tenant room automatically
 * 4. Client subscribes to specific channels (clusters, namespaces, pods)
 * 5. Server pushes real-time updates through subscribed channels
 * 6. Heartbeat every 30s to detect stale connections
 */

interface ServerToClientEvents {
  // ─── Cluster Events ─────────────────────────────────────────────────
  "cluster:status": (data: ClusterStatusEvent) => void;
  "cluster:metrics": (data: ClusterMetricsEvent) => void;
  "cluster:node:status": (data: NodeStatusEvent) => void;

  // ─── Pod Events ─────────────────────────────────────────────────────
  "pod:status": (data: PodStatusEvent) => void;
  "pod:logs": (data: PodLogEvent) => void;
  "pod:metrics": (data: PodMetricsEvent) => void;

  // ─── Workload Events ────────────────────────────────────────────────
  "workload:status": (data: WorkloadStatusEvent) => void;
  "workload:scaling": (data: WorkloadScalingEvent) => void;

  // ─── K8s Events ─────────────────────────────────────────────────────
  "k8s:event": (data: K8sEventPayload) => void;

  // ─── Alert Events ───────────────────────────────────────────────────
  "alert:fired": (data: AlertEvent) => void;
  "alert:resolved": (data: AlertEvent) => void;
  "alert:acknowledged": (data: AlertEvent) => void;

  // ─── Cost Events ────────────────────────────────────────────────────
  "cost:spike": (data: CostSpikeEvent) => void;
  "cost:budget": (data: CostBudgetEvent) => void;

  // ─── Security Events ───────────────────────────────────────────────
  "security:runtime": (data: RuntimeSecurityEvent) => void;
  "security:vuln": (data: VulnDiscoveredEvent) => void;

  // ─── AI Events ──────────────────────────────────────────────────────
  "ai:insight": (data: AIInsightEvent) => void;

  // ─── System Events ──────────────────────────────────────────────────
  "system:heartbeat": (data: { timestamp: number }) => void;
  "system:error": (data: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  // ─── Subscriptions ──────────────────────────────────────────────────
  "subscribe:cluster": (data: { clusterId: string }) => void;
  "unsubscribe:cluster": (data: { clusterId: string }) => void;
  "subscribe:namespace": (data: { clusterId: string; namespace: string }) => void;
  "unsubscribe:namespace": (data: { clusterId: string; namespace: string }) => void;
  "subscribe:pod": (data: { clusterId: string; namespace: string; podName: string }) => void;
  "unsubscribe:pod": (data: { clusterId: string; namespace: string; podName: string }) => void;

  // ─── Log Streaming ──────────────────────────────────────────────────
  "logs:start": (data: LogStreamRequest) => void;
  "logs:stop": (data: { streamId: string }) => void;

  // ─── Heartbeat ──────────────────────────────────────────────────────
  "heartbeat": () => void;
}
```

### 4.2 Event Type Definitions

```typescript
// src/ws/events.ts

// ─── Cluster Events ────────────────────────────────────────────────────────

interface ClusterStatusEvent {
  clusterId: string;
  clusterName: string;
  previousStatus: "healthy" | "warning" | "critical" | "unknown";
  currentStatus: "healthy" | "warning" | "critical" | "unknown";
  reason: string;
  timestamp: number;
}

interface ClusterMetricsEvent {
  clusterId: string;
  timestamp: number;
  metrics: {
    cpuUsage: number;       // percentage 0-100
    cpuCapacity: number;    // millicores
    memoryUsage: number;    // percentage 0-100
    memoryCapacity: number; // bytes
    podCount: number;
    nodeCount: number;
    readyNodes: number;
  };
}

interface NodeStatusEvent {
  clusterId: string;
  nodeName: string;
  previousStatus: string;
  currentStatus: string;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
  }>;
  timestamp: number;
}

// ─── Pod Events ────────────────────────────────────────────────────────────

interface PodStatusEvent {
  clusterId: string;
  namespace: string;
  podName: string;
  previousPhase: string;
  currentPhase: string;
  reason?: string;
  message?: string;
  restartCount: number;
  timestamp: number;
}

interface PodLogEvent {
  streamId: string;
  clusterId: string;
  namespace: string;
  podName: string;
  containerName: string;
  timestamp: string;    // ISO 8601
  line: string;
  stream: "stdout" | "stderr";
}

interface PodMetricsEvent {
  clusterId: string;
  namespace: string;
  podName: string;
  timestamp: number;
  containers: Array<{
    name: string;
    cpuUsage: number;    // millicores
    memoryUsage: number; // bytes
  }>;
}

// ─── Workload Events ───────────────────────────────────────────────────────

interface WorkloadStatusEvent {
  clusterId: string;
  namespace: string;
  name: string;
  kind: string;
  previousStatus: string;
  currentStatus: string;
  replicas: {
    desired: number;
    ready: number;
    available: number;
  };
  timestamp: number;
}

interface WorkloadScalingEvent {
  clusterId: string;
  namespace: string;
  name: string;
  kind: string;
  previousReplicas: number;
  currentReplicas: number;
  trigger: "manual" | "hpa" | "vpa" | "keda";
  timestamp: number;
}

// ─── K8s Events ────────────────────────────────────────────────────────────

interface K8sEventPayload {
  clusterId: string;
  namespace: string;
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  involvedObject: {
    kind: string;
    name: string;
    namespace?: string;
  };
  count: number;
  source: string;
  timestamp: number;
}

// ─── Alert Events ──────────────────────────────────────────────────────────

interface AlertEvent {
  alertId: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "firing" | "resolved" | "acknowledged";
  domain: "ops" | "cost" | "security";
  clusterId: string;
  namespace?: string;
  source: string;
  labels: Record<string, string>;
  timestamp: number;
  acknowledgedBy?: string;
}

// ─── Cost Events ───────────────────────────────────────────────────────────

interface CostSpikeEvent {
  clusterId: string;
  namespace?: string;
  workload?: string;
  previousCostPerHour: number;
  currentCostPerHour: number;
  changePercent: number;
  reason: string;
  timestamp: number;
}

interface CostBudgetEvent {
  clusterId: string;
  namespace?: string;
  budgetName: string;
  budgetAmount: number;
  currentSpend: number;
  percentUsed: number;
  projectedOverrun: number;
  timestamp: number;
}

// ─── Security Events ──────────────────────────────────────────────────────

interface RuntimeSecurityEvent {
  clusterId: string;
  namespace: string;
  podName: string;
  containerName: string;
  alertType: string;
  severity: string;
  description: string;
  process?: string;
  filePath?: string;
  timestamp: number;
}

interface VulnDiscoveredEvent {
  clusterId: string;
  image: string;
  cveId: string;
  severity: string;
  title: string;
  fixAvailable: boolean;
  affectedWorkloads: number;
  timestamp: number;
}

// ─── AI Events ─────────────────────────────────────────────────────────────

interface AIInsightEvent {
  insightId: string;
  type: "anomaly" | "suggestion" | "prediction";
  domain: "ops" | "cost" | "security";
  title: string;
  summary: string;
  severity: string;
  clusterId: string;
  namespace?: string;
  timestamp: number;
}
```

### 4.3 Subscription Model

```typescript
// src/ws/subscriptions.ts

/**
 * Room/Channel structure (using Socket.IO rooms):
 * 
 * tenant:{tenantId}                          → All tenant events
 * cluster:{clusterId}                        → Cluster-level events
 * cluster:{clusterId}:metrics                → Cluster metrics stream
 * cluster:{clusterId}:ns:{namespace}         → Namespace-level events
 * cluster:{clusterId}:ns:{namespace}:pod:{podName}  → Pod-level events
 * alerts:{tenantId}                          → All alerts for tenant
 * alerts:{tenantId}:{severity}               → Filtered by severity
 * cost:{tenantId}                            → Cost events
 * security:{tenantId}                        → Security events
 * logs:{clusterId}:{namespace}:{pod}:{container}  → Log stream
 * 
 * Access control: Users can only join rooms for clusters/namespaces
 * they have permission to access. Checked on subscribe.
 */

class SubscriptionManager {
  constructor(
    private io: SocketIOServer,
    private redis: Redis,
    private accessControl: AccessControlService
  ) {}

  async handleSubscribe(
    socket: AuthenticatedSocket,
    channel: string,
    params: Record<string, string>
  ): Promise<void> {
    // Validate access
    const hasAccess = await this.accessControl.canAccess(
      socket.user,
      params.clusterId,
      params.namespace
    );
    if (!hasAccess) {
      socket.emit("system:error", {
        code: "FORBIDDEN",
        message: `No access to ${channel}`,
      });
      return;
    }

    // Build room name
    const room = this.buildRoomName(channel, params);

    // Join room
    await socket.join(room);

    // Track subscription in Redis (for metrics/cleanup)
    await this.redis.sadd(
      `ws:subscriptions:${socket.user.id}`,
      room
    );

    // If subscribing to metrics, start metrics push for this cluster
    if (channel === "subscribe:cluster") {
      await this.startMetricsPush(params.clusterId, room);
    }
  }

  async handleUnsubscribe(
    socket: AuthenticatedSocket,
    channel: string,
    params: Record<string, string>
  ): Promise<void> {
    const room = this.buildRoomName(channel, params);
    await socket.leave(room);
    await this.redis.srem(
      `ws:subscriptions:${socket.user.id}`,
      room
    );
  }

  private buildRoomName(channel: string, params: Record<string, string>): string {
    switch (channel) {
      case "subscribe:cluster":
        return `cluster:${params.clusterId}`;
      case "subscribe:namespace":
        return `cluster:${params.clusterId}:ns:${params.namespace}`;
      case "subscribe:pod":
        return `cluster:${params.clusterId}:ns:${params.namespace}:pod:${params.podName}`;
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }
}
```

### 4.4 Live Log Streaming Protocol

```typescript
// src/ws/log-streaming.ts

/**
 * Log Streaming Protocol:
 * 
 * 1. Client sends "logs:start" with pod/container details
 * 2. Server creates a stream from the Voyager Monitor agent
 * 3. Server forwards log lines to the client via "pod:logs" events
 * 4. Client can stop with "logs:stop"
 * 5. Server auto-stops on disconnect or after 30min inactivity
 * 
 * Backpressure: If the client is slow, server buffers up to 1000 lines.
 * If buffer overflows, oldest lines are dropped and a "log:overflow" event is sent.
 * 
 * Rate: Up to 10 concurrent log streams per user.
 */

interface LogStreamRequest {
  clusterId: string;
  namespace: string;
  podName: string;
  containerName: string;
  follow: boolean;
  tailLines: number;
  filter?: string;      // server-side grep
  previous?: boolean;   // previous container instance
}

interface LogStreamState {
  streamId: string;
  userId: string;
  clusterId: string;
  namespace: string;
  podName: string;
  containerName: string;
  startedAt: number;
  linesStreamed: number;
  buffer: string[];
  maxBufferSize: number;
  active: boolean;
}

class LogStreamManager {
  private streams = new Map<string, LogStreamState>();
  private readonly MAX_STREAMS_PER_USER = 10;
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  async startStream(
    socket: AuthenticatedSocket,
    request: LogStreamRequest
  ): Promise<string> {
    // Check concurrent stream limit
    const userStreams = this.getUserStreamCount(socket.user.id);
    if (userStreams >= this.MAX_STREAMS_PER_USER) {
      socket.emit("system:error", {
        code: "STREAM_LIMIT",
        message: `Maximum ${this.MAX_STREAMS_PER_USER} concurrent log streams`,
      });
      throw new Error("Stream limit exceeded");
    }

    const streamId = generateId();
    const state: LogStreamState = {
      streamId,
      userId: socket.user.id,
      ...request,
      startedAt: Date.now(),
      linesStreamed: 0,
      buffer: [],
      maxBufferSize: this.MAX_BUFFER_SIZE,
      active: true,
    };
    this.streams.set(streamId, state);

    // Connect to Voyager Monitor for this pod's logs
    const logSource = await this.connectToMonitor(request);

    // Forward log lines
    logSource.on("line", (line: string, timestamp: string, stream: "stdout" | "stderr") => {
      if (!state.active) return;

      // Apply filter if specified
      if (request.filter && !line.includes(request.filter)) return;

      const event: PodLogEvent = {
        streamId,
        clusterId: request.clusterId,
        namespace: request.namespace,
        podName: request.podName,
        containerName: request.containerName,
        timestamp,
        line,
        stream,
      };

      socket.emit("pod:logs", event);
      state.linesStreamed++;
    });

    // Idle timeout
    setTimeout(() => {
      if (state.active) {
        this.stopStream(streamId);
        socket.emit("system:error", {
          code: "STREAM_TIMEOUT",
          message: "Log stream closed due to inactivity",
        });
      }
    }, this.IDLE_TIMEOUT_MS);

    return streamId;
  }

  stopStream(streamId: string): void {
    const state = this.streams.get(streamId);
    if (state) {
      state.active = false;
      this.streams.delete(streamId);
    }
  }

  cleanupUser(userId: string): void {
    for (const [streamId, state] of this.streams) {
      if (state.userId === userId) {
        this.stopStream(streamId);
      }
    }
  }
}
```

### 4.5 Connection Management

```typescript
// src/ws/connection.ts

/**
 * Connection lifecycle:
 * 
 * 1. CONNECT: Client connects with JWT → validated → assigned to tenant room
 * 2. HEARTBEAT: Client sends heartbeat every 30s. Server responds.
 *    - If no heartbeat for 90s → connection considered stale → force disconnect
 * 3. RECONNECT: Socket.IO handles automatic reconnection with exponential backoff:
 *    - Initial delay: 1s
 *    - Max delay: 30s
 *    - Factor: 2
 *    - Jitter: 0.5
 * 4. DISCONNECT: Clean up all subscriptions, stop log streams, remove from rooms
 * 
 * Horizontal scaling: Redis adapter ensures events are broadcast across
 * all backend instances. A user connected to instance A receives events
 * published by instance B.
 */

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  adapter: createAdapter(pubClient, subClient), // Redis adapter
  pingInterval: 30_000,  // server heartbeat
  pingTimeout: 10_000,   // disconnect if pong not received
  maxHttpBufferSize: 1e6, // 1MB max message size
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
});

// Authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const user = await verifyToken(token);
    (socket as AuthenticatedSocket).user = user;
    (socket as AuthenticatedSocket).tenantId = user.tenantId;
    next();
  } catch (err) {
    next(new Error("Invalid authentication token"));
  }
});

// Connection handler
io.on("connection", async (socket: AuthenticatedSocket) => {
  const { user, tenantId } = socket;

  // Join tenant room automatically
  await socket.join(`tenant:${tenantId}`);
  await socket.join(`alerts:${tenantId}`);

  // Track connection
  await redis.sadd(`ws:connections:${tenantId}`, socket.id);
  await redis.hset(`ws:user:${user.id}`, {
    socketId: socket.id,
    connectedAt: Date.now(),
    ip: socket.handshake.address,
  });

  // Register event handlers
  socket.on("subscribe:cluster", (data) => subscriptionManager.handleSubscribe(socket, "subscribe:cluster", data));
  socket.on("unsubscribe:cluster", (data) => subscriptionManager.handleUnsubscribe(socket, "subscribe:cluster", data));
  socket.on("subscribe:namespace", (data) => subscriptionManager.handleSubscribe(socket, "subscribe:namespace", data));
  socket.on("unsubscribe:namespace", (data) => subscriptionManager.handleUnsubscribe(socket, "subscribe:namespace", data));
  socket.on("subscribe:pod", (data) => subscriptionManager.handleSubscribe(socket, "subscribe:pod", data));
  socket.on("unsubscribe:pod", (data) => subscriptionManager.handleUnsubscribe(socket, "subscribe:pod", data));

  socket.on("logs:start", (data) => logStreamManager.startStream(socket, data));
  socket.on("logs:stop", (data) => logStreamManager.stopStream(data.streamId));

  // Cleanup on disconnect
  socket.on("disconnect", async (reason) => {
    logStreamManager.cleanupUser(user.id);
    await redis.srem(`ws:connections:${tenantId}`, socket.id);
    await redis.del(`ws:user:${user.id}`);
    await redis.del(`ws:subscriptions:${user.id}`);
  });
});

// ─── Publishing Events (from Services) ─────────────────────────────────────

class EventPublisher {
  constructor(private io: SocketIOServer) {}

  publishClusterStatus(tenantId: string, event: ClusterStatusEvent): void {
    this.io.to(`tenant:${tenantId}`).emit("cluster:status", event);
    this.io.to(`cluster:${event.clusterId}`).emit("cluster:status", event);
  }

  publishClusterMetrics(tenantId: string, event: ClusterMetricsEvent): void {
    this.io.to(`cluster:${event.clusterId}:metrics`).emit("cluster:metrics", event);
  }

  publishPodStatus(tenantId: string, event: PodStatusEvent): void {
    const nsRoom = `cluster:${event.clusterId}:ns:${event.namespace}`;
    const podRoom = `${nsRoom}:pod:${event.podName}`;
    this.io.to(nsRoom).emit("pod:status", event);
    this.io.to(podRoom).emit("pod:status", event);
  }

  publishAlert(tenantId: string, event: AlertEvent): void {
    this.io.to(`alerts:${tenantId}`).emit(`alert:${event.status}`, event);
    this.io.to(`alerts:${tenantId}:${event.severity}`).emit(`alert:${event.status}`, event);
  }

  publishRuntimeSecurity(tenantId: string, event: RuntimeSecurityEvent): void {
    this.io.to(`security:${tenantId}`).emit("security:runtime", event);
    const nsRoom = `cluster:${event.clusterId}:ns:${event.namespace}`;
    this.io.to(nsRoom).emit("security:runtime", event);
  }

  publishCostSpike(tenantId: string, event: CostSpikeEvent): void {
    this.io.to(`cost:${tenantId}`).emit("cost:spike", event);
  }

  publishAIInsight(tenantId: string, event: AIInsightEvent): void {
    this.io.to(`tenant:${tenantId}`).emit("ai:insight", event);
  }
}
```

### 4.6 Real-Time Metrics Push

```typescript
// src/ws/metrics-push.ts

/**
 * Metrics push strategy:
 * 
 * - Cluster-level metrics: pushed every 15s to subscribed clients
 * - Node-level metrics: pushed every 15s when viewing node detail
 * - Pod-level metrics: pushed every 10s when viewing pod detail
 * - Workload metrics: pushed every 15s when viewing workload detail
 * 
 * Data source: TimescaleDB (latest data points) + Redis (hot cache)
 * 
 * Aggregation: Metrics are pre-aggregated per-cluster by the ingestion pipeline.
 * The WS server reads from Redis hot cache, not TimescaleDB directly.
 * 
 * Compression: Delta encoding for consecutive metric values.
 * Only send the delta from the previous value to reduce bandwidth.
 */

class MetricsPushService {
  private intervals = new Map<string, NodeJS.Timeout>();

  async startClusterMetricsPush(clusterId: string, room: string): Promise<void> {
    if (this.intervals.has(room)) return; // already pushing

    const interval = setInterval(async () => {
      const clients = await this.io.in(room).fetchSockets();
      if (clients.length === 0) {
        this.stopMetricsPush(room);
        return;
      }

      const metrics = await this.redis.hgetall(`metrics:latest:cluster:${clusterId}`);
      if (!metrics) return;

      this.io.to(room).emit("cluster:metrics", {
        clusterId,
        timestamp: Date.now(),
        metrics: {
          cpuUsage: parseFloat(metrics.cpuUsage),
          cpuCapacity: parseInt(metrics.cpuCapacity),
          memoryUsage: parseFloat(metrics.memoryUsage),
          memoryCapacity: parseInt(metrics.memoryCapacity),
          podCount: parseInt(metrics.podCount),
          nodeCount: parseInt(metrics.nodeCount),
          readyNodes: parseInt(metrics.readyNodes),
        },
      });
    }, 15_000);

    this.intervals.set(room, interval);
  }

  stopMetricsPush(room: string): void {
    const interval = this.intervals.get(room);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(room);
    }
  }
}
```

---

## 5. REST API (Public v1)

### 5.1 API Design Principles

- **Base URL:** `https://api.voyagerplatform.io/v1`
- **Auth:** API key in `X-API-Key` header
- **Format:** JSON request/response
- **Pagination:** Cursor-based (`?cursor=xxx&limit=50`)
- **Errors:** Standard error envelope (see §7)
- **Rate limits:** Per-key, returned in response headers
- **Versioning:** URL-based (`/v1/`), with `Sunset` header for deprecation

### 5.2 Authentication & Scopes

```
┌────────────────────────────────────────────────────────────────┐
│ API Key Scopes                                                 │
├──────────────────┬─────────────────────────────────────────────┤
│ Scope            │ Description                                 │
├──────────────────┼─────────────────────────────────────────────┤
│ clusters:read    │ List and read cluster/node/namespace data   │
│ clusters:write   │ Register/delete clusters                    │
│ metrics:read     │ Read metrics and time-series data           │
│ alerts:read      │ List and read alerts                        │
│ alerts:write     │ Create/update/acknowledge/silence alerts    │
│ cost:read        │ Read cost data, trends, waste reports       │
│ security:read    │ Read vulnerabilities, runtime alerts        │
│ webhooks:manage  │ Create/update/delete webhooks               │
└──────────────────┴─────────────────────────────────────────────┘
```

### 5.3 Rate Limiting

```
Rate limit headers (included in every response):

X-RateLimit-Limit: 1000          # requests per window
X-RateLimit-Remaining: 947       # remaining in current window
X-RateLimit-Reset: 1706997600    # window reset timestamp (Unix)
X-RateLimit-Policy: 1000;