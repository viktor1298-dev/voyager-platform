# Voyager Platform — UI Redesign Plan v1
**Date:** 2026-03-07 | **Status:** ✅ Approved — Ready for Pipeline  
**Stack:** Next.js 16 · React 19 · Tailwind 4 · Motion 12 · Recharts 3 · shadcn/ui · TanStack · Zustand 5 · tRPC 11

---

## Executive Summary

Voyager Platform's navigation suffers from a **split information architecture**: cluster-specific data (Services, Deployments, Namespaces, Logs, Events, Autoscaling, Anomalies) is scattered across 7 top-level sidebar pages that should live inside the cluster detail page. The sidebar has **20 items** — 3× the industry standard of 6–7. Two cluster detail tabs (Services, Deployments) are **empty stubs** that redirect users away. Motion v12 features (`layoutId`, `useInView`, `Reorder`, `useScroll`) are completely unused.

**The Fix:**
1. **Collapse sidebar to 6 global items** — Dashboard, Clusters, Alerts, AI Assistant, Dashboards, Settings
2. **Make cluster detail the command center** — 10 real tabs with path-based URLs (`/clusters/[id]/nodes`)
3. **Activate Motion v12** — shared element transitions, tab animations, staggered data loading

| Metric | Current | After Redesign |
|--------|---------|----------------|
| Sidebar items | 20 | 6 |
| Cluster detail tabs (with real data) | 4 of 7 | 10 of 10 |
| Motion features used | 4 of 16 | 12 of 16 |
| Navigation clicks to pod detail | 3–4 | 2 |
| Shareable deep links per tab | ❌ | ✅ Path-based |
| UX Score | 4.8/10 | 8.5/10 |

---

## 🚨 Critical Bugs (Fix in Phase 1 — Before Anything Else)

- [ ] **BUG-RD-001** 🔴 Cluster quick-links navigate to `/clusters` instead of `/clusters/${id}` — dead link
- [ ] **BUG-RD-002** 🔴 Services tab in cluster detail is an empty stub (redirects away)
- [ ] **BUG-RD-003** 🔴 Deployments tab in cluster detail is an empty stub (redirects away)
- [ ] **BUG-RD-004** 🟡 Pods tab disappears entirely without live cluster connection (no fallback)
- [ ] **BUG-RD-005** 🟡 Overview tab duplicates header card stats (same 4 metrics shown twice)

---

## 📋 PIPELINE BOARD — All Tasks

> **How to use this BOARD:**
> Foreman assigns tasks to agents. Each phase must complete + pass QA before next phase starts.
> Legend: 👷 Ron (frontend) · 💻 Dima (backend) · 🔄 Gil (git) · 🔧 Uri (deploy) · 🧬 Yuval (E2E) · 🧪 Mai (QA)

---

### 🔵 Phase 1 — Foundation (Sprint 1–2)
**Goal:** New 6-item sidebar + path-based cluster routing + critical bug fixes

#### Navigation & Routing
- [ ] **P1-001** 👷 Refactor `config/navigation.ts` — reduce to 6 global items, remove cluster-specific entries
- [ ] **P1-002** 👷 Rewrite `Sidebar.tsx` — `layoutId` active indicator, spring collapse, icon-only mode, `Cmd+B` toggle
- [ ] **P1-003** 👷 Fix BUG-RD-001: cluster quick-links — change `href="/clusters"` → `href={/clusters/${cluster.id}}`
- [ ] **P1-004** 👷 Add auto-collapse logic to `AppLayout.tsx` — sidebar auto-collapses when entering `/clusters/[id]/*`
- [ ] **P1-005** 👷 Create `app/clusters/[id]/layout.tsx` — shared cluster header + horizontal 10-tab bar with `layoutId` underline
- [ ] **P1-006** 👷 Migrate current cluster detail to `app/clusters/[id]/page.tsx` (Overview tab)
- [ ] **P1-007** 👷 Create route stubs for all 10 cluster tabs (nodes/pods/deployments/services/namespaces/events/logs/metrics/autoscaling)
- [ ] **P1-008** 👷 Fix BUG-RD-005: remove duplicate stat cards from Overview tab
- [ ] **P1-009** 👷 Update `Breadcrumbs.tsx` for new route structure: `Dashboard / Clusters / cluster-name / tab-name`
- [ ] **P1-010** 👷 Move cluster quick-switch to sidebar footer (recent clusters with env color dots)

