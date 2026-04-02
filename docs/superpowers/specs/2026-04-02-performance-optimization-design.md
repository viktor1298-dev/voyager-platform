# Performance Optimization — Design Spec

**Date:** 2026-04-02
**Goal:** Make voyager-platform as fast and smooth as Lens and Rancher Desktop by eliminating verified performance bottlenecks across frontend rendering, SSE pipeline, backend API, bundle size, and network loading.

**Constraint:** Every change must be safe — no breaking changes, no behavioral regressions. Each fix is independently deployable.

---

## Phase A — Quick Wins (1-2 hours)

Low-risk, high-certainty fixes that immediately improve perceived performance. Each is a 1-15 minute change.

### A1. LiveTimeAgo Single Shared Interval
**File:** `apps/web/src/components/shared/LiveTimeAgo.tsx`
**Problem:** Each `<LiveTimeAgo>` instance runs its own `setInterval(1000)`. With 200+ instances on a pods page, that's 200 independent microtasks/second, each scheduling a separate React reconciliation.
**Fix:** Create a `TimeAgoProvider` with a single interval. `LiveTimeAgo` consumes context instead of running its own timer. React 19 batches all context-driven re-renders into one commit per tick.
**Verification:** Count `setInterval` calls before/after. Confirm all time labels still update every second.

### A2. Remove Redundant `incrementTick()` from SSE Flush
**File:** `apps/web/src/hooks/useResourceSSE.ts` (line ~106)
**Problem:** `flushBuffer()` calls `incrementTick()` after updating the resources Map. Since `applyEvents` creates a new top-level Map via `new Map(state.resources)`, Zustand already notifies subscribers. The extra tick causes a second re-render cycle for every resource consumer.
**Fix:** Remove the `incrementTick()` call from `flushBuffer()`. The 5-second `useResourceTick` interval is sufficient for time label refresh.
**Pre-condition:** Before removing, verify via React DevTools Profiler that `applyEvents` alone (without the tick) triggers re-renders in `useClusterResources` consumers. If not, keep the tick.
**Dependency:** If C2 (normalize resource store) is also implemented, re-evaluate whether tick removal is safe with the new Map-of-Maps structure. C2 must ensure a new outer Map reference is created on every mutation for Zustand change detection.
**Verification:** SSE events still update UI. Time labels still refresh every 5s. No double-render in React DevTools Profiler. Test with a live cluster — verify pod status changes appear immediately.

### A3. K8s Events Debounce at WatchManager
**File:** `apps/api/src/routes/resource-stream.ts` or emitter layer
**Problem:** K8s `events` resource type fires 10+ watch events/second during deployments. Each immediately becomes an SSE frame. Informational events don't need sub-second delivery.
**Fix:** Add 500ms debounce for the `events` resource type only. Accumulate events during the window, emit as a batch. Other resource types (pods, nodes, deployments) remain unbatched for operational responsiveness.
**Verification:** Events still appear on the events page within 1 second. Pod/node updates remain real-time.

### A4. Hoist TooltipProvider Out of Pod Rows
**File:** `apps/web/src/app/clusters/[id]/pods/page.tsx`
**Problem:** Each `PodSummary` creates 1-2 `TooltipProvider` instances. With 300 pods = 600 Radix context instances.
**Fix:** Move one `<TooltipProvider>` to wrap the entire pods list at the `PodsPage` level. All `Tooltip` components inherit from the shared provider.
**Verification:** Tooltips on Exec/Delete buttons still work. Hover delay behavior unchanged.

### A5. AnimatedList Default `layout=false`
**File:** `apps/web/src/components/animations/AnimatedList.tsx`
**Problem:** `layout={true}` default causes Motion's FLIP algorithm on every list change — `getBoundingClientRect()` on all items. For SSE-driven lists, this causes jank.
**Fix:** Change default from `layout = true` to `layout = false`. Callers that explicitly want layout animation can opt in.
**Verification:** Lists still animate entry/exit. Items no longer slide-animate position on reorder (acceptable — reorder animation was causing jank anyway).

