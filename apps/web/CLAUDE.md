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
│   ├── clusters/[id]/     # Cluster detail (29 tabs via GroupedTabBar: 5 standalone + 24 grouped across 7 groups)
│   ├── api/               # Route Handlers for SSE proxying (resources, metrics, logs)
│   ├── settings/          # Settings hub
│   └── login/             # Auth page
├── components/
│   ├── Sidebar.tsx        # Main sidebar (6 nav items)
│   ├── AppLayout.tsx      # App shell with auto-collapse
│   ├── providers.tsx      # All providers (tRPC, theme, LazyMotion, TerminalProvider + TerminalDrawer, CommandPalette)
│   ├── DataTable.tsx      # Reusable table component
│   ├── CommandPalette.tsx # cmdk (dynamically imported, ~20KB savings)
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
│   └── useResourceSSE.ts      # K8s Watch → rAF-batched TanStack Query refetch
├── lib/
│   ├── trpc.ts                # tRPC client (httpLink, NOT httpBatchLink) + handleTRPCError
│   ├── animation-constants.ts # Motion v12 timing/easing (B-style)
│   ├── metrics-buffer.ts      # Circular buffer for SSE live data (65 points)
│   ├── lttb.ts                # LTTB downsampling (~50 LOC) — 500+ → ~200 points
│   └── formatters.ts          # Display formatters
└── config/
    └── navigation.ts          # Sidebar nav config (6 items)
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
- **Container queries:** `WidgetWrapper.tsx` uses `@container` for responsive dashboard widgets

### State Management

- **Server state (DB):** Clusters, nodes, alerts, users, webhooks — PostgreSQL via tRPC queries
- **Real-time state (SSE):** Pod updates, deployment progress, metrics — EventEmitter → SSE → useResourceSSE/useMetricsSSE
- **Client state:** UI filters, sidebar collapse, dashboard layout — Zustand stores
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
- `react-grid-layout` — dashboard layouts
- `vaul` — drawer component
- `sonner` — toast notifications
- `@xyflow/react` — React Flow for topology and network policy graphs
- `@xterm/xterm` — terminal emulator for pod exec

## Key Abstractions

| Abstraction | File | Pattern |
|-------------|------|---------|
| **SSE Route Handler Proxies** | `app/api/{resources,metrics,logs}/stream/route.ts` | `node:http` streaming proxy — Next.js rewrites can't handle SSE |
| **useResourceSSE** | `hooks/useResourceSSE.ts` | K8s Watch events → rAF-batched TanStack Query refetch |
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
Groups: standalone (Overview, Nodes, Events, Logs, Metrics), Workloads, Networking, Config, Storage, Scaling, Cluster Ops (Helm, CRDs, RBAC). Config in `cluster-tabs-config.ts`. Active child tab shows **child's label** (e.g., "Helm") not group label.

### TerminalDrawer Must Be Mounted in providers.tsx
`<TerminalDrawer />` must be inside `<TerminalProvider>` in `providers.tsx`. It renders as fixed-position outside page tree. If missing, clicking Exec does nothing — no error, no drawer.

### SSE Through Next.js Rewrites — Socket Hang Up
Next.js `rewrites()` cannot proxy SSE — buffers and drops connection. SSE endpoints use dedicated Route Handlers in `app/api/*/stream/route.ts` via `node:http`. **Never add SSE endpoints to rewrites.**
