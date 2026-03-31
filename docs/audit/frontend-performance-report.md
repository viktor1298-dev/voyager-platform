# Frontend Performance & Stability Audit

**Date:** 2026-03-31
**Scope:** `apps/web/src/` -- 276 TypeScript/TSX files
**Auditor:** Claude Opus 4.6 (automated deep audit)

---

## Executive Summary

The Next.js frontend is architecturally sound with several well-implemented patterns: SSE with exponential backoff, rAF-throttled crosshairs, Zustand with selector subscriptions, and batched event flushing. However, the audit identified **28 issues** across performance, memory, error handling, bundle size, and accessibility categories.

**Critical (3)** | **High (8)** | **Medium (11)** | **Low (6)**

---

## 1. Performance Issues

### P-01: useClusterResources 1-second re-render storm [CRITICAL]

**File:** `hooks/useResources.ts`, line 24
**Description:** Every component that calls `useClusterResources` gets a `setInterval(() => setTick(t => t + 1), 1_000)` -- a forced re-render every 1 second. With 21 consuming pages (46 call sites total, some pages call it 2-5 times), this creates a cascade of unnecessary re-renders across the entire cluster detail view. A page with 5 resource types (overview page) fires 5 independent 1s timers, each triggering its own React reconciliation.

**Why it matters:** On a cluster with 200+ pods, each 1-second tick forces React to diff the entire pod list even when no data changed. The stated purpose is to update relative time labels ("3s ago"), but re-rendering the entire resource list to update a timestamp is disproportionate.

**Suggested fix:** Remove the per-hook 1s timer. Instead, use a single global 5s tick via the existing `useResourceTick()` (which already runs in the cluster layout) combined with Zustand's `tick` field. Each consuming component that needs relative time labels should subscribe to `tick` via a separate `useResourceStore(s => s.tick)` selector, and memoize the resource data separately. This reduces N independent 1s timers to one 5s timer.

```
// Instead of per-hook setInterval:
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  useResourceStore(s => s.tick) // subscribe to global tick for re-renders
  return useResourceStore(
    useCallback(s => (s.resources.get(`${clusterId}:${type}`) ?? EMPTY) as T[], [clusterId, type])
  )
}
```

---

### P-02: TopologyMap and NetworkPolicyGraph poll every 5 seconds [HIGH]

**File:** `components/topology/TopologyMap.tsx`, line 68
**File:** `components/network/NetworkPolicyGraph.tsx`, line 108

**Description:** Both graph components use `refetchInterval: 5000` for their tRPC queries. Given that SSE already pushes real-time resource updates to the Zustand store, these graphs should derive their data from the live store rather than polling the API every 5 seconds. Each poll triggers a full dagre layout recalculation.

**Suggested fix:** Derive topology/network data from `useClusterResources` or add a dedicated tRPC subscription. If the API endpoint performs server-side graph building that can't be done client-side, increase `refetchInterval` to 30s and add a manual refresh button.

---

### P-03: react-diff-viewer-continued loaded eagerly [HIGH]

**File:** `components/resource/ResourceDiff.tsx`, line 7
**File:** `components/helm/HelmRevisionDiff.tsx`, line 7

**Description:** `react-diff-viewer-continued` is a heavy dependency (~80KB gzipped) imported at module top-level. It is only used when a user expands a resource's Diff tab or views Helm revision comparisons. Every page that imports `ResourceDiff` (via barrel re-export from `components/resource/index.ts`) pulls this into the bundle.

**Suggested fix:** Use `next/dynamic` or `React.lazy` to split the diff viewer:
```tsx
const ReactDiffViewer = dynamic(() => import('react-diff-viewer-continued'), { ssr: false })
```

---

### P-04: react-grid-layout not in optimizePackageImports [MEDIUM]

**File:** `next.config.ts`, line 18

