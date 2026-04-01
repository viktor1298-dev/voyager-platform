# Code Audit Report — 2026-03-31

Full codebase scan of voyager-platform monorepo (454 source files, ~66K lines).
5 parallel agents: API Routers, API Core, Web App, Packages, Cross-Cutting.

---

## Summary

| Category | Findings | Critical | Warning | Info |
|----------|----------|----------|---------|------|
| Duplications | 21 | 3 | 16 | 2 |
| Hardcoded Values | 56+ | 2 | 49+ | 5 |
| Orphaned Code | 6 | 2 | 2 | 2 |
| Inconsistencies | 21 | 0 | 19 | 2 |
| **Total** | **104+** | **7** | **86+** | **11** |

---

## Agent 1: API Routers (`apps/api/src/routers/`, `routes/`, `services/`)

### Duplications

- [🟡] `apps/api/src/routers/services.ts:49-80` + `:83-114` — `list` and `listByCluster` procedures are near-identical. Same watch manager call, same fallback logic, same filter/mapping. Only variable names differ.
- [🟡] `apps/api/src/routers/ai.ts:316-354` + `:356-394` — `keySettingsCreate` and `keySettingsUpdate` contain identical test-and-upsert logic.
- [🟡] `apps/api/src/routers/ai.ts:472-514` + `:516-558` — `keys.save` and `keys.upsert` repeat the same test-and-upsert pattern.
- [🟡] `apps/api/src/routers/namespaces.ts:44-67` + `:116-136` — `list` and `listDetail` duplicate quota map building logic.
- [🟡] `apps/api/src/routers/topology.ts:68-121` — Watch + fallback cache logic repeated for 7 resource types inline.

### Hardcoded Values

- [🟡] `apps/api/src/routers/logs.ts:163` — `max(5000).default(200)` — `LIMITS.LOG_TAIL_MAX` and `LIMITS.LOG_TAIL_DEFAULT` exist in config but are not used here.
- [🟡] `apps/api/src/routers/logs.ts:305` — `max(5000).default(500)` — Same `LIMITS` constants exist but not used.
- [🟡] `apps/api/src/routers/topology.ts:10` — `const MAX_NODES = 200` hardcoded. Should be in config.
- [🟡] `apps/api/src/routes/metrics-stream.ts:17` — `new ConnectionLimiter(10, 50)` — `MAX_RESOURCE_CONNECTIONS_PER_CLUSTER` and `MAX_RESOURCE_CONNECTIONS_GLOBAL` exist in `@voyager/config/sse` but not used.
- [🟡] `apps/api/src/routes/log-stream.ts:20` — `new ConnectionLimiter(10, 50)` — Same constants available but hardcoded.
- [🟡] `apps/api/src/routes/log-stream.ts:23` — `const MAX_LOG_LINES = 10_000` hardcoded.
- [🟡] `apps/api/src/routers/ai-keys.ts:142` — `timeoutMs: 15_000` hardcoded.
- [🟡] `apps/api/src/routers/deployments.ts` — `K8S_DEPLOYMENTS_CACHE_TTL = 30` hardcoded. `CACHE_TTL.K8S_RESOURCES_SEC` is 30s in config.

### Orphaned Code

- [🟡] `apps/api/src/lib/k8s.ts:26-45` — `getCoreV1Api()`, `getAppsV1Api()`, `getEventsApi()`, `getVersionApi()` only referenced in test mocks. Unused in routers, services, or jobs.

### Inconsistencies