#### Settings Consolidation
- [ ] **P1-011** 👷 Expand `/settings` to tabbed layout — absorb: Users, Teams, Permissions, Webhooks, Feature Flags, Audit Log
- [ ] **P1-012** 👷 Remove 6 admin items from sidebar (all moved into Settings tabs)

#### Global Infrastructure
- [ ] **P1-013** 👷 Add `MotionConfig reducedMotion="user"` to `providers.tsx` — replaces all manual `useReducedMotion` hooks
- [ ] **P1-014** 👷 Install + configure `nuqs` for URL-synced filter state
- [ ] **P1-015** 👷 Update animation constants in `lib/animation-constants.ts` (new DURATION/EASING/STAGGER values)
- [ ] **P1-016** 👷 Merge Health page into Dashboard overview section
- [ ] **P1-017** 👷 Merge Anomalies into Alerts page (global view)

---

### 🟡 Phase 2 — Content Enrichment (Sprint 3–5)
**Goal:** Every cluster tab has real data. No more stubs.

#### Backend (Dima)
- [ ] **P2-001** 💻 tRPC: `cluster.deployments.listByCluster(clusterId)` — returns real deployments
- [ ] **P2-002** 💻 tRPC: `cluster.services.listByCluster(clusterId)` — returns real services
- [ ] **P2-003** 💻 tRPC: `cluster.namespaces.list(clusterId)` — returns namespaces + resource quotas
- [ ] **P2-004** 💻 tRPC: `cluster.logs.stream(clusterId, podName, container)` — log streaming endpoint
- [ ] **P2-005** 💻 tRPC: `cluster.pods.listStored(clusterId)` — returns last-known pod state for offline clusters

#### Frontend (Ron)
- [ ] **P2-006** 👷 Deployments tab — wire to `trpc.cluster.deployments.listByCluster`, fix BUG-RD-003
- [ ] **P2-007** 👷 Services tab — wire to `trpc.cluster.services.listByCluster`, fix BUG-RD-002
- [ ] **P2-008** 👷 Namespaces tab — list + resource quotas table
- [ ] **P2-009** 👷 Logs tab — pod log streaming within cluster context with pod selector
- [ ] **P2-010** 👷 Pods tab — show stored pod data when cluster offline, fix BUG-RD-004
- [ ] **P2-011** 👷 Events tab — add real-time updates via SSE
- [ ] **P2-012** 👷 Autoscaling tab — move Karpenter page into `/clusters/[id]/autoscaling`
- [ ] **P2-013** 👷 Command Palette (`Cmd+K`) — add cluster tab shortcuts (e.g., "prod-cluster → Pods")
- [ ] **P2-014** 👷 Add keyboard navigation: `1`–`9` to switch cluster tabs, `[` / `]` for prev/next tab

---

### 🟢 Phase 3 — Animation Polish (Sprint 6–7)
**Goal:** Production-quality animations. Motion v12 fully utilized.

- [ ] **P3-001** 👷 Sidebar spring collapse animation (`motion.aside` width: 56px ↔ 224px, `spring(300,30)`)
- [ ] **P3-002** 👷 Active nav indicator `layoutId="sidebar-active-bg"` + left border bar
- [ ] **P3-003** 👷 Tab underline `layoutId="cluster-tab-underline"` spring animation (`stiffness:500, damping:40`)
- [ ] **P3-004** 👷 Tab content crossfade: `AnimatePresence mode="wait"` — exit -4px, enter +8px, 200ms
- [ ] **P3-005** 👷 Data table row stagger entrance with `useInView` (once, `-50px` margin)
- [ ] **P3-006** 👷 Animated stat count-up in cluster header (`useMotionValue` + `animate()`, 800ms decelerate)
- [ ] **P3-007** 👷 Button micro-interactions: `whileHover={{scale:1.02}}` + `whileTap={{scale:0.97}}`
- [ ] **P3-008** 👷 Card hover lift: `whileHover={{y:-2, boxShadow:"0 8px 24px rgba(0,0,0,0.12)"}}`
- [ ] **P3-009** 👷 Skeleton → stagger entrance for all data loading states (`AnimatePresence mode="popLayout"`)
- [ ] **P3-010** 👷 Install `vaul` — drawer for pod detail, alert detail on mobile
- [ ] **P3-011** 👷 Install `react-resizable-panels` — split-pane for logs + cluster content
- [ ] **P3-012** 👷 Shared element transition: cluster list icon → cluster detail icon (`layoutId="cluster-icon-{id}"`)
- [ ] **P3-013** 👷 Remove dead code: unused hooks, old sidebar routes, `@tanstack/react-form` (0 imports)
- [ ] **P3-014** 👷 Wrap heavy animations with `LazyMotion + domAnimation` (saves ~23kb gzipped)