**Description:** `optimizePackageImports` includes `lucide-react`, `recharts`, `@iconify/react`, `@xyflow/react` but not `react-grid-layout`. While the DashboardGrid dynamically imports it (good), the CSS import inside the dynamic callback is a side-effect import that may cause issues with code splitting.

**Suggested fix:** Add `react-grid-layout` to `optimizePackageImports`. Also consider moving the CSS import to a top-level `import()` in the same dynamic chunk.

---

### P-05: LogViewer unbounded sseLines array [HIGH]

**File:** `components/logs/LogViewer.tsx`, line 113

**Description:** The SSE log handler appends to `sseLines` via `setSseLines(prev => [...prev, line])` with no upper bound. During a long follow session on a verbose pod, this array grows without limit, causing increasing memory pressure and slower React renders.

**Suggested fix:** Cap the array at a maximum size (e.g., 10,000 lines), trimming from the front:
```tsx
setSseLines(prev => {
  const next = [...prev, line]
  return next.length > 10_000 ? next.slice(-10_000) : next
})
```

---

### P-06: PodLogStream mock timer uses random interval [LOW]

**File:** `components/PodLogStream.tsx`, lines 63-65

**Description:** The mock log stream uses `setInterval(() => {...}, 800 + Math.random() * 1200)`. The random component is evaluated once at `setInterval` creation time, so the interval is fixed -- but the pattern is misleading and could cause confusion during future refactoring.

**Suggested fix:** Use a fixed interval or use `setTimeout` recursively with jitter for actual random timing. This is a mock component, so low priority.

---

### P-07: Barrel file re-exports pull in heavy components [MEDIUM]

**File:** `components/resource/index.ts`

**Description:** The barrel file re-exports `ResourceDiff` and `YamlViewer` alongside lightweight components like `SearchFilterBar` and `NamespaceGroup`. Any page importing `{ SearchFilterBar } from '@/components/resource'` also gets the full `react-diff-viewer-continued` and `yaml` packages in its chunk (unless Next.js tree-shaking eliminates them, which is not guaranteed for side-effectful imports).

**Suggested fix:** Split the barrel file into two: `@/components/resource/index.ts` for lightweight components, and import heavy components (`ResourceDiff`, `YamlViewer`) directly from their files, or use `next/dynamic` at the consumption point.

---

### P-08: AnimatePresence on every tab switch in cluster layout [MEDIUM]

**File:** `app/clusters/[id]/layout.tsx`, lines 201-211

**Description:** `AnimatePresence mode="wait"` wraps children with `key={pathname}`. Every tab switch triggers exit animation + enter animation. With `mode="wait"`, the old tab must fully exit before the new tab mounts, adding perceived latency to navigation. For a K8s dashboard where users rapidly switch between tabs, this creates unnecessary delay.

**Suggested fix:** Remove `mode="wait"` and use `mode="popLayout"` or remove AnimatePresence entirely in favor of instant tab switches. If animation is desired, use `mode="sync"` for crossfade.

---

### P-09: Settings page 1-second sync timer [LOW]

**File:** `app/settings/page.tsx`, line 231

**Description:** A `setInterval(..., 1_000)` updates a formatted time label every second. This is a minor issue since it's a single component on one page, but it's unnecessary -- the label only needs updating when the sync actually happens.

**Suggested fix:** Update `lastSyncLabel` only on actual sync events, not on a 1s poll.

---

## 2. Memory Leaks

### M-01: DashboardGrid ResizeObserver not properly cleaned up [HIGH]

**File:** `components/dashboard/DashboardGrid.tsx`, lines 77-85

**Description:** The `containerRef` callback creates a `ResizeObserver` and returns a cleanup function (`return () => ro.disconnect()`), but callback refs do NOT support return-value cleanup. The returned function is silently ignored by React. The ResizeObserver is never disconnected.

```tsx
const containerRef = useCallback((node: HTMLDivElement | null) => {
  if (!node) return
  setContainerWidth(node.offsetWidth)
  const ro = new ResizeObserver(([entry]) => {
    if (entry) setContainerWidth(entry.contentRect.width)
  })
  ro.observe(node)
  return () => ro.disconnect() // <-- NEVER CALLED
}, [])
```

