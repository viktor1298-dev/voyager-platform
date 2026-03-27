# 03 — Performance & Modern CSS Audit

**Date:** 2026-03-27
**Stack:** Next.js 16.1.6, React 19.2.4, Tailwind 4, Motion 12.34, Recharts 3.7
**Scope:** `apps/web/src/` — all components, pages, config, and CSS (220+ source files)

---

## Table of Contents

1. [View Transitions API](#1-view-transitions-api)
2. [CSS Container Queries](#2-css-container-queries)
3. [`@starting-style` for Entry Animations](#3-starting-style-for-entry-animations)
4. [`color-mix()` Usage](#4-color-mix-usage)
5. [CSS `light-dark()` Function](#5-css-light-dark-function)
6. [Bundle Analysis & Dynamic Imports](#6-bundle-analysis--dynamic-imports)
7. [Image Optimization](#7-image-optimization)
8. [React 19 Patterns](#8-react-19-patterns)
9. [Lazy Loading](#9-lazy-loading)
10. [CSS-Only Animation Alternatives](#10-css-only-animation-alternatives)
11. [Recharts Optimization](#11-recharts-optimization)
12. [TanStack Query Optimization](#12-tanstack-query-optimization)
13. [Font Loading](#13-font-loading)
14. [Third-Party Script Impact](#14-third-party-script-impact)
15. [Summary Matrix](#15-summary-matrix)

---

## 1. View Transitions API

### [P1] No View Transitions API adoption
- **File:** `apps/web/src/components/animations/PageTransition.tsx:18-28`
- **Issue:** Page transitions rely on Motion's `motion.div` with `pageVariants` (opacity + translateY). Next.js 16 has native View Transitions API support, but it is not used anywhere in the codebase. Zero instances of `viewTransition`, `startViewTransition`, or `view-transition` found.
- **Modern approach:** Next.js 16 supports `<Link viewTransition>` and `router.push()` with View Transitions via the experimental `viewTransition` flag. This gives native browser-level page transitions with zero JS bundle cost and GPU-composited animations.
- **Fix:**
  ```ts
  // next.config.ts
  const nextConfig: NextConfig = {
    experimental: {
      viewTransition: true,
    },
    // ...existing config
  }
  ```
  ```css
  /* globals.css — define transition animations */
  @view-transition {
    navigation: auto;
  }
  ::view-transition-old(page) {
    animation: fade-out 0.2s ease-out;
  }
  ::view-transition-new(page) {
    animation: fade-in 0.25s ease-out;
  }
  ```
  Then `PageTransition.tsx` becomes a thin wrapper or is removed entirely for route-level transitions. Keep Motion only for intra-page animations (lists, dialogs, accordions).
- **Impact:** Eliminates JS-driven route transition overhead, reduces Motion bundle usage, improves perceived navigation speed. View Transitions are GPU-composited and don't block the main thread.
- **Priority:** P1

### [P2] Sidebar layout animation could use View Transitions
- **File:** `apps/web/src/components/AppLayout.tsx:102-115`
- **Issue:** Sidebar collapse/expand uses `motion.main` with spring-animated `marginLeft`. This works but runs animation calculations on the main thread.
- **Modern approach:** CSS `view-transition-name` on the sidebar and main content could let the browser handle the layout shift natively. However, this is a sidebar toggle (not a navigation), so View Transitions are less natural here — the current spring animation is acceptable.
- **Fix:** No change recommended for sidebar specifically; spring physics here is intentional UX.
- **Impact:** N/A
- **Priority:** P2 (informational)

---

## 2. CSS Container Queries

### [P1] Dashboard widgets use viewport media queries instead of container queries
- **File:** `apps/web/src/components/dashboard/DashboardGrid.tsx` + all 8 widget files
- **Issue:** Dashboard widgets are placed inside a `react-grid-layout` grid where each widget can be resized independently. Yet responsive behavior relies on Tailwind's viewport-based breakpoints (`sm:`, `md:`, `lg:`). A widget at 1/4 width still thinks it's on a "large" screen.
- **Modern approach:** CSS Container Queries (`@container`) allow components to respond to their own container size, not the viewport. This is critical for resizable dashboard widgets.
- **Fix:**
  ```tsx
  // WidgetWrapper.tsx — add container query context
  <div className="@container h-full">
    {children}
  </div>
  ```
  ```tsx
  // Inside widget components, replace viewport breakpoints:
  // Before: className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
  // After:  className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-4"
  ```
  Tailwind 4 supports `@container` variants natively with the `@` prefix.
- **Impact:** Widgets become truly responsive to their own size rather than the viewport. Critical for dashboard UX where widgets are resizable.
- **Priority:** P1

### [P2] Cluster cards could benefit from container queries
- **File:** `apps/web/src/app/page.tsx` (cluster card grid)
- **Issue:** Cluster cards use `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` on the parent grid. The cards themselves have fixed internal layouts. If the sidebar is collapsed vs expanded, the available space changes but the breakpoints don't adjust.
- **Modern approach:** Wrap the card grid area in a container and use `@container` breakpoints for column count.
- **Fix:**
  ```tsx
  <div className="@container">
    <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
  ```
- **Impact:** Cards adapt to actual available space, not viewport width. Better UX when sidebar is toggled.
- **Priority:** P2

### [P2] Sidebar cluster list responsive layout
- **File:** `apps/web/src/components/Sidebar.tsx:281-325`
- **Issue:** The cluster accordion section in the sidebar has a fixed layout. When the sidebar is collapsed, the entire section hides. Container queries could enable a compact view instead of hide/show.
- **Modern approach:** Use `@container` on the sidebar to show abbreviated cluster names or icons-only in compact mode.
- **Fix:** Moderate refactor of sidebar cluster section with container-aware layout.
- **Impact:** Improved information density when sidebar is semi-collapsed.
- **Priority:** P2

---

## 3. `@starting-style` for Entry Animations

### [P2] Simple mount animations could use `@starting-style`
- **File:** `apps/web/src/components/animations/FadeIn.tsx:19-35`
- **Issue:** `FadeIn` uses Motion's `motion.div` with `initial="hidden" animate="visible"` for a simple opacity 0 -> 1 transition. This requires the full Motion runtime for what is essentially a CSS entry animation.
- **Modern approach:** CSS `@starting-style` (baseline since Dec 2024, all modern browsers) allows defining the initial style for an element when it first renders, enabling pure CSS mount animations.
- **Fix:**
  ```css
  /* globals.css */
  .fade-in-enter {
    opacity: 1;
    transition: opacity 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
    @starting-style {
      opacity: 0;
    }
  }
  ```
  ```tsx
  // FadeIn.tsx — CSS-only version
  export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
    return (
      <div
        className={cn('fade-in-enter', className)}
        style={delay ? { transitionDelay: `${delay}s` } : undefined}
      >
        {children}
      </div>
    )
  }
  ```
- **Impact:** Removes Motion dependency from simple fade animations. Reduces JS execution on mount. Still respects `prefers-reduced-motion` via the global media query rule already in globals.css (line 401).
- **Priority:** P2

### [P2] ErrorBoundary animation is CSS-candidate
- **File:** `apps/web/src/components/ErrorBoundary.tsx:37-57`
- **Issue:** The error fallback UI uses `motion.div` with `initial={{ opacity: 0, y: 12 }}` for a slide-up fade. This is a one-shot mount animation — a perfect `@starting-style` candidate.
- **Modern approach:** Replace with CSS `@starting-style` for the error container.
- **Fix:**
  ```css
  .error-boundary-enter {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 0.3s ease-out, transform 0.3s ease-out;
    @starting-style {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  ```
- **Impact:** Removes Motion import from ErrorBoundary (class component — Motion usage here is awkward anyway).
- **Priority:** P2

### [P3] Dialog overlay entry animation
- **File:** `apps/web/src/components/ui/dialog.tsx:32-71`
- **Issue:** Dialog overlay uses `overlayVariants` (opacity fade) via Motion. The CSS `@starting-style` + Popover API could handle this natively.
- **Modern approach:** For dialogs using the HTML `<dialog>` element or Radix Dialog, CSS `@starting-style` can animate the backdrop appearance.
- **Fix:** Complex due to Radix Dialog integration. Lower priority.
- **Impact:** Reduces Motion usage in UI primitives.
- **Priority:** P3

---

## 4. `color-mix()` Usage

### [INFO] Good adoption — 18+ instances
- **File:** `apps/web/src/app/globals.css:331,341,345,491-536,602`
- **Issue:** The codebase already uses `color-mix()` extensively for scrollbar theming, relation badges (owner/admin/editor/viewer), and text selection. This is a strong pattern.
- **Modern approach:** Current usage is good. `color-mix()` has universal support since 2023.
- **Fix:** N/A — well adopted.
- **Impact:** N/A
- **Priority:** N/A

### [P3] Glow effects still use hardcoded rgba instead of color-mix
- **File:** `apps/web/src/app/globals.css:130-137,235-242`
- **Issue:** Glow effect variables use hardcoded `rgba()` values:
  ```css
  --glow-healthy: 0 0 20px rgba(16, 185, 129, 0.15);
  --glow-healthy-hover: 0 0 30px rgba(16, 185, 129, 0.25);
  ```
  These duplicate the base color (`#10b981`) with different opacities in both dark and light themes.
- **Modern approach:** Use `color-mix()` to derive opacity variants from a single base color:
  ```css
  --glow-healthy: 0 0 20px color-mix(in srgb, var(--color-status-healthy) 15%, transparent);
  --glow-healthy-hover: 0 0 30px color-mix(in srgb, var(--color-status-healthy) 25%, transparent);
  ```
- **Fix:** Replace all 8 glow variables (healthy, degraded, warning, accent x base/hover) with `color-mix()` referencing their status color variables.
- **Impact:** Single source of truth for colors, automatic consistency between dark/light themes. Reduces the light mode override block.
- **Priority:** P3

### [P3] Inline color-mix in TSX could use CSS custom properties
- **File:** Multiple TSX files (events page, namespaces page, deployments page)
- **Issue:** Several pages construct `color-mix()` strings in JS template literals for dynamic status backgrounds:
  ```tsx
  style={{ background: `color-mix(in srgb, ${statusColor} 16%, transparent)` }}
  ```
- **Modern approach:** Define a CSS class pattern like `.status-bg-tint` that uses `--status-color` custom property, reducing inline style computation.
- **Fix:** Create utility classes in globals.css:
  ```css
  .status-tint { background: color-mix(in srgb, var(--status-color) 16%, transparent); }
  ```
  Then in TSX: `style={{ '--status-color': statusColor } as CSSProperties}`
- **Impact:** Moves computation to CSS engine, reduces style recalc cost.
- **Priority:** P3

---

## 5. CSS `light-dark()` Function

### [P2] Theme system duplicates all properties instead of using `light-dark()`
- **File:** `apps/web/src/app/globals.css:74-253`
- **Issue:** The theme system defines 40+ custom properties under `:root` (dark), then redefines them all under `html.light` (lines 183-253). This is 180 lines of duplicated property definitions. The CSS `light-dark()` function (baseline since Jan 2024) can express both values inline.
- **Modern approach:**
  ```css
  :root {
    color-scheme: dark light;
    --color-bg-primary: light-dark(rgb(248, 250, 252), #0a0a0f);
    --color-bg-card: light-dark(#ffffff, #14141f);
    --color-text-primary: light-dark(#1a202c, #e8ecf4);
    /* ... etc */
  }
  ```
  This eliminates the entire `html.light {}` block for simple color swaps.
- **Fix:** **Not recommended for this codebase.** The current pattern uses `next-themes` with class-based toggling (`attribute="class"`), not the native `color-scheme` property. `light-dark()` requires `color-scheme: light dark` on the root element and respects the `prefers-color-scheme` media query or the `color-scheme` CSS property. The class-based approach is more compatible with SSR hydration and `next-themes`'s `disableTransitionOnChange` behavior. Migration would require changing the theme provider strategy.
- **Impact:** Would reduce CSS by ~70 lines but requires architectural change to theme provider. Risk of SSR flash issues.
- **Priority:** P2 (informational — not actionable without theme provider changes)

---

## 6. Bundle Analysis & Dynamic Imports

### [P0] Recharts not dynamically imported (~150KB gzipped)
- **File:** `apps/web/src/components/charts/` (8 chart components)
- **Issue:** All 8 Recharts chart components are statically imported:
  - `ClusterHealthChart.tsx`, `ResourceUsageChart.tsx`, `UptimeChart.tsx`, `AlertsTimelineChart.tsx`
  - `RequestRateChart.tsx`, `SparklineChart.tsx`, `MetricsAreaChart.tsx`, `ResourceSparkline.tsx`
  These are imported in `DashboardCharts.tsx` (line 7-10) and various widget/metrics components. Recharts is ~150KB gzipped — one of the heaviest dependencies. Charts are below the fold on most pages.
- **Modern approach:** Dynamic import chart components with `next/dynamic` and loading skeletons.
- **Fix:**
  ```tsx
  // components/charts/DashboardCharts.tsx
  import dynamic from 'next/dynamic'
  import { CardSkeleton } from '@/components/CardSkeleton'

  const ClusterHealthChart = dynamic(() => import('./ClusterHealthChart').then(m => ({ default: m.ClusterHealthChart })), {
    loading: () => <CardSkeleton className="h-[300px]" />,
  })
  // ... repeat for other charts
  ```
- **Impact:** ~150KB removed from initial page load. Charts load on-demand when scrolled into view or when dashboard tab is active.
- **Priority:** P0

### [P1] CommandPalette loaded eagerly in providers.tsx (~20KB)
- **File:** `apps/web/src/components/providers.tsx:92`
- **Issue:** `<CommandPalette />` is rendered in the root provider tree (line 92), meaning the cmdk library (~20KB) is included in every page's initial bundle. Users open the command palette rarely (Cmd+K shortcut).
- **Modern approach:** Dynamically import CommandPalette with `next/dynamic`.
- **Fix:**
  ```tsx
  // providers.tsx
  import dynamic from 'next/dynamic'
  const CommandPalette = dynamic(() => import('./CommandPalette').then(m => ({ default: m.CommandPalette })), {
    ssr: false,
  })
  ```
- **Impact:** ~20KB removed from initial bundle. Command palette loads lazily when first needed.
- **Priority:** P1

### [P1] AI Chat components not code-split (~50KB)
- **File:** `apps/web/src/components/ai/` (6 components)
- **Issue:** AI components (`AiChat.tsx`, `AiCommandPaletteProvider.tsx`, `InlineAiPanel.tsx`, etc.) are statically imported. Only users visiting `/ai` need the full chat component.
- **Modern approach:** Dynamic import on the `/ai` route page.
- **Fix:**
  ```tsx
  // app/ai/page.tsx
  import dynamic from 'next/dynamic'
  const AiChat = dynamic(() => import('@/components/ai/AiChat').then(m => ({ default: m.AiChat })), {
    ssr: false,
    loading: () => <AiChatSkeleton />,
  })
  ```
- **Impact:** ~50KB of AI-specific code removed from non-AI pages.
- **Priority:** P1

### [P1] Missing `optimizePackageImports` in next.config.ts
- **File:** `apps/web/next.config.ts:6-28`
- **Issue:** No `experimental.optimizePackageImports` configured. Libraries like `lucide-react` (564 icons imported), `@radix-ui/*`, and `recharts` benefit from automatic tree-shaking optimization.
- **Modern approach:** Next.js 16 supports `optimizePackageImports` to enable per-module tree shaking for barrel-export libraries.
- **Fix:**
  ```ts
  const nextConfig: NextConfig = {
    experimental: {
      optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-*', 'cmdk'],
    },
    // ...existing config
  }
  ```
- **Impact:** Can reduce bundle size by 10-30KB depending on tree-shaking effectiveness, especially for `lucide-react` which exports 1500+ icons but only ~30 are used.
- **Priority:** P1

### [P2] No React.memo on frequently re-rendered components
- **File:** All widget components, DataTable rows, chart components
- **Issue:** Zero `React.memo()` usage found across the entire codebase. Components like `StatCardsWidget`, chart components, and table rows may re-render unnecessarily when parent state changes.
- **Modern approach:** React 19's compiler can auto-memoize, but without React Compiler enabled, manual `React.memo` is still valuable for expensive renders.
- **Fix:** Wrap pure display components:
  ```tsx
  export const StatCardsWidget = React.memo(function StatCardsWidget() { ... })
  export const ClusterHealthChart = React.memo(function ClusterHealthChart({ data }: Props) { ... })
  ```
- **Impact:** Reduces unnecessary re-renders in the dashboard and data-heavy pages.
- **Priority:** P2

---

## 7. Image Optimization

### [P2] Image optimization disabled globally
- **File:** `apps/web/next.config.ts:13-15`
- **Issue:** `images: { unoptimized: true }` disables all Next.js image optimization. No `next/image` component usage found (0 imports). The only image-like element is a favicon reference in layout metadata.
- **Modern approach:** For a Kubernetes dashboard that's mostly data/tables/charts, this is acceptable — there are no user-uploaded images or photo content. The favicon is served statically.
- **Fix:** No change needed. The app is data-centric with no heavy image content. Re-enable optimization only if hero images, screenshots, or user avatars are added.
- **Impact:** N/A for current app.
- **Priority:** P2 (informational)

---

## 8. React 19 Patterns

### [P2] No `use()` hook adoption
- **File:** Entire `apps/web/src/` codebase
- **Issue:** React 19's `use()` hook is not used anywhere. All async data is fetched via tRPC + TanStack Query hooks. The `use()` hook could be valuable for reading context or resolved promises in Server Components.
- **Modern approach:** For this codebase, TanStack Query is the correct pattern for data fetching. `use()` is more relevant for RSC patterns with streaming.
- **Fix:** No change needed. tRPC + TanStack Query is the superior pattern for this app's client-heavy architecture.
- **Impact:** N/A
- **Priority:** P2 (informational)

### [P2] 35 files with `'use client'` — some may be unnecessary
- **File:** All pages and components with `'use client'`
- **Issue:** Every page file has `'use client'` directive. Some pages (like `settings/page.tsx` which is a static hub of links) might not need client-side interactivity and could be Server Components.
- **Modern approach:** Audit each page to determine if it truly needs client interactivity. Pages that are pure layout/navigation could be Server Components, reducing the client JS bundle.
- **Fix:** Review each page:
  - Candidates for Server Component: `settings/page.tsx` (static link hub), `health/page.tsx` (if it only displays server-fetched data)
  - Must stay client: Any page using `trpc.*.useQuery()`, `useState`, `useEffect`, Motion, or other hooks
- **Impact:** Small reduction in client bundle for pages that can be RSC.
- **Priority:** P2

### [P1] No Suspense boundaries for data-fetching components
- **File:** Most page components
- **Issue:** Only 5 Suspense boundaries found in the entire app (webhooks, karpenter, home page, login, root loading). Most pages use `if (query.isLoading) return <LoadingState />` pattern instead of Suspense. This prevents React 19 from streaming partial content.
- **Modern approach:** Wrap data-dependent sections in `<Suspense>` with skeleton fallbacks. Combined with tRPC's `suspense: true` option, this enables progressive rendering.
- **Fix:**
  ```tsx
  // Example: clusters/page.tsx
  <Suspense fallback={<ClusterListSkeleton />}>
    <ClusterList />
  </Suspense>
  ```
  Enable per-query: `trpc.clusters.list.useSuspenseQuery()`
- **Impact:** Better perceived performance — shell renders immediately while data streams in. Enables future RSC streaming patterns.
- **Priority:** P1

---

## 9. Lazy Loading

### [P1] Dashboard widget components not lazy loaded
- **File:** `apps/web/src/components/dashboard/DashboardGrid.tsx:8-15`
- **Issue:** All 8 widget components are statically imported at the top of `DashboardGrid.tsx`. While `react-grid-layout` itself IS dynamically imported (good, line 72), the widgets that render inside it are not.
- **Modern approach:** Since widgets render inside a grid that's already deferred, lazy-loading the widgets too creates a progressive loading experience.
- **Fix:**
  ```tsx
  const StatCardsWidget = dynamic(() => import('./widgets/StatCardsWidget').then(m => ({ default: m.StatCardsWidget })))
  const ClusterHealthWidget = dynamic(() => import('./widgets/ClusterHealthWidget').then(m => ({ default: m.ClusterHealthWidget })))
  // ... etc
  ```
- **Impact:** Widget code loads only when the dashboard is visible and the grid has initialized.
- **Priority:** P1

### [P2] Below-the-fold components on cluster detail page
- **File:** `apps/web/src/app/clusters/[id]/layout.tsx`
- **Issue:** The cluster detail page has 10 tabs (overview, nodes, pods, deployments, services, namespaces, events, logs, metrics, autoscaling). All tab content loads when the page mounts. Only the active tab is visible.
- **Modern approach:** Each tab's content should be lazy-loaded. Next.js App Router's nested routing already provides code splitting per route, so this may already be partially handled — verify with bundle analysis.
- **Fix:** Verify that each `clusters/[id]/*/page.tsx` route is code-split by Next.js. If not, wrap tab content in dynamic imports.
- **Impact:** Only the active tab's code loads. Other tabs load on navigation.
- **Priority:** P2

---

## 10. CSS-Only Animation Alternatives

### [P2] MotionButton hover/tap could be CSS-only
- **File:** `apps/web/src/components/MotionButton.tsx:15-24`
- **Issue:** `MotionButton` uses Motion for `whileHover={{ scale: 1.02 }}` and `whileTap={{ scale: 0.97 }}`. This is a simple scale transition that CSS handles natively with better performance (GPU-composited).
- **Modern approach:** Pure CSS with Tailwind utilities.
- **Fix:**
  ```tsx
  export function MotionButton({ children, className, ...props }: ButtonProps) {
    return (
      <button
        className={cn(
          'transition-transform duration-75 ease-out hover:scale-[1.02] active:scale-[0.97]',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
  ```
- **Impact:** Removes Motion dependency from button component. CSS transforms are GPU-composited, reducing main thread work.
- **Priority:** P2

### [P2] DataTable pagination button animations
- **File:** `apps/web/src/components/DataTable.tsx` (pagination section)
- **Issue:** Pagination buttons use `motion.button` with the same `whileHover/whileTap` pattern as MotionButton.
- **Modern approach:** Same CSS-only approach as MotionButton.
- **Fix:** Replace `motion.button` with `<button className="hover:scale-[1.02] active:scale-[0.97] transition-transform">`.
- **Impact:** Reduces Motion element count in DataTable.
- **Priority:** P2

### [P2] ClusterHealthIndicator color transitions
- **File:** `apps/web/src/components/ClusterHealthIndicator.tsx:103-133`
- **Issue:** Health dot uses `motion.span` with `animate={{ backgroundColor: color }}` for color transitions. CSS `transition: background-color` handles this natively.
- **Modern approach:**
  ```tsx
  <span
    className="transition-colors duration-300"
    style={{ backgroundColor: color }}
  />
  ```
- **Fix:** Replace `motion.span` with standard element + CSS transition for the color change. Keep Motion only for the scale pulse animation (degraded/critical states) which CSS cannot easily replicate.
- **Impact:** Simpler implementation for the common case (healthy → degraded color change).
- **Priority:** P2

### [P3] ProviderLogo animation is trivially simple
- **File:** `apps/web/src/components/ProviderLogo.tsx:39-46`
- **Issue:** Uses `motion.div` for what appears to be a minimal animation. This could be a CSS class.
- **Modern approach:** Use CSS `@starting-style` or `transition` properties.
- **Fix:** Replace with CSS animation class.
- **Impact:** Minor — removes one Motion element.
- **Priority:** P3

### [INFO] Animations that SHOULD stay as Motion
The following animations require Motion's JS runtime and should NOT be converted to CSS:
- **AnimatedList stagger** (`AnimatedList.tsx`) — CSS cannot stagger dynamic children with unknown count
- **AnimatedStatCount** (`AnimatedStatCount.tsx`) — JS-driven number interpolation using `useMotionValue`
- **Sidebar layoutId** (`Sidebar.tsx:187-200`) — `layoutId` shared layout animations are unique to Motion
- **AppLayout spring** (`AppLayout.tsx:102-115`) — spring physics with specific stiffness/damping
- **AddClusterWizard** (`AddClusterWizard.tsx:347`) — multi-step AnimatePresence exit transitions
- **Dialog variants** (`ui/dialog.tsx`) — complex AnimatePresence exit + enter coordination

---

## 11. Recharts Optimization

### [P2] Chart data not memoized in DashboardCharts
- **File:** `apps/web/src/components/charts/DashboardCharts.tsx:18-30`
- **Issue:** `DashboardCharts` passes raw query data objects directly to chart components. When `range` state changes, all 4 charts re-render even if their specific data hasn't changed. The `queryOpts` object is created inline but uses `as const` assertion.
- **Modern approach:** Memoize chart data transformations, and use `staleTime` + `gcTime` from `chart-theme.ts` (already done — `METRICS_STALE_TIME: 60_000`).
- **Fix:** The current implementation with `staleTime` + `gcTime` in `chart-theme.ts:16-19` is actually well-structured. Consider wrapping individual chart components in `React.memo` to prevent re-renders when sibling chart data changes.
- **Impact:** Reduces unnecessary chart re-renders.
- **Priority:** P2

### [P2] SparklineChart and ResourceSparkline have no memoization
- **File:** `apps/web/src/components/charts/SparklineChart.tsx`, `apps/web/src/components/metrics/ResourceSparkline.tsx`
- **Issue:** Sparkline charts are small, inline charts used in tables and cards. They render frequently as table rows update. Without `React.memo`, each parent re-render forces a full Recharts render cycle.
- **Modern approach:** Wrap sparkline components in `React.memo` with custom comparison.
- **Fix:**
  ```tsx
  export const SparklineChart = React.memo(function SparklineChart({ data, color }: Props) {
    // existing render logic
  }, (prev, next) => prev.data === next.data && prev.color === next.color)
  ```
- **Impact:** Prevents expensive Recharts SVG recomputation on unrelated state changes.
- **Priority:** P2

---

## 12. TanStack Query Optimization

### [P1] No global `staleTime` — default is 0 (always stale)
- **File:** `apps/web/src/components/providers.tsx:51-67`
- **Issue:** The QueryClient has no default `staleTime` set. TanStack Query's default is 0, meaning every query is considered stale immediately. This causes unnecessary refetches on component mount and window focus. Some queries set their own `staleTime` (e.g., `DashboardCharts` uses `60_000`, `usePresence` uses `15_000`) but most rely on the default.
- **Modern approach:** Set a reasonable global `staleTime` for the app type (ops dashboard with 30-60s refresh cycles).
- **Fix:**
  ```tsx
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30s — data considered fresh for 30s
        refetchOnWindowFocus: 'always', // still refetch on tab switch
        retry: (failureCount, error) => {
          handleTRPCError(error)
          return failureCount < 3
        },
      },
      mutations: {
        onError: handleTRPCError,
      },
    },
  })
  ```
- **Impact:** Significantly reduces unnecessary API calls. With 113+ useQuery instances, even a 30s staleTime prevents thousands of redundant requests per session.
- **Priority:** P1

### [P2] Inconsistent refetchInterval patterns
- **File:** Multiple files
- **Issue:** Different components use different refetch intervals without clear justification:
  - Sidebar clusters: 60,000ms
  - Sidebar alerts: 30,000ms
  - Presence polling: 45,000ms
  - Health page: 30,000ms
  - Metrics: varies by user setting
  These intervals are hardcoded in component files rather than centralized.
- **Modern approach:** Centralize refetch intervals in `packages/config` alongside other constants.
- **Fix:** Add to `packages/config/src/cache.ts`:
  ```ts
  export const REFETCH_INTERVALS = {
    CLUSTERS_MS: 60_000,
    ALERTS_MS: 30_000,
    HEALTH_MS: 30_000,
    PRESENCE_POLLING_MS: 45_000,
  } as const
  ```
- **Impact:** Single source of truth for polling intervals. Easier to tune for performance.
- **Priority:** P2

---

## 13. Font Loading

### [INFO] Font strategy is well-optimized
- **File:** `apps/web/src/app/layout.tsx:6-20`
- **Issue:** None — the font loading strategy is solid.
- **Modern approach:** Already implemented correctly:
  - `next/font/local` for Geist Sans and Geist Mono (variable fonts, single woff2 file each)
  - `display: 'swap'` for both (prevents invisible text during load)
  - `preload: true` for sans (critical path), `preload: false` for mono (code blocks only)
  - Variable font weight range `100-900` in single file (no per-weight requests)
- **Fix:** No changes needed.
- **Impact:** N/A — already optimized.
- **Priority:** N/A

### [P3] Consider font subsetting
- **File:** `apps/web/src/app/fonts/GeistVF.woff2`
- **Issue:** Full variable font files are served. For a Latin-script-only dashboard, unicode-range subsetting could reduce the sans font file by ~30%.
- **Modern approach:** `next/font/local` supports `unicode-range` subsets. However, Geist is already a compact font (~100KB).
- **Fix:** Add unicode range if needed: `unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'`
- **Impact:** Small file size reduction (~20-30KB per font). Low priority given the font is already compact.
- **Priority:** P3

---

## 14. Third-Party Script Impact

### [INFO] Sentry is conditionally loaded
- **File:** `apps/web/next.config.ts:31-39`
- **Issue:** Sentry is wrapped conditionally — only active when `NEXT_PUBLIC_SENTRY_DSN` is set. The `disableLogger: true` option reduces runtime overhead. Source maps are uploaded via `widenClientFileUpload`.
- **Modern approach:** Current implementation is correct. Sentry adds ~30-40KB but only when DSN is configured.
- **Fix:** No change needed.
- **Impact:** N/A
- **Priority:** N/A

### [P3] Sentry could use `lazyLoadIntegration` for lighter init
- **File:** Sentry SDK initialization (implicit via `@sentry/nextjs`)
- **Issue:** `@sentry/nextjs` v10 supports lazy loading non-critical integrations (replay, profiling) to reduce initial bundle.
- **Modern approach:** Configure Sentry to lazy-load replay:
  ```ts
  // sentry.client.config.ts
  Sentry.init({
    integrations: [
      Sentry.lazyLoadIntegration('replayIntegration'),
    ],
  })
  ```
- **Fix:** Verify if `sentry.client.config.ts` exists and optimize integration loading.
- **Impact:** Can save 10-20KB on initial load if replay is configured.
- **Priority:** P3

---

## 15. Summary Matrix

| # | Finding | Severity | Priority | Est. Savings | Effort |
|---|---------|----------|----------|-------------|--------|
| 6a | Recharts not dynamically imported | High | **P0** | ~150KB gzip | Low |
| 1 | No View Transitions API | Medium | **P1** | JS overhead | Medium |
| 2a | Dashboard widgets need container queries | Medium | **P1** | UX quality | Medium |
| 6b | CommandPalette loaded eagerly | Medium | **P1** | ~20KB gzip | Low |
| 6c | AI Chat not code-split | Medium | **P1** | ~50KB gzip | Low |
| 6d | Missing `optimizePackageImports` | Medium | **P1** | ~10-30KB | Low |
| 8c | No Suspense boundaries | Medium | **P1** | Perceived perf | Medium |
| 9a | Dashboard widgets not lazy loaded | Medium | **P1** | Code split | Low |
| 12a | No global staleTime (default 0) | Medium | **P1** | API calls | Low |
| 2b | Cluster cards container queries | Low | **P2** | UX quality | Low |
| 3a | FadeIn could use @starting-style | Low | **P2** | ~2KB | Low |
| 3b | ErrorBoundary CSS-only | Low | **P2** | ~1KB | Low |
| 5 | light-dark() not applicable (class-based themes) | Info | **P2** | N/A | N/A |
| 6e | No React.memo on components | Low | **P2** | Re-renders | Medium |
| 8b | 35 'use client' — some unnecessary | Low | **P2** | Bundle size | Medium |
| 9b | Below-fold cluster tabs | Low | **P2** | Code split | Low |
| 10a | MotionButton CSS-only candidate | Low | **P2** | ~1KB | Low |
| 10b | DataTable button animations | Low | **P2** | ~1KB | Low |
| 10c | Health indicator color transition | Low | **P2** | Simplicity | Low |
| 11a | Chart data not memoized | Low | **P2** | Re-renders | Low |
| 11b | Sparkline no memoization | Low | **P2** | Re-renders | Low |
| 12b | Inconsistent refetchIntervals | Low | **P2** | Consistency | Low |
| 2c | Sidebar container queries | Low | **P2** | UX quality | Medium |
| 4a | Glow effects hardcoded rgba | Low | **P3** | Consistency | Low |
| 4b | Inline color-mix in TSX | Low | **P3** | Perf | Medium |
| 10d | ProviderLogo trivial animation | Low | **P3** | ~0.5KB | Low |
| 13 | Font subsetting | Low | **P3** | ~20-30KB | Low |
| 14 | Sentry lazy integrations | Low | **P3** | ~10-20KB | Low |
| 3c | Dialog overlay @starting-style | Low | **P3** | Complexity | High |

### Estimated Total Bundle Savings (P0+P1 items)
- **Recharts dynamic import:** ~150KB gzipped
- **CommandPalette dynamic import:** ~20KB gzipped
- **AI Chat code split:** ~50KB gzipped
- **optimizePackageImports:** ~10-30KB gzipped
- **Total potential P0+P1 savings:** ~230-250KB gzipped from initial page load

### What's Already Good
- LazyMotion with `domAnimation` saves ~23KB (P3-013)
- `MotionConfig reducedMotion="user"` respects system accessibility preferences
- `color-mix()` used extensively for dynamic theming (18+ instances)
- Font strategy is optimal (variable fonts, selective preload, display:swap)
- Sentry conditionally loaded
- `react-grid-layout` already dynamically imported
- Comprehensive `prefers-reduced-motion` support in both CSS and JS
- `will-change: transform` used selectively (cluster card rotating border only)
- `output: 'standalone'` for optimized Docker builds
- `compress: true` for gzip/brotli