---

## 🧪 E2E Test Checklist

> **Yuval owns all E2E specs.** Add one spec file per feature area.
> Pre-run guard: `BASE_URL` + BYOK contamination check + environment preflight.

### Phase 1 E2E — Navigation & Routing

**File:** `tests/e2e/sidebar-redesign.spec.ts`
- [ ] **E2E-P1-001** Sidebar shows exactly 6 items (no cluster-specific items)
- [ ] **E2E-P1-002** Sidebar collapses to icon-only on `Cmd+B` — labels hidden, icons visible
- [ ] **E2E-P1-003** Sidebar auto-collapses when navigating to any `/clusters/[id]/*` route
- [ ] **E2E-P1-004** Active nav item has correct highlight (not just bold text)
- [ ] **E2E-P1-005** Recent clusters in sidebar footer link to `/clusters/{id}` (not `/clusters`)

**File:** `tests/e2e/cluster-routing.spec.ts`
- [ ] **E2E-P1-006** Navigating to `/clusters/[id]` shows 10 tab items in header
- [ ] **E2E-P1-007** Each tab navigates to correct path: `/clusters/[id]/nodes`, `/clusters/[id]/pods`, etc.
- [ ] **E2E-P1-008** Breadcrumb shows: Dashboard › Clusters › [cluster-name] › [tab]
- [ ] **E2E-P1-009** Browser back button returns to Clusters list from cluster detail
- [ ] **E2E-P1-010** Deep link `/clusters/[id]/nodes` loads directly without redirects
- [ ] **E2E-P1-011** Tab URL is shareable — open in new tab lands on correct tab content

**File:** `tests/e2e/settings-consolidation.spec.ts`
- [ ] **E2E-P1-012** `/settings` has tabs: General, Users, Teams, Permissions, Webhooks, Feature Flags, Audit Log
- [ ] **E2E-P1-013** Old routes `/users`, `/teams`, `/permissions`, `/webhooks`, `/features`, `/audit` redirect to `/settings/*`
- [ ] **E2E-P1-014** Settings admin tabs show actual data (not empty states)

**File:** `tests/e2e/critical-bug-fixes.spec.ts`
- [ ] **E2E-P1-015** BUG-RD-001: Cluster quick-link in sidebar navigates to `/clusters/{id}` — not `/clusters`
- [ ] **E2E-P1-016** BUG-RD-005: Overview tab shows stats exactly once (no duplicate cards)

---

### Phase 2 E2E — Cluster Tab Data

**File:** `tests/e2e/cluster-tabs-data.spec.ts`
- [ ] **E2E-P2-001** Deployments tab: shows table with Name, Namespace, Ready, Image, Age columns
- [ ] **E2E-P2-002** Deployments tab: data loads for a real cluster (not empty state)
- [ ] **E2E-P2-003** Services tab: shows table with Name, Type, ClusterIP, Ports, Age columns
- [ ] **E2E-P2-004** Services tab: data loads for a real cluster (not empty state)
- [ ] **E2E-P2-005** Namespaces tab: shows list of namespaces with status and resource quota
- [ ] **E2E-P2-006** Pods tab: shows stored pod data when cluster is offline (not blank)
- [ ] **E2E-P2-007** Pods tab: namespace filter works (`?ns=kube-system`)
- [ ] **E2E-P2-008** Events tab: events are sorted by timestamp, newest first
- [ ] **E2E-P2-009** Logs tab: pod selector dropdown shows available pods
- [ ] **E2E-P2-010** Logs tab: selecting a pod shows streaming log output
- [ ] **E2E-P2-011** Autoscaling tab: Karpenter resources render (or graceful empty if not configured)
- [ ] **E2E-P2-012** Metrics tab: time-series charts render with data (not blank)