### A6. Fix `preconnect` Missing `crossOrigin`
**File:** `apps/web/src/app/layout.tsx`
**Problem:** `<link rel="preconnect">` without `crossOrigin="use-credentials"` creates a non-credentialed TCP connection that browsers can't reuse for authenticated tRPC/auth requests.
**Fix:** Add `crossOrigin="use-credentials"` attribute. Add `<link rel="dns-prefetch">` fallback.
**Verification:** Browser DevTools Network tab shows connection reuse for first tRPC request.

### A7. AppLayout CSS Transition Instead of Motion `marginLeft`
**File:** `apps/web/src/components/AppLayout.tsx`
**Problem:** `motion.main` animates `marginLeft` via spring animation — this is a layout property that triggers browser reflow every frame (~40-60 frames per sidebar toggle).
**Fix:** Replace Motion spring animation with CSS `transition-[margin-left] duration-200 ease-out`, matching the sidebar's existing CSS transition. Remove the `motion.main` wrapper.
**Verification:** Sidebar toggle still animates smoothly. No layout jank during animation.

### A8. Replace Motion `boxShadow` Glow with CSS on ResourceStatusBadge
**File:** `apps/web/src/components/shared/ResourceStatusBadge.tsx`
**Problem:** Critical/fatal status badges run infinite `boxShadow` keyframe animations via `motion.span` (`resourceStatusGlow` variants). `box-shadow` triggers paint (not composite) on every animation frame. With 50 critical pods, that's 50 independent JS-driven paint-triggering animations.
**Note:** ClusterCard already uses CSS for hover shadow (`hover:[box-shadow:var(--shadow-card-hover)]`), not Motion — no change needed there.
**Fix:** Replace the `motion.span` glow wrapper with a plain `<span>` using the existing CSS `animate-glow-critical` class pattern (already defined in globals.css for `StatusDot`). Add `animate-glow-fatal` if not present.
**Verification:** Glow animations still pulse on critical/fatal badges. GPU usage drops during animation.

### A9. RelationsTab `refetchOnWindowFocus: false`
**File:** `apps/web/src/components/resource/RelationsTab.tsx`
**Problem:** `refetchOnWindowFocus: true` with 10 expanded cards = 10 parallel requests on every tab switch.
**Fix:** Change to `refetchOnWindowFocus: false` matching YamlViewer and ResourceDiff patterns.
**Verification:** Relations data still loads when tab is opened. No refetch storm on window focus.

---

## Phase B — Bundle Diet (~590KB saved)

Remove dead weight and lazy-load heavy libraries that aren't needed on initial page load.

### B1. Replace `@iconify-json/simple-icons` with Inline SVGs (~320KB)
**Files:** `apps/web/src/components/ProviderLogo.tsx`, `apps/web/src/app/clusters/[id]/page.tsx` (also uses `Icon`)
**Problem:** Full 2,900-icon Simple Icons collection bundled for ~10 unique icons used.
**Fix:** Create `src/components/icons/provider-icons.tsx` with ~10 inline SVG components (K8s, AWS, GCP, Azure, Docker, DigitalOcean, Rancher, K3s, file-cog, and any others found via grep for `Icon` from `@iconify/react`). Update all import sites. Uninstall `@iconify-json/simple-icons` and `@iconify/react`.
**Pre-step:** Grep for all `@iconify/react` imports to ensure no usage sites are missed.
**Verification:** All provider logos render correctly on cluster cards and detail pages. `pnpm build` succeeds. No runtime errors from missing icons.

### B2. Lazy-Load `@xyflow/react` + dagre (~220KB)
**Files:** `TopologyMap.tsx` (used in cluster overview), `NetworkPolicyGraph.tsx` (used in network-policies page)
**Problem:** React Flow + dagre imported statically. Loaded for every cluster page visit even when topology isn't visible.
**Fix:** Wrap both in `next/dynamic({ ssr: false })` with skeleton loading placeholders. Keep the static imports inside the component files — `next/dynamic` creates the chunk boundary.
**Verification:** Topology map still renders when `effectiveIsLive` is true. Network policy graph still renders in graph mode. Chunk appears in DevTools Network only when component mounts.

### B3. Remove `react-grid-layout` Phantom Dependency (~25KB)
**File:** `apps/web/package.json`
**Problem:** Listed as dependency, imported nowhere. Dashboard page shows "Coming Soon".
**Fix:** Remove from `package.json`. Run `pnpm install`.
**Verification:** `pnpm build` succeeds. No import errors.