- [🟡] `apps/api/src/routers/` — `logAudit()` wrapping is inconsistent. Some routers wrap in try/catch and suppress errors (audit.ts, ai.ts, pods.ts), others don't (alerts.ts, webhooks.ts, deployments.ts, statefulsets.ts).
- [🟡] `apps/api/src/routers/` — Mixed success response schemas: `z.object({ success: z.literal(true) })` (ai-keys.ts:19) vs inline `return { success: true }` with no schema validation (pods.ts, webhooks.ts). Some use `z.boolean()`, others `z.literal(true)`.
- [🟡] `apps/api/src/routers/ai.ts:65-73` + `clusters.ts:126-135` — Duplicate error pattern matching: `TRANSIENT_AI_ERROR_PATTERNS` and `CONNECTION_REFUSED_PATTERNS`/`AUTH_FAILED_PATTERNS`/`TIMEOUT_PATTERNS` overlap.
- [🟡] `apps/api/src/routers/audit.ts:49-51` vs `events.ts:44-45` — Pagination inconsistency: audit uses `page/limit` with offset calc, events uses `limit/offset` directly.
- [🟡] `apps/api/src/routers/webhooks.ts:12-22` — `isPrivateIP()` inline helper. Could be in shared security/auth lib.
- [🟡] `apps/api/src/routers/crds.ts:30-48` + `:173-176` — `asK8sList()` custom response wrapper defined and repeated within same file.

---

## Agent 2: API Core (`apps/api/src/lib/`, `jobs/`, `config/`, `__tests__/`)

### Duplications

- [🔴] `apps/api/src/lib/ensure-admin-user.ts` + `ensure-bootstrap-user.ts` + `ensure-viewer-user.ts` — Nearly identical bootstrap logic repeated three times. All use same `db.select().from(users).where()` pattern, same `createUser()` call, same try-catch. Should be single `ensureUserExists(email, name, role)`.

### Hardcoded Values

- [🔴] `apps/api/src/lib/metrics-history-collector.ts:15` — `CLUSTER_TIMEOUT_MS = 15000` hardcoded. Should be in `config/jobs.ts`.
- [🔴] `apps/api/src/lib/presence.ts:5-8` — `PRESENCE_SWEEP_INTERVAL_MS = 15000`, `PRESENCE_KEEPALIVE_MS = 25000`, `MAX_PRESENCE_USERS = 1000` all hardcoded.
- [🟡] `apps/api/src/lib/watch-manager.ts` — `WATCH_RECONNECT_BASE_MS`, `WATCH_RECONNECT_MAX_MS`, `WATCH_RECONNECT_JITTER_RATIO`, `UNSUBSCRIBE_GRACE_MS = 60000`, `STATUS_THROTTLE_MS = 2000`, `STABLE_CONNECTION_MS = 10000` all defined locally.
- [🟡] `apps/api/src/jobs/data-retention.ts:4-8` — `RETENTION_DAYS = { health_history: 30, audit_log: 90, alert_history: 30, webhook_deliveries: 30 }` hardcoded.

### Orphaned Code

- [🟡] 20+ exports in `lib/resource-mappers.ts`, `relation-resolver.ts`, `sso.ts`, `karpenter-service.ts`, `health-checks.ts` need cross-domain grep verification. Agent could not fully verify all usages.

### Inconsistencies

- [🟡] Error message handling — Some files use `instanceof Error ? err.message : err`, others don't check instanceof.
- [🟡] Non-fatal error patterns — Mix of `console.error()` and `console.warn()` for suppressed errors.
- [🟡] Config file organization — Timing/interval values scattered across lib files instead of centralized in `config/`.

---

## Agent 3: Web App (`apps/web/src/`)

### Duplications

- [🔴] `apps/web/src/app/clusters/[id]/pods/page.tsx:88-104` + `autoscaling/page.tsx:39-53` — `parseCpuMillicores()` and `parseMemoryMi()` defined identically in two separate pages. Should be shared util.
- [🔴] `apps/web/src/stores/resource-store.ts:54-95` + `:98-148` — `applyEvent()` and `applyEvents()` contain ~80% duplicated ADDED/MODIFIED/DELETED switch logic.
- [🟡] `deployments/page.tsx:87-120` + `statefulsets/page.tsx:90-119` + `daemonsets/page.tsx:72-92` — Expanded detail mutation pattern (useState for dialogs, useMutation with toast, invalidation) nearly identical across 3+ resource pages.
- [🟡] 13 resource pages all duplicate dialog state management pattern: `const [restartDialogOpen, setRestartDialogOpen] = useState(false)`, `deleteDialogOpen`, `scaleOpen`, `editOpen`.
- [🟡] Multiple pages have own `*Summary` components (DeploymentSummary, StatefulSetSummary, DaemonSetSummary) with identical structure but resource-specific fields.
- [🟡] `deployments/page.tsx:69-71` + `statefulsets/page.tsx:71-74` — Inline `color-mix()` CSS duplicated.