**Suggested fix:** Use `useRef` + `useEffect` pattern instead of a callback ref, or store the observer in a ref and disconnect in the `!node` branch:
```tsx
const roRef = useRef<ResizeObserver | null>(null)
const containerRef = useCallback((node: HTMLDivElement | null) => {
  if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
  if (!node) return
  setContainerWidth(node.offsetWidth)
  const ro = new ResizeObserver(([entry]) => {
    if (entry) setContainerWidth(entry.contentRect.width)
  })
  ro.observe(node)
  roRef.current = ro
}, [])
```

---

### M-02: FilterBar debounce timer not cleared on unmount [MEDIUM]

**File:** `components/FilterBar.tsx`, lines 54, 137

**Description:** `debounceRef` holds a `setTimeout` ID but there is no cleanup `useEffect` to clear it on unmount. If the user navigates away while typing, the timeout fires after the component is unmounted, calling `updateParams` which calls `router.replace` on a potentially stale context.

**Suggested fix:** Add cleanup:
```tsx
useEffect(() => {
  return () => { clearTimeout(debounceRef.current) }
}, [])
```

---

### M-03: AI assistant store grows unboundedly with persist [MEDIUM]

**File:** `stores/ai-assistant.ts`

**Description:** The `chatByCluster` record is persisted to localStorage and grows without limit as users interact with AI across different clusters. Each message includes full content strings. Over weeks of use, this could grow to megabytes in localStorage.

**Suggested fix:** Add a max message count per cluster (e.g., 100 messages) and trim old messages during `appendMessage`. Add a `version` field to the persist config for migration.

---

### M-04: CrosshairProvider rAF not cancelled on unmount [LOW]

**File:** `components/metrics/CrosshairProvider.tsx`, line 29

**Description:** The `requestAnimationFrame` scheduled in `setPosition` may fire after the component unmounts. While this is unlikely to cause visible issues (React ignores state updates on unmounted components with a warning), it's a minor leak.

**Suggested fix:** Add a cleanup effect that cancels any pending rAF:
```tsx
useEffect(() => {
  return () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }
}, [])
```

---

## 3. Error Boundary Coverage

### E-01: No ErrorBoundary wrapping cluster detail children [HIGH]

**File:** `app/clusters/[id]/layout.tsx`

**Description:** The cluster layout does NOT wrap its `{children}` in an `<ErrorBoundary>`. If any individual tab page throws during render (e.g., bad data shape from SSE, malformed YAML parse), the entire cluster view crashes up to the root `error.tsx` boundary. Users lose all tab context and must re-navigate.

The `ErrorBoundary` component exists at `components/ErrorBoundary.tsx` but is only used in the `QueryError` export pattern (for tRPC errors), never as a React Error Boundary wrapper around page regions.

**Suggested fix:** Wrap `{children}` in the cluster layout with `<ErrorBoundary>`:
```tsx
<ErrorBoundary fallback={<div>Tab failed to render. Try another tab.</div>}>
  {children}
</ErrorBoundary>
```

---

### E-02: No ErrorBoundary on dashboard widgets [MEDIUM]

**File:** `components/dashboard/DashboardGrid.tsx`, line 133

**Description:** Individual dashboard widgets are not wrapped in error boundaries. If one widget throws (e.g., `ClusterHealthWidget` receives unexpected data), the entire dashboard grid crashes. Each `WidgetWrapper` should catch errors independently.

**Suggested fix:** Wrap each widget render in `<ErrorBoundary>` with a per-widget fallback UI.

---

### E-03: No ErrorBoundary on topology/network graphs [MEDIUM]

**Files:** `components/topology/TopologyMap.tsx`, `components/network/NetworkPolicyGraph.tsx`

**Description:** React Flow components can throw on malformed node/edge data. Neither graph component has an error boundary. A single bad edge reference crashes the entire tab.