### B4. Move `@voyager/api` to devDependencies
**File:** `apps/web/package.json`
**Problem:** Only used as `import type`. Having it in runtime `dependencies` may confuse bundler tree-shaking.
**Fix:** Move from `dependencies` to `devDependencies`.
**Verification:** `pnpm build` succeeds. `pnpm typecheck` passes.

### B5. Lazy-Load TerminalDrawer (~12KB)
**File:** `apps/web/src/components/providers.tsx`
**Problem:** Terminal scaffolding code included in root bundle. Renders `null` until a session is opened.
**Fix:** Wrap in `next/dynamic({ ssr: false })`. Keep inside `TerminalProvider` wrapper.
**Verification:** Terminal still opens when clicking Exec button. No flash or layout shift.

### B6. Lazy-Load yaml Package in Helm/YAML Components (~14KB)
**Files:** `YamlViewer.tsx`, `HelmReleaseDetail.tsx`, `HelmRevisionDiff.tsx`
**Problem:** `yaml` package loaded eagerly in cluster detail chunk even though YAML/Diff tabs are only shown when user clicks them.
**Fix:** Wrap `YamlViewer` and `ResourceDiff` usage sites in `next/dynamic`. The components themselves keep their `yaml` import — the dynamic wrapper creates the chunk boundary.
**Verification:** YAML tab content loads when clicked. Diff tab renders correctly.

---

## Phase C — Core Performance (Lens-Level Changes)

These are the changes that make the app feel fundamentally faster at scale.

### C1. Virtual Scrolling with `@tanstack/react-virtual`
**Targets:** LogViewer (10K lines), events page, pods page, nodes page
**Problem:** All lists render every item unconditionally. LogViewer renders up to 10,000 `<LogLine>` components. Pods page renders 500+ `ExpandableCard` nodes.
**Fix:**
1. Install `@tanstack/react-virtual`
2. **LogViewer first** (simplest — flat list, uniform height): Replace `lines.map()` with `useVirtualizer`. The `scrollRef` already exists.
3. **Events page** (flat list within `ResourcePageScaffold`): Virtualize the card list.
4. **Pods page** (grouped by namespace, variable height due to expandable cards): Virtualize within each `NamespacePodGroup`. Track expanded state via `Set<string>` at page level so virtualizer can estimate heights.
5. **Nodes page** (table rows with expandable detail): Use `measureElement` for variable-height table rows.
**Verification:** Scroll through 1000+ items without jank. Expanded cards maintain state when scrolled out and back. Search + highlight still works (scroll-to-item via `scrollToIndex`).

### C2. Normalize Resource Store to O(1) Mutations
**File:** `apps/web/src/stores/resource-store.ts`
**Problem:** `applyEvents` uses O(n) array operations per event. On a 500-pod cluster, each batch of 20 events = 10,000 comparisons.
**Fix:** Change internal representation from `Map<string, unknown[]>` to `Map<string, Map<string, unknown>>` where inner key is `${namespace}/${name}`. Then:
- ADDED: `innerMap.set(key, event.object)` — O(1)
- MODIFIED: `innerMap.set(key, event.object)` — O(1)
- DELETED: `innerMap.delete(key)` — O(1)

**Critical: Zustand change detection.** Every mutation must create a new outer `Map` reference (same pattern as current `new Map(state.resources)`). Inner Map mutations alone won't trigger Zustand subscriber notifications. Clone the outer Map on every `applyEvents` call.

**Migration paths:**
- `applyEvents`: Build new inner Map via O(1) operations, wrap in new outer Map
- `setResources` (snapshot): Convert incoming `unknown[]` array to `Map<string, unknown>` by iterating and keying by `${namespace}/${name}`
- `clearCluster`: Delete the outer Map entry (same as current)

Expose `[...innerMap.values()]` via selector for consumers that need arrays. Update `useClusterResources` selector to convert Map values to array.
**Dependency:** If A2 (tick removal) was already applied, verify that the new Map-of-Maps structure still triggers Zustand re-renders without the tick. The outer Map clone guarantees this, but must be tested.
**Verification:** All resource pages render correctly. SSE events apply instantly. No missing/duplicate resources. Run existing resource-store tests (8 test cases). Verify `setResources` (snapshot on connect) still works.

