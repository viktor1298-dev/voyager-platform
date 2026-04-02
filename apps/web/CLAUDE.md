# apps/web — Next.js Frontend

Next.js 16 + React 19 + Tailwind 4 + shadcn/ui. App Router with SSR/CSR hybrid.

## Commands

```bash
pnpm dev              # next dev, port 3000
pnpm build            # next build
pnpm test             # vitest run
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check src/
```

## Source Layout

```
src/
├── app/                   # App Router pages (~55 routes)
│   ├── clusters/[id]/     # Cluster detail (24 tabs via GroupedTabBar: 5 standalone + 19 grouped across 6 groups)
│   ├── api/               # (reserved — SSE connects directly to API via NEXT_PUBLIC_API_URL)
│   ├── settings/          # Settings hub
│   └── login/             # Auth page
├── components/
│   ├── Sidebar.tsx        # Main sidebar (6 nav items)
│   ├── AppLayout.tsx      # App shell with auto-collapse
│   ├── providers.tsx      # All providers (tRPC, theme, LazyMotion, TerminalProvider + TerminalDrawer, CommandPalette)
│   ├── DataTable.tsx      # Reusable table component
│   ├── CommandPalette.tsx # cmdk (dynamically imported, ~20KB savings)
│   ├── dashboard/         # KpiStrip, ClusterCard, EnvironmentGroup, DashboardFilterChips, DashboardSkeleton
│   ├── animations/        # FadeIn, SlideIn, AnimatedList, PageTransition, SuccessCheck
│   ├── charts/            # chart-theme.ts (CSS var colors), metric panels
│   ├── metrics/           # CrosshairProvider, DataFreshnessBadge, MetricsPanelSkeleton, DebouncedResponsiveContainer
│   ├── expandable/        # ExpandableCard, ExpandableTableRow, DetailTabs, ResourceBar, ConditionsList, TagPills, DetailRow, DetailGrid
│   ├── resource/          # YamlViewer, ResourceDiff, ActionToolbar, DeleteConfirmDialog, RestartConfirmDialog, ScaleInput, PortForwardCopy, SearchFilterBar
│   ├── terminal/          # TerminalDrawer (VS Code bottom panel), TerminalSession (xterm.js), TerminalTab, terminal-context
│   ├── topology/          # TopologyMap (React Flow), TopologyNode, topology utils
│   ├── events/            # EventsTimeline (swim lanes), TimelineSwimLane, TimelineEventDot
│   ├── rbac/              # RbacMatrix, RbacCell (CRUD letter display)
│   ├── helm/              # HelmReleaseDetail (Info/Values/Revisions/Resources tabs)
│   ├── crds/              # CrdBrowser, CrdInstanceList
│   ├── quotas/            # ResourceQuotaCard (gauge bars)
│   ├── network/           # NetworkPolicyGraph (React Flow allow/deny edges)
│   └── clusters/          # cluster-tabs-config.ts (7 groups, 25 tabs)
├── hooks/
│   ├── useMetricsData.ts      # Unified metrics — SSE for ≤15m, tRPC for ≥30m
│   ├── useMetricsSSE.ts       # SSE connection with exponential backoff + visibility-aware
│   ├── useResourceSSE.ts      # K8s Watch → adaptive-batched Zustand store updates (flush on 20 events OR 1s timer)
│   ├── useCachedResources.ts  # Rancher-style tRPC prefetch → seeds Zustand before SSE
│   ├── useHelmReleases.ts     # Hybrid SSE + tRPC merge for Helm releases
│   ├── useResources.ts        # Resource data access hook
│   ├── useSSEConnection.ts    # Generic SSE connection management
│   ├── usePresence.ts         # User presence tracking
│   ├── useIsAdmin.ts          # Admin role check
│   ├── usePermission.ts       # RBAC permission check
│   ├── useKeyboardShortcuts.ts # Global keyboard shortcuts
│   ├── useOptimisticMutation.ts # Optimistic UI update wrapper
│   ├── usePageTitle.ts        # Dynamic page title
│   ├── useReducedMotion.ts    # Respects prefers-reduced-motion
│   ├── useRefreshInterval.ts  # Configurable polling interval
│   ├── useApiHealth.ts        # API health status
│   └── useAnomalyCount.ts     # Anomaly badge count
├── lib/
│   ├── trpc.ts                # tRPC client (httpLink, NOT httpBatchLink) + handleTRPCError
│   ├── animation-constants.ts # Motion v12 timing/easing (B-style)
│   ├── metrics-buffer.ts      # Circular buffer for SSE live data (65 points)
│   ├── lttb.ts                # LTTB downsampling (~50 LOC) — 500+ → ~200 points
│   ├── formatters.ts          # Display formatters
│   ├── resource-status.ts     # Status config map + resolveResourceStatus() — single source of truth
│   ├── status-utils.ts        # Status helper utilities
│   ├── auth-client.ts         # Better-Auth client-side setup
│   ├── auth-constants.ts      # Auth-related constants
│   ├── ai-keys-client.ts      # AI key management client
│   ├── ai-keys-contract.ts    # AI key contract types (shared with API)
│   ├── cluster-constants.ts   # Cluster-related constants
│   ├── cluster-meta.ts        # Cluster metadata helpers
│   ├── cluster-status.ts      # Cluster status utilities
│   ├── time-utils.ts          # Time/date formatting utilities
│   ├── k8s-units.ts           # K8s resource unit parsing (CPU millicores, memory MiB)
│   ├── anomalies.ts           # Anomaly detection helpers
│   └── utils.ts               # General utilities
└── config/
    ├── navigation.ts          # Sidebar nav config (6 items)
    └── constants.ts           # App-wide constants
```

