# 🏗️ BOARD.md — Voyager v194 (UI Redesign)

**Pipeline:** v194 | **Spec:** REDESIGN-PLAN.md  
**Status:** 🔵 RUNNING  
**Opened:** 2026-03-07  
**Team:** Ron (frontend) · Shiri (frontend-2) · Dima (backend) · Lior (review) · Uri (deploy) · Yuval (E2E) · Mai (QA) · Gil (git)

---

## 🚨 Phase 1 — Foundation (Sprint 1–2)
> **Goal:** New 6-item sidebar + path-based cluster routing + critical bug fixes
> **Runs:** Ron (frontend) + Shiri (frontend-2) in parallel

### Critical Bug Fixes
- [x] **BUG-RD-001** Fix cluster quick-links: `href="/clusters"` → `href={/clusters/${cluster.id}}` *(Ron, 2026-03-07)*
- [x] **BUG-RD-002** Fix Services tab: remove empty stub, wire to real data *(verified: apps/web/src/app/clusters/[id]/services/page.tsx exists with real tRPC data, 2026-03-07)*
- [x] **BUG-RD-003** Fix Deployments tab: remove empty stub, wire to real data *(verified: apps/web/src/app/clusters/[id]/deployments/page.tsx exists, 2026-03-07)*
- [x] **BUG-RD-004** Fix Pods tab: show stored pod data when cluster offline *(verified: pods/page.tsx has offline/listStored handling, 2026-03-07)*
- [x] **BUG-RD-005** Fix Overview tab: remove duplicate stat cards *(Ron, 2026-03-07)*

### Navigation & Routing
- [x] **P1-001** Refactor `config/navigation.ts` — reduce to 6 global items *(Ron, 2026-03-07)*
- [x] **P1-002** Rewrite `Sidebar.tsx` — `layoutId` active indicator, `Cmd+B` toggle, flat 6 items *(Ron, 2026-03-07)*
- [x] **P1-003** Add auto-collapse logic to `AppLayout.tsx` — sidebar collapses on `/clusters/[id]/*` *(Ron, 2026-03-07)*
- [x] **P1-004** Create `app/clusters/[id]/layout.tsx` — shared cluster header + 10-tab bar with `layoutId` underline *(Ron, 2026-03-07)*
- [x] **P1-005** Migrate current cluster detail to `app/clusters/[id]/page.tsx` (Overview tab) *(Ron, 2026-03-07)*
- [x] **P1-006** Create route stubs for all 10 cluster tabs *(Ron, 2026-03-07)*
- [x] **P1-007** Update `Breadcrumbs.tsx` — `Dashboard / Clusters / cluster-name / tab-name` *(Ron, 2026-03-07)*
- [x] **P1-008** Add cluster quick-switch to sidebar footer (recent clusters, env color dots) *(Ron, 2026-03-07)*

### Settings Consolidation
- [x] **P1-009** Expand `/settings` to tabbed layout — absorb: Users, Teams, Permissions, Webhooks, Feature Flags, Audit Log *(Shiri, 2026-03-07)*
- [x] **P1-010** Remove 6 admin items from sidebar (done via P1-001 navigation refactor) *(Ron, 2026-03-07)*
- [x] **P1-011** Redirect old routes: `/users` → `/settings/users`, `/teams` → `/settings/teams`, etc. *(Shiri, 2026-03-07)*

### Global Infrastructure
- [x] **P1-012** Add `MotionConfig reducedMotion="user"` to `providers.tsx` *(Ron, 2026-03-07)*
- [x] **P1-013** Install `nuqs` (`pnpm add nuqs`) *(Ron, 2026-03-07)*
- [x] **P1-014** Update `lib/animation-constants.ts` with new DURATION/EASING/STAGGER values *(Ron, 2026-03-07)*
- [x] **P1-015** Merge Health page content into Dashboard overview *(Shiri, 2026-03-07)*
- [x] **P1-016** Merge Anomalies into Alerts page as subsection *(Shiri, 2026-03-07)*
- [ ] **P1-017** Remove `@tanstack/react-form` — ⚠️ BLOCKED: actually used in login/users/teams pages