**Suggested fix:** Wrap `<ReactFlow>` in `<ErrorBoundary>`.

---

### E-04: Missing loading.tsx for cluster detail pages [MEDIUM]

**File:** `app/clusters/[id]/loading.tsx`

**Description:** The file exists but serves as a Suspense boundary only for the layout-level loading. Individual tab pages (pods, deployments, etc.) render their own loading skeletons via tRPC `isLoading`, which is correct. However, there is no Suspense boundary around the `{children}` in the cluster layout, meaning if any tab page uses `use()` or top-level `await` (future Next.js patterns), there is no fallback.

**Status:** Low risk currently since no tab pages use React Suspense directly.

---

### E-05: tRPC query failures show inconsistent error UI [LOW]

**Description:** Some pages use `QueryError` component (clusters, deployments, alerts, events, logs, services, namespaces), but many cluster detail tab pages just show inline text like "Failed to load" or nothing at all. The error handling is not systematic.

**Pages with QueryError:** 13 pages
**Pages without it but using tRPC queries:** ~15+ cluster tab pages that show raw error states or silent failures.

**Suggested fix:** Create a standardized `useResourceQuery` wrapper or use `ResourcePageScaffold` consistently (which already handles loading/error states).

---

## 4. Bundle Size Concerns

### B-01: Heavy libs not lazy-loaded [HIGH]

| Library | Used In | Lazy? | Approximate Size |
|---------|---------|-------|-----------------|
| `react-diff-viewer-continued` | ResourceDiff, HelmRevisionDiff | No -- top-level import | ~80KB gzipped |
| `@xyflow/react` | TopologyMap, NetworkPolicyGraph | No (but in `optimizePackageImports`) | ~130KB gzipped |
| `recharts` | 4 chart components | No (but in `optimizePackageImports`) | ~100KB gzipped |
| `react-grid-layout` | DashboardGrid | **Yes** -- `import()` in useEffect | ~50KB gzipped |
| `@xterm/xterm` | TerminalSession | **Yes** -- `import()` in useEffect | ~200KB gzipped |
| `motion` | 52 components (162 usages) | Partial -- `LazyMotion` with `domAnimation` | ~23KB gzipped (feature bundle) |
| `cmdk` | CommandPalette | **Yes** -- `next/dynamic` | ~20KB gzipped |
| `yaml` | ResourceDiff, HelmReleaseDetail, YamlViewer | No -- top-level import | ~40KB gzipped |
| `dagre` (@dagrejs) | TopologyMap, NetworkPolicyGraph | No -- top-level import | ~30KB gzipped |

**Assessment:** `react-grid-layout`, `@xterm/xterm`, and `cmdk` are properly lazy-loaded. `react-diff-viewer-continued`, `yaml`, and `dagre` are not -- they are only used on specific cluster tabs but are statically imported.

**Suggested fix:**
1. Dynamic-import `react-diff-viewer-continued` in both `ResourceDiff.tsx` and `HelmRevisionDiff.tsx`
2. Dynamic-import `yaml` in `YamlViewer.tsx`, `ResourceDiff.tsx`, `HelmReleaseDetail.tsx`
3. Dynamic-import `dagre` in `TopologyMap.tsx` and `NetworkPolicyGraph.tsx`

---

### B-02: `motion` used as `motion.div` with LazyMotion (no strict) [LOW]

**File:** `components/providers.tsx`, line 80

**Description:** The CLAUDE.md notes that `<LazyMotion strict>` cannot be enabled because components use `motion.div` instead of `m.div`. This means the full `motion` export is used, partially defeating the purpose of `LazyMotion`. However, since `domAnimation` is the feature set (not `domMax`), the savings are still realized.

**Status:** Documented gotcha. Converting all `motion.*` to `m.*` would save an additional ~5-8KB but requires touching 52 files. Not high priority.

---