### C3. Cache `metrics.currentStats` with Redis
**File:** `apps/api/src/routers/metrics.ts`
**Problem:** Dashboard's `currentStats` makes N×3 live K8s API calls on every load. No caching.
**Fix:** Wrap the entire computation in `cached('metrics:currentStats', 15, async () => { ... })`. The 15s TTL matches the metrics stream polling interval. Singleflight deduplication prevents cache stampede.
**Verification:** Dashboard loads in <500ms instead of 1-3s. Data is at most 15s stale (acceptable for overview).

### C4. Port `resourceUsage` to TimescaleDB `time_bucket()`
**File:** `apps/api/src/routers/metrics.ts`
**Problem:** Fetches up to 50K rows into Node.js for JavaScript bucketing. Other metrics endpoints already use `time_bucket()`.
**Fix:** Replace `db.select().from(metricsHistory)` + JS bucketing with a `db.execute(sql\`SELECT time_bucket(...) ... GROUP BY bucket\`)` query matching the pattern in `metrics.history`.
**Verification:** Resource usage chart renders identical data. No empty gaps. Compare results against the JS implementation for one time range before removing it.

### C5. Replace `computeAge()` with `createdAt` in SSE Payload
**Files:** `apps/api/src/lib/resource-mappers.ts` (all mappers), ~9 frontend pages
**Problem:** `age` field computed once on watch event, baked into payload. Goes stale immediately. Frontend renders the stale string directly (not via `<LiveTimeAgo>`).
**Important:** Only 6 of 15 mappers already have a `createdAt` field (mapPod, mapService, mapNamespace, mapIngress, mapNetworkPolicy, mapResourceQuota). The other 9 mappers (mapDeployment, mapConfigMap, mapSecret, mapPVC, mapStatefulSet, mapDaemonSet, mapJob, mapCronJob, mapHPA) have `age` but NO `createdAt`.
**Fix (coordinated cross-layer change):**
1. **API mappers:** For the 9 mappers missing `createdAt`, ADD `createdAt: metadata?.creationTimestamp ?? null` to the return object. Then remove `age: computeAge(...)` from ALL 15 mappers.
2. **Frontend pages:** In every page that renders `{resource.age}`, replace with `<LiveTimeAgo date={resource.createdAt} />`.
3. **Types:** Update any shared TypeScript types that include `age: string` to include `createdAt: string | null` instead.
**Pre-step:** Grep for all `resource.age` and `.age` render sites across `apps/web/src/` to build the complete list of frontend changes needed.
**Verification:** All resource tables show live-updating age labels. No frozen "5m" values. No `undefined` renders. `pnpm typecheck` passes.

---

## Phase D — Backend & Infrastructure

### D1. Nginx SSE Proxy Timeout
**File:** `charts/voyager/templates/ingress.yaml`, `charts/voyager/values.yaml`
**Fix:** Add `proxy-read-timeout` and `proxy-send-timeout` as templated values in `values.yaml` (default: `"3600"`), referenced in the ingress template via `{{ .Values.ingress.annotations }}`. Do NOT hardcode in the template — follow Helm chart conventions for environment-specific overrides.
**Verification:** SSE connections stay alive beyond 60 seconds in production. Values are overridable per environment.

### D2. PodDetail Tabs Memoization
**File:** `apps/web/src/app/clusters/[id]/pods/page.tsx`
**Fix:** Wrap `tabs` array in `useMemo([pod, clusterId])`. Change `DetailTabs` to accept `renderContent: () => ReactNode` for lazy tab content mounting.
**Verification:** YAML/Diff tabs still load on click. Pod detail re-renders only when pod data changes.

### D3. Alert Evaluator N+1 Fix
**File:** `apps/api/src/jobs/alert-evaluator.ts`
**Problem:** `isDuplicate()` runs one DB query per alert inside the loop. The cluster list query also runs per alert (for global alerts without `clusterFilter`). K8s metric gathering is already parallelized via `Promise.allSettled`.
**Fix:** Hoist both the active clusters query and the dedup check outside the per-alert loop. One query for active clusters, one batch `inArray()` query for recent alert history covering all alert IDs.
**Verification:** Alerts still evaluate correctly. DB query count drops from N dedup + N cluster queries to 2 total.