**File:** `tests/e2e/command-palette-enhanced.spec.ts`
- [ ] **E2E-P2-013** `Cmd+K` palette includes cluster-tab navigation items when in cluster detail
- [ ] **E2E-P2-014** Palette navigation result: selecting "prod → Pods" navigates to `/clusters/[id]/pods`
- [ ] **E2E-P2-015** Keyboard `1`–`9` switches cluster tabs correctly (1=Overview, 2=Nodes, 3=Pods, ...)
- [ ] **E2E-P2-016** `[` and `]` navigate to prev/next cluster tab without mouse

---

### Phase 3 E2E — Animations & Polish

**File:** `tests/e2e/animations-smoke.spec.ts`
*(Animation tests are smoke tests — verify elements appear, not timing details)*
- [ ] **E2E-P3-001** Sidebar collapse: after `Cmd+B`, sidebar width is `56px` (icon-only)
- [ ] **E2E-P3-002** Tab underline: active tab has underline indicator, inactive tabs do not
- [ ] **E2E-P3-003** Tab switch: content area re-renders (visible DOM change) on tab click
- [ ] **E2E-P3-004** Stat cards: numeric values are present and non-zero after page load
- [ ] **E2E-P3-005** Data tables: rows appear after loading skeleton disappears
- [ ] **E2E-P3-006** Log panel: appears in lower panel, cluster detail content in upper panel
- [ ] **E2E-P3-007** Reduced-motion: if `prefers-reduced-motion: reduce` → no transform animations

**File:** `tests/e2e/responsive-redesign.spec.ts`
- [ ] **E2E-P3-008** At 1440px: sidebar expanded, all 10 cluster tabs visible (no overflow)
- [ ] **E2E-P3-009** At 768px: sidebar in icon-only mode by default
- [ ] **E2E-P3-010** At 375px: horizontal tab bar scrolls, no content clipped

---

## 📐 Information Architecture

### Current Navigation (20 items) → Proposed (6 items)

```
CURRENT SIDEBAR (20)              PROPOSED SIDEBAR (6)
─────────────────────────         ────────────────────────
👁️ OBSERVABILITY                 🏠 Dashboard      /
  Dashboard           ✅ KEEP       (Health merged in)
  Health              → MERGE     🔷 Clusters       /clusters
  Anomalies           → MOVE*     🚨 Alerts         /alerts
  Events              → MOVE        (Anomalies merged in)
  Alerts              ✅ KEEP     🤖 AI Assistant   /ai
  Shared Dashboards   ✅ KEEP     📊 Dashboards     /dashboards
                                  ⚙️ Settings       /settings
⚙️ INFRASTRUCTURE                   (all admin absorbed)
  Clusters            ✅ KEEP     
  Services            → MOVE      CLUSTER DETAIL /clusters/[id]
  Deployments         → MOVE      ┌─ Overview (default)
  Namespaces          → MOVE      ├─ Nodes
  Logs                → MOVE      ├─ Pods
                                  ├─ Deployments  ← was stub, now real
🤖 PLATFORM                       ├─ Services     ← was stub, now real
  AI Assistant        ✅ KEEP     ├─ Namespaces   ← new tab
  Webhooks            → Settings  ├─ Events
  Autoscaling         → MOVE      ├─ Logs         ← new tab
                                  ├─ Metrics
🔐 ADMIN (all → Settings tabs)    └─ Autoscaling  ← was top-level, now here
  Settings            ✅ KEEP
  Feature Flags       → Settings
  Teams               → Settings
  Permissions         → Settings
  Users               → Settings
  Audit Log           → Settings
```
*Anomalies: merged into global Alerts page as a subsection

### URL Structure (Path-Based — Non-Negotiable)

```
/                                        → Dashboard
/clusters                                → Clusters list
/clusters/[id]                           → Cluster Overview
/clusters/[id]/nodes                     → Nodes tab
/clusters/[id]/pods                      → Pods tab
/clusters/[id]/pods?ns=kube-system       → Pods filtered by namespace
/clusters/[id]/deployments               → Deployments tab
/clusters/[id]/services                  → Services tab
/clusters/[id]/namespaces                → Namespaces tab
/clusters/[id]/events                    → Events tab
/clusters/[id]/logs                      → Logs tab
/clusters/[id]/metrics                   → Metrics tab
/clusters/[id]/autoscaling               → Autoscaling tab
/alerts                                  → Global alerts + anomalies
/ai                                      → AI Assistant
/dashboards                              → Shared Dashboards
/settings                                → Settings hub
/settings/users                          → Users management
/settings/teams                          → Teams
/settings/permissions                    → Permissions
/settings/webhooks                       → Webhooks
/settings/features                       → Feature flags
/settings/audit                          → Audit log
```