### B-03: `@iconify/react` and `@iconify-json/simple-icons` in bundle [LOW]

**File:** `package.json`

**Description:** Both `@iconify/react` and `@iconify-json/simple-icons` are dependencies. The JSON icon set can be large (~500KB uncompressed). However, `@iconify/react` is in `optimizePackageImports`, which should tree-shake unused icons.

**Status:** Already mitigated by `optimizePackageImports`. Verify with bundle analyzer if needed.

---

## 5. Accessibility Gaps

### A-01: select elements missing labels [MEDIUM]

**Files:**
- `components/topology/TopologyMap.tsx`, line 178 -- namespace filter `<select>` has no `aria-label`
- `components/network/NetworkPolicyGraph.tsx`, line 389 -- namespace filter `<select>` has no `aria-label`
- `components/logs/LogViewer.tsx` -- no ARIA labels on toolbar buttons

**Suggested fix:** Add `aria-label="Filter by namespace"` to select elements.

---

### A-02: Canvas animation not keyboard accessible [LOW]

**File:** `components/animations/ConstellationLoader.tsx`

**Description:** The constellation loader renders only to canvas with no keyboard-accessible alternative. The `role="status"` and `aria-busy="true"` are correct, but the canvas itself has no `aria-hidden="true"`.

**Suggested fix:** Add `aria-hidden="true"` to the `<canvas>` element since the status text below it already conveys the loading state.

---

### A-03: Missing focus management after navigation [MEDIUM]

**Description:** After navigating between cluster tabs or pages, focus is not programmatically moved to the new content. Screen reader users must tab through the entire sidebar and tab bar again to reach the new content.

**Suggested fix:** After tab navigation completes, set focus to the main content area or the first heading in the new tab. The `<a href="#main">Skip to content</a>` link in AppLayout is a good start but only helps on initial page load.

---

### A-04: DataTable sort/filter not announced to screen readers [LOW]

**File:** `components/DataTable.tsx`

**Description:** Table sorting and filtering changes are not announced via `aria-live` regions. Screen reader users cannot tell when the table content has changed after applying a filter.

**Suggested fix:** Add an `aria-live="polite"` region that announces "Showing X of Y results" after filtering.

---

### A-05: Terminal drawer keyboard trap [MEDIUM]

**File:** `components/terminal/TerminalDrawer.tsx`

**Description:** When the terminal drawer is open, there is no mechanism to trap focus within it (for modal-like behavior) or to easily escape back to the main content. The Ctrl+backtick shortcut exists but is not discoverable for screen reader users.

**Suggested fix:** When the drawer opens, move focus into it. Provide a visible "Close" button with proper ARIA. When closed, return focus to the element that opened it.

---

## 6. K8s Dashboard Best Practices

### K-01: No service worker for offline resilience [MEDIUM]

**Description:** The app has no service worker registration. If the API becomes temporarily unreachable, all tRPC queries fail and show error states. A service worker could cache the shell (HTML/JS/CSS), static assets, and recent API responses, allowing the dashboard to render cached data during brief outages.

**Suggested fix:** Register a service worker (via `next-pwa` or custom) that caches:
1. App shell (Next.js static assets)
2. Last-known-good tRPC responses for critical queries (cluster list, resource snapshots)
3. Static assets (fonts, icons)

This would let users view cached cluster data during API outages instead of seeing error states.

---

### K-02: SSE reconnection lacks jitter [LOW]

**File:** `hooks/useResourceSSE.ts`, lines 84-90
**File:** `hooks/useMetricsSSE.ts`, lines 103-108

**Description:** The SSE exponential backoff uses `delay * multiplier` without jitter. If the server restarts and 50 browser tabs reconnect, they all follow the exact same backoff schedule, creating thundering herd spikes at each retry interval.

The `usePresence.ts` hook correctly implements jitter (`BACKOFF_JITTER_MS = 1_000`), but the resource and metrics SSE hooks do not.