---

## 🟡 Phase 2 — Content Enrichment (Sprint 3–5)
> **Goal:** Every cluster tab has real data. No stubs.
> **Backend (Dima) first — Frontend (Ron) wires after**

### Backend — tRPC Routes (Dima)
- [x] **P2-001** tRPC: `cluster.deployments.listByCluster(clusterId)` — real K8s deployments ✅ v93f5f81 2026-03-07
- [x] **P2-002** tRPC: `cluster.services.listByCluster(clusterId)` — real K8s services ✅ v93f5f81 2026-03-07
- [x] **P2-003** tRPC: `cluster.namespaces.list(clusterId)` — namespaces + resource quotas ✅ v93f5f81 2026-03-07
- [x] **P2-004** tRPC: `cluster.logs.stream(clusterId, podName, container)` — log streaming ✅ v93f5f81 2026-03-07
- [x] **P2-005** tRPC: `cluster.pods.listStored(clusterId)` — last-known pod state for offline clusters ✅ v93f5f81 2026-03-07

### Frontend — Cluster Tabs (Ron)
- [x] **P2-006** Deployments tab — wire to `trpc.cluster.deployments.listByCluster` (Name, Namespace, Ready, Image, Age)
- [x] **P2-007** Services tab — wire to `trpc.cluster.services.listByCluster` (Name, Type, ClusterIP, Ports, Age)
- [x] **P2-008** Namespaces tab — namespace list + resource quotas table
- [x] **P2-009** Logs tab — pod log streaming, pod selector dropdown, within cluster context
- [x] **P2-010** Pods tab — show stored pod data offline with "⚠️ Offline — data from [timestamp]" badge
- [x] **P2-011** Events tab — add SSE real-time updates
- [x] **P2-012** Autoscaling tab — move Karpenter page to `/clusters/[id]/autoscaling`
- [x] **P2-013** Command Palette — add cluster-tab shortcuts (e.g., "prod-cluster → Pods")
- [x] **P2-014** Keyboard shortcuts: `1`–`9` switch cluster tabs, `[` `]` prev/next tab

---

## 🟢 Phase 3 — Animation Polish (Sprint 6–7)
> **Goal:** Production-quality Motion v12 animations. Every interaction feels alive.

### Motion v12 Activation (Ron)
- [x] **P3-001** Sidebar spring collapse (`motion.aside` width: 56↔224px, `spring(300,30)`) ✅ v194-phase3 2026-03-07
- [x] **P3-002** Active nav indicator `layoutId="sidebar-active-bg"` + left border bar ✅ v194-phase3 2026-03-07
- [x] **P3-003** Tab underline `layoutId="cluster-tab-underline"` (`stiffness:500, damping:40`) ✅ v194-phase3 2026-03-07
- [x] **P3-004** Tab content crossfade `AnimatePresence mode="wait"` (exit -4px, enter +8px, 200ms) ✅ v194-phase3 2026-03-07
- [x] **P3-005** Data table row stagger with `useInView` (once, `-50px` margin, 30ms delay per row) ✅ v194-phase3 2026-03-07
- [x] **P3-006** Animated stat count-up in cluster header (`useMotionValue + animate()`, 800ms decelerate) ✅ v194-phase3 2026-03-07
- [x] **P3-007** Button micro-interactions: `whileHover={{scale:1.02}}` + `whileTap={{scale:0.97}}` ✅ v194-phase3 2026-03-07
- [x] **P3-008** Card hover lift: `whileHover={{y:-2, boxShadow:"0 8px 24px rgba(0,0,0,0.12)"}}` ✅ v194-phase3 2026-03-07
- [x] **P3-009** Skeleton → stagger entrance: `AnimatePresence mode="popLayout"` on all loading states ✅ v194-phase3 2026-03-07
- [x] **P3-010** Shared element: cluster list icon → cluster detail icon (`layoutId="cluster-icon-{id}"`) ✅ v194-phase3 2026-03-07