### Hardcoded Values

- [🟡] **30,000ms (staleTime/refetchInterval) — 30 instances across 16 files.** `SYNC_INTERVAL_MS = 30_000` exists in `config/constants.ts` but is NOT used consistently. Files include: settings/page.tsx, cluster layout.tsx, metrics/page.tsx, ResourceSparkline.tsx, NodeMetricsTable.tsx, MetricsTimeSeriesPanel.tsx, TopologyMap.tsx, CrdBrowser.tsx, CommandPalette.tsx (5x), ClusterHealthWidget.tsx, ResourceChartsWidget.tsx, StatCardsWidget.tsx, AlertFeedWidget.tsx, Sidebar.tsx, RelationsTab.tsx, HelmRevisionDiff.tsx, HelmReleaseDetail.tsx (3x), useCachedResources.ts, useMetricsData.ts.
- [🟡] **60,000ms — 4 instances:** settings/page.tsx:173, cluster page.tsx:270, Sidebar.tsx:30, metrics-preferences.ts:39. `DB_CLUSTER_REFETCH_MS` and `HEALTH_STATUS_REFETCH_MS` exist in `lib/cluster-constants.ts` but not used.
- [🟡] **5,000ms — 4 instances:** logs/page.tsx:29, login/page.tsx:29, login/page.tsx:435, useApiHealth.ts:5.
- [🟡] AutoRefreshToggle.tsx:6,17-19 — Refresh interval type `30000 | 60000 | 300000` and options hardcoded inline.
- [🟡] NetworkPolicyGraph.tsx:109 — `staleTime: 15000` unique value hardcoded.

### Orphaned Code

- [🔵] `apps/web/src/lib/mock-karpenter.ts` — `getMockNodePools()`, `getMockEC2NodeClasses()`, `getKarpenterMetrics()` — Verify actual usage.
- [🔵] `apps/web/src/lib/mock-admin-api.ts` — Multiple mock functions — Verify usage in settings pages.

### Inconsistencies