**Suggested fix:** Add jitter to reconnect delays:
```tsx
const jitter = Math.random() * 1000
reconnectTimeoutRef.current = setTimeout(connect, delay + jitter)
```

---

### K-03: No connection health indicator for individual SSE streams [LOW]

**Description:** The `ConnectionStatusBadge` shows the resource SSE connection state. However, there is no indicator for the metrics SSE stream or the log SSE stream. If the metrics stream disconnects but resources are still connected, the user sees stale metric charts with no visual cue.

**Suggested fix:** Show a small "stale data" indicator on metrics panels when `connectionState !== 'connected'` (the `DataFreshnessBadge` component already exists but may not cover all states).

---

### K-04: usePresence heartbeat continues when tab is hidden [MEDIUM]

**File:** `hooks/usePresence.ts`, lines 230-246

**Description:** The 30-second heartbeat mutation continues firing when the browser tab is hidden. This wastes server resources and network bandwidth. While the SSE subscription is properly visibility-aware (lines 201-228), the heartbeat interval is not.

**Suggested fix:** Pause the heartbeat interval when `document.hidden === true`:
```tsx
useEffect(() => {
  const sendHeartbeat = () => {
    if (document.hidden) return // Skip when tab not visible
    heartbeatRef.current.mutate(...)
  }
  sendHeartbeat()
  const interval = setInterval(sendHeartbeat, 30_000)
  return () => clearInterval(interval)
}, [pathname, setMyStatus])
```

---

## 7. Additional Observations (Not Issues)

### Good Patterns Already in Place

1. **SSE event buffering** (`useResourceSSE.ts`): 1-second buffer with batch flush to Zustand -- prevents render storms from rapid K8s watch events. Well-implemented.

2. **Heartbeat dead-connection detection** (`useResourceSSE.ts`): Client-side 10s heartbeat check with 45s timeout catches dead SSE connections. Correctly handles browser tab visibility.

3. **LTTB downsampling** (`lib/lttb.ts`): 500+ points downsampled to ~200 for chart performance. Clean implementation.

4. **Circular buffer for metrics** (`lib/metrics-buffer.ts`): Fixed-size buffer with time-based eviction prevents unbounded growth.

5. **Visibility-aware SSE** (`useMetricsSSE.ts`): Disconnects when tab is hidden, reconnects when visible. Saves server resources.

6. **Global QueryClient staleTime** (`providers.tsx`): 30s staleTime prevents unnecessary refetches across navigation.

7. **Stable nodeTypes/edgeTypes** (`TopologyMap.tsx`, `NetworkPolicyGraph.tsx`): Defined outside components to prevent React Flow re-render loops.

8. **xterm.js dynamic import** (`TerminalSession.tsx`): Properly loaded via `import()` inside useEffect for SSR safety.

9. **DebouncedResponsiveContainer**: Custom component that debounces resize observations instead of using Recharts' ResponsiveContainer, preventing layout thrashing.

10. **WebSocket cleanup** (`TerminalSession.tsx`): Comprehensive cleanup of WS, xterm, ResizeObserver, and timeouts on unmount.

---

## Issue Summary Table