### New Libraries (Ron)
- [x] **P3-011** Install `vaul` → drawer for pod detail, alert detail on mobile *(verified: MobileDrawer.tsx imports vaul, 2026-03-07)*
- [x] **P3-012** Install `react-resizable-panels` → split-pane logs below cluster content *(verified: logs/page.tsx uses PanelGroup, 2026-03-07)*
- [x] **P3-013** Wrap heavy animations with `LazyMotion + domAnimation` (saves ~23kb gzipped) ✅ v89b242a 2026-03-07
  - **Review fix C1**: All `motion.*` → `m.*` across 26 files (LazyMotion strict-safe) ✅ fix/89b242a
  - **Review fix H1**: AnimatedStatCount respects `prefers-reduced-motion` via `useReducedMotion` ✅
  - **Review fix H2**: DataTable `AnimatePresence mode="popLayout"` → `mode="wait"` (spec P3-009) ✅

### Cleanup
- [x] **P3-014** Remove dead code: unused hooks, old sidebar routes, duplicate motion polyfills ✅ v194-phase3 2026-03-07

---

## 🧪 E2E Test Specs (Yuval — runs after each Phase deploy)

### Phase 1 E2E
- [x] **E2E-P1** Phase 1 covered by `phase1-v194.spec.ts` (21 tests, all PASS) *(verified: e2e evidence v194-phase1)*
- [x] **Gate:** 21/21 PASS ✅

### Phase 2 E2E
- [x] **E2E-P2** `cluster-tabs-data.spec.ts` *(verified: file exists in tests/e2e/)*
- [x] **E2E-P2** `command-palette-enhanced.spec.ts` *(verified: file exists in tests/e2e/)*
- [x] **Gate:** 16/16 PASS ✅ *(verified: e2e evidence v194-phase2)*

### Phase 3 E2E
- [x] **E2E-P3** Phase 3 covered by `phase3-v194-animation.spec.ts` + `m-p3-features.spec.ts` *(verified: files exist)*
- [x] **Gate:** 139/139 PASS, 0 failures ✅ *(verified: e2e evidence v194-phase3-final)*

---

## 📋 Pipeline Checklist (per Phase)

Each phase follows this flow:
- [x] Dev complete (Ron/Shiri/Dima) ✅
- [x] Code review (Lior) → 10/10 APPROVED ✅
- [x] Merge + tag (Gil) → v194-phase1/2/3 + v194-phase3-fix1 ✅
- [x] Deploy (Uri) → helm uninstall + install → image tag verified ✅
- [x] E2E (Yuval) → 139/139 pass, 0 failures ✅
- [x] QA (Mai) → 9.5 / 8.7 / 9.0 / 10 ✅
- [x] Guardian: deployed-awaiting-review ✅

---

---

## 🆕 Phase 6 — Dashboard IA Redesign (Single Source of Truth)
> **Goal:** Eliminate duplication — SystemHealth + Clusters = one unified view
> **Spec:** `DASHBOARD-REDESIGN-2026.md` | **Runs:** Ron (frontend)
> **Reference:** Datadog/Rancher/Lens pattern — health is attribute of entity, not a section

### P0 — Critical (Remove Duplication)
- [x] **IA-001** Remove `SystemHealthSection` from `page.tsx` (~80 lines, ~380–440). Remove unused imports: `HeartPulse`, `RefreshCw`, `Clock`, `Zap`. Remove `STATUS_COLORS_HEALTH`, `STATUS_LABELS_HEALTH`, `timeAgoHealth` constants. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-002** Add health aggregate counts to `CompactStatsBar`: `🟢 N · 🟡 N · 🔴 N` (Healthy/Degraded/Critical). Compute from cluster list via `getHealthGroup()`. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-003** Remove leftover `mb-6` spacing after SystemHealthSection removal — clusters appear higher on page. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*

