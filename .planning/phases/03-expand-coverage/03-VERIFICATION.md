---
phase: 03-expand-coverage
verified: 2026-03-30T19:00:00Z
status: human_needed
score: 6/7 must-haves verified
gaps:
human_verification:
  - test: "Navigate all 24 cluster tabs (Overview, Nodes, Pods, Deployments, Services, Namespaces, Events, Logs, Metrics, Autoscaling, Ingresses, StatefulSets, DaemonSets, Jobs, CronJobs, HPA, ConfigMaps, Secrets, PVCs, Helm, CRDs, RBAC, Network Policies, Resource Quotas) one by one on a live cluster"
    expected: "Every tab displays live data. Network Policies and Resource Quotas tabs show data from the Zustand store (no tRPC polling visible in Network tab). Helm tab shows release list derived from watched secrets."
    why_human: "Requires a live K8s cluster with resources across all 24 tab types. Cannot verify SSE data delivery and rendering correctness programmatically."
  - test: "Switch between two clusters (Cluster A then Cluster B) and observe the watch lifecycle"
    expected: "After switching, watches for Cluster A stop within 10 seconds (verified by GET /api/watches/health showing only Cluster B in activeWatches). Cluster A data is cleared from store (no stale flash)."
    why_human: "COVER-02 success criterion #3 and #4 require runtime observation of cluster switching and /api/watches/health response — cannot be verified statically."
  - test: "With 30 clusters registered, open only one cluster detail page. Call GET /api/watches/health."
    expected: "Response shows totalWatchedClusters=1, activeWatches contains only the viewed cluster, totalResourceTypes=17."
    why_human: "COVER-02 success criterion #4 (30-cluster scale) requires a populated database and a running API. Cannot simulate in static analysis."
  - test: "REQUIREMENTS.md COVER-02 checkbox is still unchecked ([ ]). After human verification confirms lifecycle behavior at scale, mark it [x]."
    expected: "COVER-02 marked complete in REQUIREMENTS.md."
    why_human: "Plan 01 SUMMARY claims COVER-02 complete, but REQUIREMENTS.md still shows it Pending. The implementation is present in code but has not been accepted/signed-off. Human must verify runtime behavior and update the requirements document."
---

# Phase 3: Expand Coverage Verification Report

**Phase Goal:** All 24 cluster tab resource types show live data, and watches are scoped to only the cluster the user is viewing
**Verified:** 2026-03-30T19:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WatchManager creates informers for network-policies and resource-quotas alongside existing 15 types | VERIFIED | `watch-manager.ts` lines 181-190 show 2 new RESOURCE_DEFS entries; grep confirms 17 `type:` entries total |
| 2 | SSE stream delivers network-policies and resource-quotas events to connected clients | VERIFIED | `resource-stream.ts` iterates `RESOURCE_DEFS` (line 152); all 17 types flow through automatically |
| 3 | GET /api/watches/health returns active cluster watch data and type count | VERIFIED | `watch-health.ts` calls `watchManager.getActiveClusterIds()` and `RESOURCE_DEFS.length`; returns `activeWatches`, `totalWatchedClusters`, `totalResourceTypes` |
| 4 | GET /api/watches/health is accessible without authentication | VERIFIED | `/api/watches/health` in `AUTH_BYPASS_PATHS` (routes.ts line 17) |
| 5 | subscribe -> unsubscribe -> stopAll lifecycle chain is correct for cluster-switch | VERIFIED | `watch-manager.ts`: `subscriberCount` incremented on subscribe (line 254), decremented on unsubscribe (line 362), informers stopped when count reaches 0 (line 363); `resource-stream.ts` calls `unsubscribe` on SSE close (line 192); `useResourceSSE.ts` calls `clearCluster` in cleanup (line 204) |
| 6 | Network policies and resource quotas tabs show live data from Zustand store without tRPC polling | VERIFIED | `network-policies/page.tsx` uses `useClusterResources('network-policies')`, no `trpc.networkPolicies`; `resource-quotas/page.tsx` uses `useClusterResources('resource-quotas')`, no `trpc.resourceQuotas` |
| 7 | COVER-02 runtime verified at 30-cluster scale (only viewed cluster has active watches) | NEEDS HUMAN | Implementation present in code; REQUIREMENTS.md still shows `[ ]` Pending; Plan 01 SUMMARY claims complete but no runtime confirmation documented |