## Key Patterns

- **tRPC client:** Uses `httpLink` (not batch) — batched URLs exceeded nginx limits, causing 404s that froze navigation. **Never revert to `httpBatchLink`**
- **State:** Zustand stores for UI state, TanStack Query for server state (via tRPC)
- **Auth:** Better-Auth cookie session; `handleTRPCError()` redirects to `/login` on UNAUTHORIZED
- **Animations:** Motion v12 — use constants from `animation-constants.ts`. **Read `docs/DESIGN.md` before any UI/animation change** — "Confident & Expressive" (Style B)
- **Metrics data:** Use `useMetricsData` hook exclusively — SSE for ≤15m, tRPC for ≥30m. Never bypass with direct tRPC calls
- **Navigation:** `router.push()` for cluster links (not `<a>` tags) — tests must use `page.click()` + `waitForURL()`
- **Chart colors:** CSS custom properties (`--chart-1..5`, `--color-chart-*`) from globals.css — never hardcode
- **View Transitions:** Enabled via `next.config.ts` experimental flag + CSS `@view-transition`
- **Package optimization:** `optimizePackageImports` for lucide-react, recharts, @iconify/react, @xyflow/react
- **QueryClient:** Global `staleTime: 30s` to prevent unnecessary refetches
- **Polling intervals:** Use `SYNC_INTERVAL_MS` (30s) from `config/constants.ts` for staleTime/refetchInterval. Use `DB_CLUSTER_REFETCH_MS` / `HEALTH_STATUS_REFETCH_MS` (60s) from `lib/cluster-constants.ts` for slower-polling data. **Never hardcode 30000/60000 — import the constant.**
- **K8s units:** Use `parseCpuMillicores()` / `parseMemoryMi()` from `lib/k8s-units.ts` — never define local copies
- **Dashboard page:** Compact Rancher-style layout — KpiStrip (36px) → DashboardFilterChips (32px) → EnvironmentGroup (collapsible) → ClusterCard grid. No widget mode. All values from centralized CSS variables and `animation-constants.ts` tokens.

### State Management