### P1 — Important (Progressive Disclosure)
- [x] **IA-004** Enhance `HealthDot` → rich hover tooltip: status label, last check time-ago, responseTimeMs. Use existing `@/components/ui/tooltip`. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-005** Add inline `HealthLatency` badge to `ClusterCard` — subtle `Nms` text next to health dot (was only in SystemHealthSection). *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-006** Add "Check Now" hover button to `ClusterCard` — `RefreshCw` icon, `opacity-0 group-hover:opacity-100`. Recovers on-demand re-check functionality. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-007** Create reusable `ClusterHealthIndicator` component (dot + tooltip + latency + optional onCheck). Used by cards + widget-mode. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*

### P2 — Polish (Animations)
- [x] **IA-008** Update widget-mode `ClusterHealthWidget` to use `ClusterHealthIndicator` for cross-mode consistency. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-009** Upgrade cluster cards: Motion `whileHover={{y:-2}}`, `layout` prop for filter reflow, `AnimatePresence mode="popLayout"` on filter. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*
- [x] **IA-010** Add `healthDotVariants` + `checkButtonVariants` to `animation-constants.ts` — healthy=still, degraded=pulse, critical=bigger pulse. *(Ron, feat/phase6-ia-redesign, 2026-03-07)*

---

## 🆕 Phase 5 — Dashboard UX + Per-Node Metrics
> **Goal:** Compact stat cards + per-node resource metrics (Vik: "I need to see which machine is loaded")
> **Runs:** Ron (frontend) + Dima (backend) in parallel → v197

### Stat Cards — Compact Redesign (Ron)
- [x] **DB-001** Replace 4 big stat cards with compact stats bar — one thin row: `N Nodes · N/N Pods · N Clusters · N Warnings` *(v197 2026-03-07)*
- [x] **DB-002** Cluster cards — reduce height ~50%, horizontal layout, 50 clusters = reasonable scroll *(v197 2026-03-07)*
- [x] **DB-003** Anomalies → inline badge on Alerts nav item in sidebar (remove AnomalyWidget from dashboard) *(v197 2026-03-07)*

### Per-Node Metrics — Backend (Dima)
- [x] **MX-001** Enable metrics-server in minikube *(Foreman pre-enabled 2026-03-07)*
- [x] **MX-002** New DB table `node_metrics_history` (clusterId, nodeName, timestamp, cpuPercent, memPercent, cpuMillis, memMi) *(v197 2026-03-07)*
- [x] **MX-003** Collector: per-node insert each cycle + `getCollectorStatus()` export *(v197 2026-03-07)*
- [x] **MX-004** tRPC route `metrics.nodeTimeSeries(clusterId, range)` → [{nodeName, timestamps, cpuValues, memValues, cpuMillis, memMi}] *(v197 2026-03-07)*
- [x] **MX-005** `/health/metrics-collector` status endpoint *(v197 2026-03-07)*

### Per-Node Metrics — Frontend (Ron)
- [x] **MX-006** NodeMetricsTable component: node name + CPU/Mem progress bars + % + millicores/Mi values *(v197 2026-03-07)*
- [x] **MX-007** MetricsEmptyState fallback: "⚠️ Metrics-server not detected on this cluster" *(v197 2026-03-07)*

---

## 🆕 Phase 4 — Sidebar Polish (2026 Standards)
> **Goal:** Fix sidebar UX issues found by Vik + apply 2026 best practices from SIDEBAR-RESEARCH-2026.md
> **Runs:** Ron (frontend) — after v195 pipeline completes
> **Reference:** `SIDEBAR-RESEARCH-2026.md`

### Icon Alignment (Collapsed Mode)
- [x] **SB-001** Fix icon centering in collapsed mode — apply `group-data-[collapsible=icon]:justify-center`, `group-data-[collapsible=icon]:px-0`, `group-data-[collapsible=icon]:size-10` to `SidebarMenuButton` *(done in v195: fcd11a1 — justify-center px-0 when collapsed, QA verified 9.2/10)*
- [x] **SB-002** Add `data-collapsible` attribute propagation from `<aside>` to child nav items so Tailwind group selectors work correctly *(Ron, feat/sidebar-phase4 df28049)*
- [x] **SB-003** Add tooltip (`title` or shadcn `Tooltip`) on every nav item when collapsed — critical UX gap per research *(Ron, feat/sidebar-phase4 df28049)*