**Score:** 6/7 truths verified (1 needs human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/types/src/sse.ts` | ResourceType union with 'network-policies' and 'resource-quotas' | VERIFIED | Lines 131-132 add both new types; union now has 17 members |
| `apps/api/src/lib/resource-mappers.ts` | mapNetworkPolicy() and mapResourceQuota() functions | VERIFIED | Lines 672 and 713; `_from` correctly used (not `from`) per K8s SDK constraint |
| `apps/api/src/lib/watch-manager.ts` | RESOURCE_DEFS entries for network-policies and resource-quotas | VERIFIED | Lines 181 and 187; mappers wired via `mappers.mapNetworkPolicy` and `mappers.mapResourceQuota` |
| `apps/api/src/routes/watch-health.ts` | GET /api/watches/health endpoint | VERIFIED | 22-line file; substantive implementation using `getActiveClusterIds()` and `RESOURCE_DEFS.length` |
| `apps/api/src/server.ts` | watch-health route registration | VERIFIED | Line 39 import, line 253 `await registerWatchHealthRoute(app)` |
| `packages/config/src/routes.ts` | AUTH_BYPASS_PATHS includes /api/watches/health | VERIFIED | Line 17 in AUTH_BYPASS_PATHS array |
| `apps/web/src/hooks/useHelmReleases.ts` | Hook deriving Helm releases from watched secrets | VERIFIED | 66-line file; filters `type === 'helm.sh/release.v1'` and `labels.owner === 'helm'`; groups by release name, keeps latest revision |
| `apps/web/src/app/clusters/[id]/network-policies/page.tsx` | Uses useClusterResources not tRPC | VERIFIED | Line 8 imports `useClusterResources`; line 52 calls with `'network-policies'`; no `trpc.networkPolicies` reference |
| `apps/web/src/app/clusters/[id]/resource-quotas/page.tsx` | Uses useClusterResources not tRPC | VERIFIED | Line 11 imports `useClusterResources`; line 73 calls with `'resource-quotas'`; no `trpc.resourceQuotas` reference |
| `apps/web/src/app/clusters/[id]/helm/page.tsx` | Uses useHelmReleases for list, HelmReleaseDetail for detail | VERIFIED | Line 8 imports `useHelmReleases`; line 6 imports `HelmReleaseDetail`; line 74 calls hook; no `trpc.helm.list` |
| `apps/web/src/app/clusters/[id]/page.tsx` | No tRPC DB fallback for nodes or events | VERIFIED | No `trpc.nodes.list` or `trpc.events.list` or `dbNodes`/`dbEvents` references; `trpc.anomalies.list` preserved (line 266) |
| `apps/web/src/app/clusters/[id]/events/page.tsx` | No tRPC DB fallback for events | VERIFIED | No `trpc.events.list` or `dbEvents` references |
| `apps/web/src/components/topology/TopologyMap.tsx` | refetchInterval for auto-refresh | VERIFIED | Line 68: `{ staleTime: 5000, refetchInterval: 5000 }` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/api/src/lib/watch-manager.ts` | `apps/api/src/lib/resource-mappers.ts` | `RESOURCE_DEFS mapper field` | WIRED | Lines 184, 190: `mappers.mapNetworkPolicy`, `mappers.mapResourceQuota` |
| `apps/api/src/routes/watch-health.ts` | `apps/api/src/lib/watch-manager.ts` | `watchManager.getActiveClusterIds()` | WIRED | Line 8 import; line 12 `watchManager.getActiveClusterIds()` |
| `packages/config/src/routes.ts` | `apps/api/src/routes/watch-health.ts` | AUTH_BYPASS_PATHS entry | WIRED | `/api/watches/health` at line 17 |
| `apps/web/src/app/clusters/[id]/network-policies/page.tsx` | `apps/web/src/stores/resource-store.ts` | `useClusterResources('network-policies')` | WIRED | Line 52; `useClusterResources` reads from Zustand store keyed by `${clusterId}:network-policies` |
| `apps/web/src/app/clusters/[id]/resource-quotas/page.tsx` | `apps/web/src/stores/resource-store.ts` | `useClusterResources('resource-quotas')` | WIRED | Line 73; same pattern |
| `apps/web/src/hooks/useHelmReleases.ts` | `apps/web/src/stores/resource-store.ts` | `useClusterResources('secrets') + filter` | WIRED | Line 31: `useClusterResources<SecretData>(clusterId, 'secrets')`; filtered by `helm.sh/release.v1` |
| `apps/web/src/app/clusters/[id]/helm/page.tsx` | `apps/web/src/hooks/useHelmReleases.ts` | import useHelmReleases | WIRED | Line 8 import; line 74 usage |
| `apps/api/src/routes/resource-stream.ts` | `apps/api/src/lib/watch-manager.ts` | `request.raw.on('close') -> unsubscribe` | WIRED | Line 188-192: on close calls `watchManager.unsubscribe(clusterId)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `network-policies/page.tsx` | `policies` (useClusterResources) | Zustand store ← SSE ← watch-manager informer (RESOURCE_DEFS entry line 181) | Yes — informer fetches from K8s networking.k8s.io/v1 API | FLOWING |
| `resource-quotas/page.tsx` | `quotas` (useClusterResources) | Zustand store ← SSE ← watch-manager informer (RESOURCE_DEFS entry line 187) | Yes — informer fetches from K8s /api/v1/resourcequotas | FLOWING |
| `helm/page.tsx` | `releases` (useHelmReleases) | Zustand store secrets ← SSE ← existing secrets informer; filtered by `helm.sh/release.v1` | Yes — derives from real watched secrets; chart name/version empty in list (by design; tRPC helm.get fills in detail view) | FLOWING |
| `TopologyMap.tsx` | `graphQuery.data` | tRPC topology.graph ← watchManager.getResources() server-side | Yes — reads from live informer data; `refetchInterval: 5000` keeps it current | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compilation (0 errors) | `pnpm typecheck` | 6 successful, 6 total (1 cache miss on web) | PASS |
| RESOURCE_DEFS has 17 entries | grep count of `type: '` in watch-manager.ts | 17 entries found | PASS |
| ResourceType union has 17 members | inspect sse.ts lines 115-132 | 17 members including `network-policies` and `resource-quotas` | PASS |
| watch-health route registered in server.ts | grep registerWatchHealthRoute | lines 39 (import) and 253 (registration) | PASS |
| AUTH_BYPASS_PATHS includes /api/watches/health | grep routes.ts | found at line 17 | PASS |
| All 4 task commits exist in git log | git log | bb66e87, d79aee1, 1a7af5f, 423b42f all present | PASS |
| GET /api/watches/health response at runtime | requires running API | N/A | SKIP (no running server) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| COVER-01 | 03-01, 03-02 | All watched types update in browser via live SSE without polling | SATISFIED | Overview and Events pages have no tRPC DB fallback for watched types; network-policies and resource-quotas read from Zustand |
| COVER-02 | 03-01 | Per-cluster on-demand watching — start on open, stop on leave (30-cluster scale) | PARTIAL | Lifecycle chain fully implemented in code (subscribe/unsubscribe/stopAll/clearCluster); REQUIREMENTS.md `[ ]` still unchecked; success criteria #3 and #4 require runtime verification at scale |
| COVER-03 | 03-01, 03-02 | Expand to all 24 cluster tab types | SATISFIED | network-policies and resource-quotas added to informers (17 types); Helm derived from secrets; topology auto-refreshes every 5s |

**COVER-02 discrepancy:** Plan 01 SUMMARY frontmatter claims `requirements-completed: [COVER-01, COVER-02, COVER-03]` but REQUIREMENTS.md still shows COVER-02 as `[ ]` Pending. The implementation is present and correct in code. The unchecked state reflects that runtime verification at 30-cluster scale and full functional QA (Phase Gate criterion #5) have not been signed off.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/hooks/useHelmReleases.ts` | 20-24 | `chartName: ''`, `chartVersion: ''`, `appVersion: ''` hardcoded empty | Info | By design — labels don't contain chart data; HelmReleaseDetail fills these via tRPC detail call. Not a stub. |

No blockers or warnings found. The empty chart fields in `useHelmReleases` are intentional (documented in code comment and SUMMARY) and do not prevent goal achievement.

### Human Verification Required

#### 1. Full 24-Tab Live Data QA

**Test:** Log in to the app, open a cluster with resources across all types, and navigate all 24 tabs (Overview, Nodes, Pods, Deployments, Services, Namespaces, Events, Logs, Metrics, Autoscaling, Ingresses, StatefulSets, DaemonSets, Jobs, CronJobs, HPA, ConfigMaps, Secrets, PVCs, Helm, CRDs, RBAC, Network Policies, Resource Quotas).

**Expected:** Every tab shows live data. Network Policies tab shows policies from Zustand (no tRPC polling requests visible in DevTools Network tab for `/trpc/networkPolicies.list`). Resource Quotas tab shows quotas from Zustand (same). Helm tab shows release list derived from secrets. No console errors on any tab.

**Why human:** Requires a running K8s cluster with resources deployed across all 24 types. Cannot verify data delivery or rendering correctness statically.

#### 2. Cluster Switch — Watch Lifecycle Verification (COVER-02 criteria #3)

**Test:** Open Cluster A, wait 5 seconds, then navigate to Cluster B. After 10 seconds, call `GET /api/watches/health`.

**Expected:** `activeWatches` contains only Cluster B. Cluster A is absent. No stale data from Cluster A visible in Cluster B's tabs.

**Why human:** Requires a running API with multiple registered clusters and real SSE connections to observe the lifecycle in action.

#### 3. 30-Cluster Scale Watch Scoping (COVER-02 criterion #4)

**Test:** With 30+ clusters registered in the database, open only one cluster detail page. Call `GET /api/watches/health`.

**Expected:** `totalWatchedClusters: 1`, `activeWatches` has exactly 1 entry, `totalResourceTypes: 17`.

**Why human:** Requires a seeded database with 30 clusters. Cannot simulate programmatically.

#### 4. Mark COVER-02 Complete in REQUIREMENTS.md

**Test:** After tests #2 and #3 pass, update `.planning/REQUIREMENTS.md` line 29 from `- [ ] **COVER-02**` to `- [x] **COVER-02**` and update the tracking table at line 71 from `Pending` to `Complete`.

**Expected:** REQUIREMENTS.md accurately reflects the implemented and verified state.

**Why human:** Decision to sign off on a requirement must be made by a human after runtime confirmation — not by the implementer or automated verifier.

### Gaps Summary

No blocking gaps exist. All artifacts are present, substantive, wired, and data flows correctly through the full pipeline. TypeScript compilation passes with 0 errors across all packages. All 4 commits are present in git history.

The sole outstanding item is COVER-02 runtime sign-off. The lifecycle implementation (per-cluster reference counting, SSE disconnect cleanup, Zustand store clearing) is fully correct in code. The requirement is marked Pending in REQUIREMENTS.md because success criteria #3 (cluster switch observed in 10s), #4 (30-cluster scale via health endpoint), and #5 (Phase Gate: full functional QA of all 24 tabs) require human execution against a live system.

---

_Verified: 2026-03-30T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