- **Server state (DB):** Clusters, nodes, alerts, users, webhooks — PostgreSQL via tRPC queries
- **Real-time state (SSE):** Pod updates, deployment progress, metrics — EventEmitter → SSE → useResourceSSE/useMetricsSSE
- **Client state:** UI filters, sidebar collapse — Zustand stores
- **Session:** Better-Auth cookie session (secure, httpOnly, sameSite=strict) — no JWT
- **Cache:** tRPC useQuery with `staleTime` and `refetchInterval` per endpoint

## URL Structure

**Sidebar navigation (6 items):** `/` Dashboard, `/clusters`, `/alerts`, `/events`, `/logs`, `/settings`

```
# Cluster detail (29 tabs via GroupedTabBar, 7 groups)
/clusters/[id]                  → Overview (default, includes topology map)
/clusters/[id]/nodes|pods|deployments|services|namespaces|events|logs|metrics|autoscaling
/clusters/[id]/ingresses|statefulsets|daemonsets|jobs|cronjobs|hpa|configmaps|secrets|pvcs
/clusters/[id]/helm|crds|rbac|network-policies|resource-quotas

# Not in sidebar (accessible via direct URL or in-app links)
/ai, /dashboards, /anomalies, /karpenter, /system-health, /health, /login

# Settings sub-pages
/users, /teams, /permissions, /webhooks, /features, /feature-flags, /audit
```

## Key Dependencies

