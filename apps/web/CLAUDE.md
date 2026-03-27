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
├── app/                   # App Router pages (~30 routes)
│   ├── clusters/[id]/     # Cluster detail (10 tabs: overview, nodes, pods, deployments, services, namespaces, events, logs, metrics, autoscaling)
│   ├── settings/          # Settings hub
│   └── login/             # Auth page
├── components/            # 30+ UI components
│   ├── Sidebar.tsx        # Main sidebar (6 nav items)
│   ├── AppLayout.tsx      # App shell with auto-collapse
│   ├── providers.tsx      # All providers (tRPC, theme, MotionConfig)
│   ├── DataTable.tsx      # Reusable table component
│   ├── CommandPalette.tsx # cmdk command palette
│   └── ...
├── lib/
│   ├── trpc.ts            # tRPC client (httpLink, NOT httpBatchLink) + handleTRPCError
│   ├── animation-constants.ts  # Motion v12 timing/easing
│   ├── formatters.ts      # Display formatters
│   └── ...
└── config/
    └── navigation.ts      # Sidebar nav config (6 items)
```

## Key Patterns

- **tRPC client:** Uses `httpLink` (not batch) — see root CLAUDE.md Gotcha #1
- **State:** Zustand stores for UI state, TanStack Query for server state (via tRPC)
- **Auth:** Better-Auth cookie session; `handleTRPCError()` redirects to `/login` on UNAUTHORIZED
- **Animations:** Motion v12 — use constants from `animation-constants.ts`, not inline values. **Read `docs/DESIGN.md` before any UI/animation change** — it defines the "Confident & Expressive" (Style B) design standard for all hover states, card effects, button feedback, chart animations, and status indicators
- **Navigation:** `router.push()` for cluster links (not `<a>` tags) — E2E tests must use `page.click()` + `waitForURL()`
- **Sidebar items:** Dashboard, Clusters, Alerts, Events, Logs, Settings (6 total in `navigation.ts`)
- **Routes not in sidebar:** `/ai`, `/dashboards`, `/anomalies`, `/karpenter`, `/system-health` — accessible via in-app links or direct URL

## Key Dependencies

- `@tanstack/react-form` — used in login, users, teams pages (don't remove)
- `cmdk` — command palette
- `nuqs` — URL query state management
- `recharts` — charts/graphs
- `react-grid-layout` — dashboard layouts
- `vaul` — drawer component
- `sonner` — toast notifications

## Adding a New Page

1. Create `src/app/my-page/page.tsx`
2. If sidebar-visible: add entry to `src/config/navigation.ts`
3. If it uses tRPC queries in shared components: test navigation after (Gotcha #1)