| ID | Severity | Category | File | Description |
|----|----------|----------|------|-------------|
| P-01 | **CRITICAL** | Performance | `hooks/useResources.ts:24` | 1s re-render timer per useClusterResources instance (21 pages, 46 call sites) |
| P-02 | HIGH | Performance | `topology/TopologyMap.tsx:68` | 5s polling for topology data despite SSE availability |
| P-03 | HIGH | Bundle | `resource/ResourceDiff.tsx:7` | react-diff-viewer-continued loaded eagerly (~80KB) |
| P-05 | HIGH | Memory | `logs/LogViewer.tsx:113` | Unbounded sseLines array growth during follow mode |
| M-01 | HIGH | Memory | `dashboard/DashboardGrid.tsx:77` | ResizeObserver never disconnected (callback ref cleanup ignored) |
| B-01 | HIGH | Bundle | Multiple files | 3 heavy libs not lazy-loaded (diff-viewer, yaml, dagre) |
| E-01 | HIGH | Error | `clusters/[id]/layout.tsx` | No ErrorBoundary around cluster tab children |
| P-08 | MEDIUM | Performance | `clusters/[id]/layout.tsx:201` | AnimatePresence mode="wait" adds latency to tab switches |
| P-04 | MEDIUM | Bundle | `next.config.ts:18` | react-grid-layout not in optimizePackageImports |
| P-07 | MEDIUM | Bundle | `resource/index.ts` | Barrel re-export pulls heavy deps into unrelated page chunks |
| M-02 | MEDIUM | Memory | `FilterBar.tsx:54` | Debounce timer not cleared on unmount |
| M-03 | MEDIUM | Memory | `stores/ai-assistant.ts` | Persisted chat history grows without bound |
| E-02 | MEDIUM | Error | `dashboard/DashboardGrid.tsx` | No ErrorBoundary per dashboard widget |
| E-03 | MEDIUM | Error | Topology/Network graphs | No ErrorBoundary around ReactFlow |
| E-04 | MEDIUM | Error | Cluster detail pages | No Suspense boundary around tab children |
| A-01 | MEDIUM | A11y | TopologyMap, NetworkPolicyGraph | select elements missing aria-label |
| A-03 | MEDIUM | A11y | Navigation | No focus management after tab navigation |
| A-05 | MEDIUM | A11y | TerminalDrawer | No focus trap or keyboard escape |
| K-01 | MEDIUM | K8s Best Practice | App-wide | No service worker for offline/degraded mode |
| K-04 | MEDIUM | K8s Best Practice | `hooks/usePresence.ts:230` | Heartbeat fires when tab is hidden |
| P-06 | LOW | Performance | `PodLogStream.tsx:63` | Mock timer uses misleading random interval |
| P-09 | LOW | Performance | `settings/page.tsx:231` | 1s timer for sync label |
| M-04 | LOW | Memory | `CrosshairProvider.tsx:29` | rAF not cancelled on unmount |
| B-02 | LOW | Bundle | `providers.tsx:80` | motion.div used with LazyMotion (no strict) |
| B-03 | LOW | Bundle | `package.json` | @iconify-json may inflate bundle (mitigated by optimizePackageImports) |
| A-02 | LOW | A11y | `ConstellationLoader.tsx` | Canvas missing aria-hidden |
| A-04 | LOW | A11y | `DataTable.tsx` | Sort/filter changes not announced |
| K-02 | LOW | K8s Best Practice | SSE hooks | Reconnection backoff lacks jitter |
| K-03 | LOW | K8s Best Practice | Metrics panels | No stale-data indicator for disconnected metrics SSE |
| E-05 | LOW | Error | Cluster tab pages | Inconsistent error UI across pages |

---

## Recommended Priority Order

### Immediate (This Sprint)
1. **P-01** -- Fix the 1s timer storm (biggest performance win)
2. **M-01** -- Fix DashboardGrid ResizeObserver leak
3. **E-01** -- Add ErrorBoundary to cluster layout children

### Short Term (Next Sprint)
4. **B-01 / P-03** -- Lazy-load react-diff-viewer, yaml, dagre
5. **P-05** -- Cap LogViewer sseLines array
6. **P-02** -- Replace 5s topology polling with SSE-derived data
7. **M-02** -- Fix FilterBar debounce cleanup
8. **K-04** -- Pause presence heartbeat when tab hidden

### Medium Term
9. **E-02, E-03** -- Add ErrorBoundary to widgets and graphs
10. **A-01, A-03, A-05** -- Accessibility improvements
11. **P-07** -- Split barrel file to avoid heavy re-exports
12. **K-01** -- Evaluate service worker for offline resilience
13. **K-02** -- Add jitter to SSE reconnection backoff
14. **P-08** -- Reconsider AnimatePresence mode on tab switches