- `@tanstack/react-form` — used in login, users, teams pages (don't remove)
- `cmdk` — command palette
- `nuqs` — URL query state management
- `recharts` — charts/graphs
- `vaul` — drawer component
- `sonner` — toast notifications
- `@xyflow/react` — React Flow for topology and network policy graphs
- `@xterm/xterm` — terminal emulator for pod exec

## Key Abstractions

| Abstraction | File | Pattern |
|-------------|------|---------|
| **useResourceSSE** | `hooks/useResourceSSE.ts` | Direct EventSource to API (`NEXT_PUBLIC_API_URL`), adaptive-batched Zustand store updates (flush on 20 events OR 1s timer), exponential backoff reconnect, client heartbeat dead-connection detection |
| **useMetricsData** | `hooks/useMetricsData.ts` | SSE for ≤15m, tRPC for ≥30m — seamless switching |
| **CrosshairProvider** | `components/metrics/CrosshairProvider.tsx` | RAF-throttled shared crosshair across 4 metric panels |
| **Metrics Buffer** | `lib/metrics-buffer.ts` | Circular buffer (65 points) with time-based eviction |
| **LTTB Downsampling** | `lib/lttb.ts` | 500+ points → ~200 for chart perf |
| **Terminal Drawer** | `components/terminal/TerminalDrawer.tsx` | VS Code-style bottom panel — xterm.js, multi-tab, WS to K8s exec |
| **Terminal Context** | `components/terminal/terminal-context.tsx` | `useTerminal()` — session management, openTerminal/closeTerminal |
| **YamlViewer** | `components/resource/YamlViewer.tsx` | Syntax-highlighted read-only YAML with copy, theme-aware |
| **ResourceDiff** | `components/resource/ResourceDiff.tsx` | Side-by-side diff (current vs last-applied), Helm revision support |
| **ActionToolbar** | `components/resource/ActionToolbar.tsx` | Restart/Scale/Delete with tiered confirmation dialogs |
| **TopologyMap** | `components/topology/TopologyMap.tsx` | React Flow — Ingress→Service→Pod→Node with dagre layout |
| **RbacMatrix** | `components/rbac/RbacMatrix.tsx` | Permission grid — users×resources with CRUD letter cells |
| **EventsTimeline** | `components/events/EventsTimeline.tsx` | Horizontal swim lanes with resource-type grouping |
| **ResourceStatusBadge** | `components/shared/ResourceStatusBadge.tsx` | Icon + bordered badge for K8s resource status — 8 categories (healthy/completed/transitional/draining/error/critical/fatal/unknown) with unique icons and animations |
| **resource-status** | `lib/resource-status.ts` | Centralized status config map + `resolveResourceStatus()` resolver — single source of truth for status → color/icon/animation mapping |
| **useCachedResources** | `hooks/useCachedResources.ts` | Rancher-style tRPC prefetch — seeds Zustand store from WatchManager cache before SSE connects |
| **LiveTimeAgo** | `components/shared/LiveTimeAgo.tsx` | Self-updating age label (1s interval) — decouples time display from resource store re-renders |

## Adding a New Page

1. Create `src/app/my-page/page.tsx`
2. If sidebar-visible: add entry to `src/config/navigation.ts`
3. If it uses tRPC queries in shared components: test navigation after (httpLink gotcha)

## Gotchas

### Router.push vs `<a>` Links
Clusters page uses `router.push()`, not `<a href>` links. Tests that look for `a[href*="/clusters/"]` will always fail. Use `page.click()` on the element or `waitForURL()`.

### `@tanstack/react-form` — Not Dead Weight
Despite appearing unused at first glance, it IS used in login/users/teams pages. Don't remove without checking.

### tRPC v11 — Never Use `getUntypedClient()` for Subscriptions or Mutations
`getUntypedClient()` does not expose `.subscription()` or `.mutation()` in tRPC v11. Always use tRPC React hooks.

### LazyMotion — Do NOT Add `strict` Flag
`<LazyMotion strict>` crashes any component using `motion.div` instead of `m.div`. Don't re-add without converting all `motion.*` imports first.

### `useMutation` in useEffect Dependencies
tRPC `useMutation()` returns new object reference every render. In `useEffect` deps = infinite re-renders. Use ref pattern: `const mutRef = useRef(mutation); mutRef.current = mutation;`

### SSR Hydration — Never Branch on `typeof window/document` in Render
Creates server/client branch → React hydration errors. **Always use `useState(false)` + `useEffect(() => set(true))`.** Has broken login page multiple times via `PageTransition.tsx`.

### Metrics Dual Data Source — SSE vs tRPC
Short ranges (≤15m) use SSE from K8s metrics-server. Historical ranges (≥30m) use tRPC `metrics.history` with TimescaleDB. `useMetricsData` handles switching. **Never bypass this hook.**

### xterm.js — Dynamic Import Required (SSR Safety)
`@xterm/xterm` accesses `window` and `document` on import. Must use `import()` inside `useEffect` — never at module top level. `TerminalSession.tsx` follows the correct pattern.

### React Flow — Stable `nodeTypes` Reference Required
`@xyflow/react` re-renders entire graph when `nodeTypes` reference changes. Define outside component or `useMemo`. Failing = infinite re-renders.

### GroupedTabBar — 7 Groups
6 groups: Workloads (6 tabs), Networking (3), Config (4), Storage (1), Scaling (2), Cluster Ops (3). Config in `cluster-tabs-config.ts`. Active child tab shows **child's label** (e.g., "Helm") not group label.

### TerminalDrawer Must Be Mounted in providers.tsx
`<TerminalDrawer />` must be inside `<TerminalProvider>` in `providers.tsx`. It renders as fixed-position outside page tree. If missing, clicking Exec does nothing — no error, no drawer.

### useKeyboardShortcuts — Bare Keys Must Not Catch Modifier Combos
When registering bare-key shortcuts (e.g., `['r']`, `['n']`), the modifier match logic in `useKeyboardShortcuts.ts` guards against Cmd/Ctrl being pressed. **Never remove these guards** — without them, bare `r` catches Cmd+R (browser refresh), bare `c` catches Cmd+C (copy), etc. If adding a shortcut that requires Cmd/Ctrl, include `'meta'`/`'ctrl'` in the `keys` array.

### FilterBar Search — `router.replace()` Steals Focus
`FilterBar.tsx` syncs search text to URL via `router.replace()`. This triggers a Next.js re-render that resets `document.activeElement`. The `isTypingRef` + `useEffect` refocus pattern restores focus after the URL update. **Never remove the refocus logic** — without it, every keystroke in the search bar loses focus.

### SSE Connects Directly to API — Not Through Next.js
`useResourceSSE` builds the EventSource URL from `NEXT_PUBLIC_API_URL` (e.g., `http://localhost:4001/api/resources/stream`). SSE bypasses Next.js entirely — no rewrites, no Route Handlers. The `next.config.ts` rewrites use a negative lookahead to exclude SSE paths (`resources/stream`, `metrics/stream`, `logs/stream`). **Never add SSE endpoints to Next.js rewrites** — they buffer and drop the connection.

### Age Labels Must Use `<LiveTimeAgo>` — Never Inline `timeAgo()`
Relative time labels ("3s ago", "2d ago") must use the `<LiveTimeAgo date={...} />` component (`components/shared/LiveTimeAgo.tsx`), **never** inline `timeAgo(date)` calls. `timeAgo()` is a pure function that only produces fresh output on re-render — but Zustand correctly skips re-renders when resource data hasn't changed (no K8s events between status transitions). Inline calls freeze at whatever value they had on last render. `LiveTimeAgo` self-updates every 1 second via its own internal `useState` interval, independent of the resource store. This bug has regressed twice — do not revert to inline calls or global tick hacks.

### Zustand Resource Store — No `subscribeWithSelector` Middleware
The resource store (`stores/resource-store.ts`) must NOT use `subscribeWithSelector` middleware. It wraps `api.subscribe()` and interferes with `useSyncExternalStore` change detection for Map-based state. Nobody uses selector-based external subscriptions — the middleware is dead weight that breaks SSE-driven re-renders.

### Sidebar Active State — Single `layoutId`, CSS-Only Background
The sidebar uses a single `layoutId="sidebar-active-bar"` for the accent bar spring animation between nav items. The active background is a **plain CSS `<div>`** (no `layoutId`). **Never add a second `layoutId` to the active background** — `absolute inset-0` inside items that change size between expanded (`gap-3 px-3`) and collapsed (`w-10 justify-center`) causes the absolute element to stretch beyond bounds, shifting the icon out of the container. The bar glow pulse uses CSS `@keyframes sidebar-bar-pulse` (not Motion) because Motion v12 cannot interpolate `boxShadow` values containing `var()` CSS custom property references.

### Sidebar Badges — `showLabels` Guards AnimatePresence, Not Just Content
Expanded badges (`ml-auto min-w-[18px]`) must wrap their `<AnimatePresence>` inside the `showLabels` conditional, not just the badge element. If `AnimatePresence` wraps the condition (`showBadge && showLabels`), the exit animation keeps the badge in the DOM for 150ms with `ml-auto` still taking flex space — pushing the icon left in the `w-10` collapsed container. Pattern: `{showLabels && (<AnimatePresence>{showBadge && (...)}</AnimatePresence>)}`. The collapsed dot uses `position: absolute` so it never affects icon centering.

### Sidebar Clusters Query — `enabled` Guard on Accordion State
The `clusters.list` query in `Sidebar.tsx` uses `enabled: clustersOpen || isClustersRoute` to skip fetching when the clusters accordion is collapsed. This saves a DB round-trip every 60s. **Never remove the `enabled` guard** — it prevents unnecessary polling on every page.

### Sidebar CSS Tokens — Centralized in globals.css
All sidebar visual values (active gradient, bar glow, icon glow, badge glow, hover backgrounds) use `--sidebar-*` CSS custom properties defined in `:root` (dark) and `html.light` (light). Motion variants for hover/tap are in `animation-constants.ts` (`sidebarCollapsedIconHover`, `sidebarTapFeedback`, `sidebarTapFeedbackCollapsed`). **Never hardcode sidebar colors or shadows inline** — add them to the centralized tokens.