### D4. Metrics Router JOIN Optimization
**File:** `apps/api/src/routers/metrics.ts`
**Fix:** Replace two-query pattern in `uptimeHistory` and `aggregatedMetrics` with single JOIN queries.
**Verification:** Both endpoints return identical data. Response time drops by one DB round-trip.

### D5. Snapshot Event Loop Yield
**File:** `apps/api/src/routes/resource-stream.ts`
**Fix:** Add `await new Promise(resolve => setImmediate(resolve))` between resource type snapshots.
**Verification:** SSE snapshots still arrive completely. Other SSE heartbeats not delayed during reconnect storms.

### D6. Log Stream Backpressure
**File:** `apps/api/src/routes/log-stream.ts`
**Fix:** Add `pause()`/`drain` pattern when `reply.raw.write()` returns false.
**Verification:** Log streaming works normally. Memory doesn't grow unbounded with slow clients.

### D7. Replay Buffer Cleanup on Disconnect
**File:** `apps/api/src/routes/resource-stream.ts`
**Fix:** Listen for `watch-status:disconnected` events and delete the cluster's replay buffer and event counter.
**Verification:** Memory footprint stabilizes after clusters disconnect. Reconnects still work (fall through to full snapshot).

### D8. Watch-DB-Writer Narrow SELECT
**File:** `apps/api/src/lib/watch-db-writer.ts`
**Fix:** Fetch only `status` and `provider` columns. Fetch `connectionConfig` JSONB only when provider detection is actually needed.
**Verification:** Health sync still works. Provider detection still functions for kubeconfig-type clusters.

### D9. Metrics Job — Use WatchManager Pod Cache
**File:** `apps/api/src/jobs/metrics-stream-job.ts`
**Fix:** Replace `coreApi.listPodForAllNamespaces()` with `watchManager.getResources(clusterId, 'pods')?.length`.
**Verification:** Pod count in metrics still correct. One fewer K8s API call per poll cycle.

### D10. Authorization Parallel Queries
**File:** `apps/api/src/lib/authorization.ts`
**Fix:** Run `getUserRole()` and `getUserTeamIds()` in parallel with `Promise.all()`.
**Verification:** Authorization checks still pass. Response time drops by one DB round-trip.

### D11. Add HTTP Cache Headers to Read-Only tRPC
**File:** `apps/api/src/server.ts`
**Fix:** Add `onSend` hook for GET tRPC requests: `Cache-Control: private, max-age=10, stale-while-revalidate=30` with `Vary: Cookie` header. Use shorter TTL (10s) to minimize stale RBAC data window. Explicitly exempt: mutations, auth endpoints (`/api/auth/*`), and RBAC-sensitive queries that use `authorizedProcedure`.
**Risk note:** With Better-Auth cookie sessions, if a user's role changes within the cache window, stale authorized data could be served. The `Vary: Cookie` header ensures cache is per-session. The 10s max-age limits the staleness window.
**Verification:** Browser caches tRPC responses. Hard refresh still fetches fresh data. Role changes take effect within 10s.

---

## What NOT to Change

These are architectural choices that are already correct:
- SSE over WebSocket for watch data (unidirectional, simpler, HTTP/2 multiplexed)
- Single SSE connection per cluster (already multiplexed)
- Informer ObjectCache as primary data source
- 60-second grace period on unsubscribe
- Adaptive batch flush (20 events OR 1s)
- SSE resume via `lastEventId`
- Redis singleflight in `cached()`
- ClusterClientPool with proactive token refresh
- LTTB downsampling for charts
- `LazyMotion` with `domAnimation`

---

## Success Criteria

- **Bundle size:** Reduce initial JS payload by ~590KB gzipped
- **Dashboard load:** <500ms (currently 1-3s due to uncached metrics)
- **500-pod cluster pods page:** No jank when scrolling (virtual scrolling + O(1) store)
- **SSE event processing:** O(1) per event instead of O(n)
- **LogViewer at 10K lines:** Smooth 60fps scrolling (virtual scrolling)
- **Production SSE stability:** No 60-second forced reconnects (nginx timeout fix)
- **Zero regressions:** All existing features work identically