- [🟡] Error handling — No centralized error message formatting. Each resource page has own `onError: (err) => toast.error(...)` pattern.
- [🟡] Dialog state naming — Mixed conventions: `restartDialogOpen` vs `scaleOpen` vs `editOpen` (some append `Dialog`, some don't).
- [🟡] Data type interfaces scattered — Each resource page defines own interface (DeploymentDetail, StatefulSetData, DaemonSetData) instead of centralizing in `@voyager/types`.
- [🟡] Tailwind class combos repeated 15+ times: `flex items-center gap-3 w-full min-w-0`, `text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate`.
- [🟡] Time calculation in `clusters/[id]/page.tsx:287` uses `Math.floor((Date.now() - new Date(ts).getTime()) / 60000)` inline — `timeAgo()` utility exists in `lib/time-utils.ts`.

---

## Agent 4: Packages (`packages/db/`, `config/`, `types/`, `ui/`)

### Duplications

- [🟡] `packages/db/src/schema/ai.ts:17` (`aiProviderEnum = ['openai', 'anthropic']`) vs `packages/types/src/ai-keys-contract.ts:3` (`aiKeyProviderSchema = ['openai', 'claude']`) — **Enum value mismatch:** schema says 'anthropic', types say 'claude'. Different names for same provider across schema and contract.
- [🟡] `packages/types/src/sse.ts:4` + `:134` — `PodEventType = 'added' | 'modified' | 'deleted'` and `ResourceChangeType = 'added' | 'modified' | 'deleted'` are identical union types defined twice.
- [🟡] `packages/config/src/sse.ts` + `cache.ts` — 30,000ms and 60,000ms values repeated 5+ times across SSE_HEARTBEAT_INTERVAL_MS, SSE_MAX_RECONNECT_DELAY_MS, CLUSTER_METRICS_POLL_INTERVAL_MS, etc.

### Hardcoded Values

- [🟡] `packages/db/src/schema/auth.ts:9-51` — Timestamp columns lack `{ withTimezone: true }` while all other schema files use it consistently.
- [🟡] `packages/db/src/schema/dashboard-layouts.ts:5` — Uses `$defaultFn(() => crypto.randomUUID())` while all other tables use `.defaultRandom()`. Inconsistent UUID generation.
- [🟡] `packages/db/src/schema/anomalies.ts:14` — `varchar('description', { length: 2000 })` hardcodes length. `LIMITS.DESCRIPTION_MAX = 2000` exists in config but isn't referenced.
- [🟡] `packages/db/src/schema/clusters.ts:28` — 500-char endpoint field. `LIMITS.ENDPOINT_MAX = 500` exists but schema doesn't reference it.

### Orphaned Code

- [🔴] `packages/db/src/schema/ai.ts:102-113` — `aiRecommendations` table exported but **zero usage** found in apps/api or apps/web. Completely orphaned.
- [🔴] `packages/db/src/schema/ai.ts:20-36` — `aiConversations` table exported but appears unused (replaced by aiThreads/aiMessages pattern).

### Inconsistencies

- [🟡] `packages/db/src/schema/auth.ts` — No timezone specification on timestamps vs all other schemas that use `{ withTimezone: true }`.
- [🟡] `packages/db/src/schema/events.ts:16` — ID not marked `.primaryKey()` inline; primary key defined separately. All other tables define it inline.
- [🟡] `packages/types/src/sse.ts` — Mix of TypeScript interfaces and string unions. No Zod validation schemas for SSE types, unlike ai-keys-contract and karpenter which use Zod.
- [🟡] `packages/config/src/index.ts` — Wildcard `export *` without explicit re-exports. Hard to see public API surface.
- [🟡] `packages/db/src/schema/authorization.ts:14-17` — Enum naming uses `relationEnum`, `subjectTypeEnum` (camelCase) while types use `AiProviderName` (PascalCase string union). No consistent pattern for enum definition.

---

## Agent 5: Cross-Cutting (Cross-Domain Issues)

### Cross-Domain Duplications

- [🟡] `apps/api/src/routers/deployments.ts:58-69` + `apps/api/src/lib/resource-mappers.ts:11-22` — `computeAge()` defined identically in both files. Router has local copy of already-exported function.
- [🟡] `apps/api/src/routers/deployments.ts:71-78` + `resource-mappers.ts:24-31` — `deriveImageVersion()` duplicated: local copy in router despite export in resource-mappers.
- [🟡] `apps/api/src/routers/deployments.ts:80-103` + `resource-mappers.ts:33-56` — `deriveDeploymentStatus()` logic duplicated as local `deriveStatus()`. Identical implementation, different names.
- [🟡] `apps/api/src/routers/deployments.ts:105-121` + `resource-mappers.ts:126-142` — `findLastUpdated()` logic present in both files.
- [🟡] `apps/web/src/lib/time-utils.ts:timeAgo()` + `apps/web/src/app/alerts/page.tsx:timeAgo()` — Function defined both in shared module and locally in alerts page (local version appears unused).

### Type/Contract Mismatches

- [🟡] `apps/api/src/routers/pods.ts:61-66` — `.output(z.object({ pods: z.array(z.any()) }))` uses `z.any()` for pods array. Breaks type contract — web consumer receives untyped data.
- [🟡] `apps/api/src/routers/deployments.ts:22-56` — `DeploymentInfo` interface + Zod schemas defined locally. Should be in `@voyager/types` since they're formal tRPC output contracts.
- [🟡] `apps/api/src/routers/deployments.ts:52` — Status enum `['Running', 'Pending', 'Failed', 'Scaling']` defined inline. Not centralized despite being used by both API and web.

### Config Centralization Gaps

- [🟡] `apps/web/src/config/constants.ts:SYNC_INTERVAL_MS` (30s) vs `packages/config/src/sse.ts:WATCH_DB_SYNC_INTERVAL_MS` (60s) — Server syncs at 60s but client polls at 30s. Potential misalignment.
- [🟡] `apps/web/src/lib/cluster-constants.ts` — `DB_CLUSTER_REFETCH_MS` (60s), `LIVE_CLUSTER_REFETCH_MS` (30s), `HEALTH_STATUS_REFETCH_MS` (60s) defined locally in web. Should use centralized packages/config.
- [🟡] `apps/web/src/config/constants.ts:STATS_LOOKBACK_MS` (48h) — Web-only constant with no corresponding API constant. If API uses different lookback, response mismatch possible.

### Import Chain Issues

- [🔵] No circular dependencies detected. Package direction is correct (apps → packages, never reverse).
- [🔵] Web correctly imports tRPC types from API via `@voyager/api/types` package export.

### Unused Shared Exports

- [🟡] `packages/config/src/ai.ts:AI_CONFIG` — Exported from packages/config but usage not found in apps/api or apps/web.

---

## Top Priority Actions

### Critical (Fix First)

| # | Finding | Location | Risk |
|---|---------|----------|------|
| 1 | `aiRecommendations` table is completely orphaned | `packages/db/src/schema/ai.ts:102-113` | Dead schema in DB, confusion risk |
| 2 | `aiConversations` table appears orphaned (replaced by threads/messages) | `packages/db/src/schema/ai.ts:20-36` | Dead schema in DB |
| 3 | 3x bootstrap user files duplicate same logic | `apps/api/src/lib/ensure-*-user.ts` | Maintenance drift risk |
| 4 | `parseCpuMillicores()`/`parseMemoryMi()` copy-pasted between pages | `pods/page.tsx` + `autoscaling/page.tsx` | Bug fix in one won't fix the other |
| 5 | `resource-store.ts` applyEvent/applyEvents 80% duplicated | `stores/resource-store.ts:54-148` | Core SSE pipeline — bugs from drift |
| 6 | `pods.ts` uses `z.any()` in output schema | `apps/api/src/routers/pods.ts:61-66` | Breaks type safety contract |
| 7 | AI provider enum mismatch: 'anthropic' vs 'claude' | `schema/ai.ts` vs `ai-keys-contract.ts` | Runtime mismatch possible |

### High Priority (Hardcoded Values)

| # | Finding | Scope | Count |
|---|---------|-------|-------|
| 8 | 30,000ms staleTime/refetchInterval hardcoded everywhere | `apps/web/src/` | 30 instances in 16 files |
| 9 | 60,000ms refetch intervals hardcoded | `apps/web/src/` | 4 instances |
| 10 | ConnectionLimiter(10, 50) hardcoded despite config constants | `routes/metrics-stream.ts`, `log-stream.ts` | 2 instances |
| 11 | LIMITS.LOG_TAIL_MAX/DEFAULT exist but not used | `routers/logs.ts` | 2 instances |
| 12 | Presence/watch/retention timing constants scattered in lib files | `apps/api/src/lib/` | 10+ values |
| 13 | deployments.ts re-invents 4 functions from resource-mappers.ts | `routers/deployments.ts` | 4 functions |

### Medium Priority (Inconsistencies)

| # | Finding | Scope |
|---|---------|-------|
| 14 | logAudit() try/catch wrapping inconsistent across routers | All API routers |
| 15 | Success response schema pattern varies (z.literal vs z.boolean vs none) | All API routers |
| 16 | Pagination pattern inconsistent (page/limit vs limit/offset) | audit.ts vs events.ts |
| 17 | Dialog state naming mixed (restartDialogOpen vs scaleOpen) | All resource pages |
| 18 | Data type interfaces scattered across pages instead of @voyager/types | 15+ pages |
| 19 | Timestamp timezone handling inconsistent in auth schema | packages/db/schema/auth.ts |
| 20 | UUID generation inconsistent (crypto.randomUUID vs .defaultRandom) | packages/db/schema/ |

### Low Priority (Info)

| # | Finding | Scope |
|---|---------|-------|
| 21 | Mock files (mock-karpenter.ts, mock-admin-api.ts) may be unused | apps/web/src/lib/ |
| 22 | k8s.ts helper functions only used in test mocks | apps/api/src/lib/k8s.ts |
| 23 | Tailwind class combinations repeated 15+ times | apps/web/src/components/ |
| 24 | PodEventType and ResourceChangeType are identical unions | packages/types/src/sse.ts |
| 25 | AI_CONFIG exported but possibly unused | packages/config/src/ai.ts |