### Section Header Typography
- [x] **SB-004** Replace `font-mono font-bold tracking-widest` on section labels (like "CLUSTERS") with `text-[11px] font-medium tracking-wide text-muted-foreground` — 2022 Material pattern → 2026 subtle style *(done in v195: fcd11a1 — text-[10px] font-medium tracking-wider text-muted, QA verified)*
- [x] **SB-005** Convert "CLUSTERS" active section from header label → inline accordion: parent item has `ChevronDown` that rotates, sub-items indent `pl-9` — no more awkward section header below nav items *(Ron, feat/sidebar-phase4 df28049)*

### Animation Refinements
- [x] **SB-006** Switch sidebar `width` animation from Motion spring → CSS `transition-[width] duration-200 ease-out` (hardware-accelerated, prevents jank) *(Ron, feat/sidebar-phase4 df28049)*
- [x] **SB-007** Keep Motion `layoutId="sidebar-active-bg"` for active indicator sliding — already implemented ✅ *(verified: Sidebar.tsx uses layoutId)*
- [x] **SB-008** Reduce active border bar from 3px → 2px (2026 standard per research) *(Ron, feat/sidebar-phase4 df28049)*
- [x] **SB-009** `Cmd+B` toggle: near-instant `duration-50` (not the full spring animation — keyboard users expect instant response) *(Ron, feat/sidebar-phase4 df28049)*

### Active State when Deep in Section
- [x] **SB-010** Parent nav item (e.g., "Clusters") shows as active with background pill when user is on any `/clusters/*` route *(Ron, feat/sidebar-phase4 df28049)*
- [x] **SB-011** When inside cluster, show inline sub-nav (cluster name + tabs) as collapsible under parent — not as floating header *(Ron, feat/sidebar-phase4 df28049)*

---

## 🎛️ v194-widgets — Widget System Restore (2026-07-14)

### Completed
- [x] Restore DashboardGrid + DashboardEditBar + WidgetLibraryDrawer imports to page.tsx [v194-widgets 2026-07-14]
- [x] Restore useDashboardLayout hooks (editMode, addWidget, resetToDefault, saveLayout) [v194-widgets 2026-07-14]
- [x] Add Widgets toggle button to Dashboard header [v194-widgets 2026-07-14]
- [x] Add Customize button (visible in widgetMode) [v194-widgets 2026-07-14]
- [x] StatCardsWidget with 24h sparklines available via widget mode [v194-widgets 2026-07-14]
- [x] Legacy cluster layout preserved (shown when widgetMode=false) [v194-widgets 2026-07-14]
- [x] Build passes ✅ | Navigation v194 intact ✅ [v194-widgets 2026-07-14]

---

## 🔧 v201 — Stale Deploy Fix + Metrics Fix (2026-03-13)

### Completed
- [x] Deployed v201 with --no-cache from commit c522cbf (metrics RBAC + timeout/error fix) [v201 2026-03-13]
- [x] Fixed stale deploy: voyager-web pod was 21h old (running v200), rebuilt and redeployed both images [v201 2026-03-13]
- [x] Pushed unpushed c522cbf commit to origin/feat/init-monorepo [v201 2026-03-13]
- [x] Verified both pods running v201 with matching git-sha labels [v201 2026-03-13]
- [x] Updated build-deploy SKILL.md with stale deploy prevention rules [v201 2026-03-13]
- [x] Updated release-ledger.json with v201 entry [v201 2026-03-13]

### Root Cause Analysis (Stale Deploy)
- voyager-web pod was NOT restarted during v200 metrics deploy
- c522cbf commit was locally committed but not pushed to origin
- Build agent used cached Docker layers (no --no-cache)
- Process fix: added Step 0.5 to SKILL.md with git-sync check + --no-cache mandatory rule