---

## 🎬 Animation Strategy

### Animation Constants

```typescript
// lib/animation-constants.ts — UPDATED
export const DURATION = {
  instant:      0.08,   // micro-interactions
  fast:         0.15,   // button press, hover
  normal:       0.2,    // tab switch, fade
  slow:         0.3,    // page transition
  page:         0.25,   // route change
  counter:      0.8,    // number count-up
  counterLarge: 1.2,    // large number count-up (>1000)
} as const

export const EASING = {
  default:    [0.25, 0.1, 0.25, 1],
  standard:   [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
  accelerate: [0.4, 0, 1, 1],
  spring:     { type: 'spring', stiffness: 300, damping: 30 },
  snappy:     { type: 'spring', stiffness: 500, damping: 40 },
  bouncy:     { type: 'spring', stiffness: 400, damping: 25, mass: 0.8 },
} as const

export const STAGGER = {
  fast:   0.03,   // dense table rows
  normal: 0.05,   // card grid
  slow:   0.08,   // hero cards
  max:    0.3,    // cap total stagger (10 items max effect)
} as const
```

### Animation Timing Reference

| Animation | Duration | Easing | Notes |
|-----------|----------|--------|-------|
| Sidebar collapse | 250ms | `spring(300,30)` | Width 224→56px |
| Sidebar label fade | 100ms | `linear` | Delay 100ms on expand |
| Active nav indicator | — | `spring(400,35)` | `layoutId` |
| Tab underline | — | `spring(500,40)` | `layoutId` |
| Tab content enter | 200ms | `[0.25,0.1,0.25,1]` | y: 8→0 |
| Tab content exit | 150ms | `[0.4,0,1,1]` | y: 0→-4 |
| Stat count-up | 800ms | `[0,0,0.2,1]` | decelerate |
| Stat count-up (large) | 1200ms | `[0,0,0.2,1]` | — |
| List item stagger | 200ms | `[0.25,0.1,0.25,1]` | 30ms per item |
| Card hover lift | 150ms | `ease-out` | y: -2px |
| Button press | 80ms | `ease-out` | scale 0.97 |
| Skeleton shimmer | 1500ms | `linear` | Loop |
| Page transition | 250ms | `[0.25,0.1,0.25,1]` | — |

### Key Code Patterns

#### Active Sidebar Indicator
```tsx
{isActive && (
  <motion.div
    layoutId="sidebar-active-bg"
    className="absolute inset-0 bg-[var(--color-accent)]/10 rounded-lg"
    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
  />
)}
```

#### Tab Underline Spring
```tsx
{isActive && (
  <motion.div
    layoutId="cluster-tab-underline"
    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-accent)]"
    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
  />
)}
```

#### Tab Content Transition
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={pathname}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```

#### Staggered Data Table
```tsx
<motion.tbody
  variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
  initial="hidden" animate="visible"
>
  {rows.map(row => (
    <motion.tr
      key={row.id}
      variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.2 }}
    >
      ...
    </motion.tr>
  ))}
</motion.tbody>
```

#### Animated Stat Count-Up
```tsx
const count = useMotionValue(0)
const rounded = useTransform(count, v => Math.floor(v))
useEffect(() => {
  const controls = animate(count, numValue, { duration: 0.8, ease: [0,0,0.2,1] })
  return controls.stop
}, [numValue])
// <motion.span>{rounded}</motion.span>
```

#### Global Reduced Motion
```tsx
// providers.tsx — wrap entire app
<MotionConfig reducedMotion="user">
  {children}
</MotionConfig>
```

---

## ⚙️ Tech Stack Enhancements

### Underused (Already Installed — Activate Now)

| Library | Installed | Currently Used | Activate |
|---------|-----------|---------------|---------|
| Motion v12 | ✅ | 4/16 features | `layoutId`, `useInView`, `Reorder`, `MotionConfig`, `whileHover/whileTap`, `useScroll`, `useTransform` |
| cmdk | ✅ | Basic search | Add cluster-tab shortcuts + AI query integration |
| Recharts 3 | ✅ | 8 files | Add animated reference lines, animated axis ticks |
| Zustand 5 | ✅ | 8 stores | Add `persist` middleware for sidebar state + recent clusters |

### Add These Libraries

| Library | Size | Purpose | Install | Priority |
|---------|------|---------|---------|---------|
| `nuqs` | ~6 kB | URL-synced filter state — shareable filtered views, back button works for filters | `pnpm add nuqs` | 🔴 Phase 1 |
| `vaul` | ~8 kB | Mobile-friendly drawers for pod/alert detail | `pnpm add vaul` | 🟡 Phase 3 |
| `react-resizable-panels` | ~12 kB | Split-pane logs + cluster content | `pnpm add react-resizable-panels` | 🟡 Phase 3 |

### Remove These (Dead Weight)

| Library | Why |
|---------|-----|
| `@tanstack/react-form` | Zero imports across entire codebase |

---

## 📚 Design References

| Product | What to Take | Why |
|---------|-------------|-----|
| **Vercel Dashboard** | Project-centric → cluster-centric model, path-based tab URLs | Closest analog to our use case |
| **Linear** | Sidebar UX: collapsible, keyboard-first, contextual sub-nav | Gold standard sidebar |
| **Datadog K8s** | 2-tier nav: global sidebar + resource tabs within context | Most similar to our domain |
| **Grafana** | Panel-density + data table patterns | ❌ Avoid: too flexible, no clear IA |
| **shadcn/ui Sidebar** | `SidebarProvider` composable pattern with `Cmd+B` | Implementation reference |
| **Motion v12 docs** | `layoutId`, `AnimatePresence`, `useInView` | Animation reference |

---

## ❓ Open Questions for Vik

1. **Alerts vs Anomalies merge**: Should Anomalies be a tab inside Alerts, or a separate section within the Alerts page? Currently planning: merged as subsection.
2. **Shared Dashboards**: Keep as top-level sidebar item, or move into cluster context? (Currently: keep global)
3. **Logs tab**: Real-time streaming requires persistent WebSocket — acceptable infra cost?
4. **Phase priority**: Should Phase 2 (content) happen before Phase 3 (animations), or can they run in parallel sprints?
5. **Offline pods fallback**: Show last-known pod data with "⚠️ Offline — data from [timestamp]" badge?

---

## 📁 File Structure (After Redesign)

```
apps/web/src/
├── app/
│   ├── page.tsx                          → Dashboard (Health merged in)
│   ├── clusters/
│   │   ├── page.tsx                      → Clusters list
│   │   └── [id]/
│   │       ├── layout.tsx                → ← NEW: Cluster header + tab bar
│   │       ├── page.tsx                  → Overview tab
│   │       ├── nodes/page.tsx
│   │       ├── pods/page.tsx
│   │       ├── deployments/page.tsx      → ← WAS: stub → now real data
│   │       ├── services/page.tsx         → ← WAS: stub → now real data
│   │       ├── namespaces/page.tsx       → ← NEW tab
│   │       ├── events/page.tsx
│   │       ├── logs/page.tsx             → ← NEW tab
│   │       ├── metrics/page.tsx
│   │       └── autoscaling/page.tsx      → ← MOVED from top-level
│   ├── alerts/page.tsx                   → ← Anomalies merged in
│   ├── ai/page.tsx
│   ├── dashboards/page.tsx
│   └── settings/
│       ├── page.tsx                      → ← NEW: tabbed settings hub
│       ├── users/page.tsx               → ← MOVED from /users
│       ├── teams/page.tsx               → ← MOVED from /teams
│       ├── permissions/page.tsx
│       ├── webhooks/page.tsx
│       ├── features/page.tsx
│       └── audit/page.tsx
├── components/
│   ├── Sidebar.tsx                       → ← Major rewrite: 6 items, layoutId, spring
│   ├── AppLayout.tsx                     → ← Add auto-collapse logic
│   └── Breadcrumbs.tsx                   → ← Update for new routes
└── config/
    └── navigation.ts                     → ← Reduce to 6 global items
```

---

*Single source of truth for the Voyager Platform redesign. All pipeline tasks reference this file.*
*Last updated: 2026-03-07 by Morpheus 🔮*
