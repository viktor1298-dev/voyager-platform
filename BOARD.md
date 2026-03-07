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
- [ ] **BUG-RD-002** Fix Services tab: remove empty stub, wire to real data (Phase 2 backend)
- [ ] **BUG-RD-003** Fix Deployments tab: remove empty stub, wire to real data (Phase 2 backend)
- [ ] **BUG-RD-004** Fix Pods tab: show stored pod data when cluster offline (no blank screen)
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
- [ ] **P2-006** Deployments tab — wire to `trpc.cluster.deployments.listByCluster` (Name, Namespace, Ready, Image, Age)
- [ ] **P2-007** Services tab — wire to `trpc.cluster.services.listByCluster` (Name, Type, ClusterIP, Ports, Age)
- [ ] **P2-008** Namespaces tab — namespace list + resource quotas table
- [ ] **P2-009** Logs tab — pod log streaming, pod selector dropdown, within cluster context
- [ ] **P2-010** Pods tab — show stored pod data offline with "⚠️ Offline — data from [timestamp]" badge
- [ ] **P2-011** Events tab — add SSE real-time updates
- [ ] **P2-012** Autoscaling tab — move Karpenter page to `/clusters/[id]/autoscaling`
- [ ] **P2-013** Command Palette — add cluster-tab shortcuts (e.g., "prod-cluster → Pods")
- [ ] **P2-014** Keyboard shortcuts: `1`–`9` switch cluster tabs, `[` `]` prev/next tab

---

## 🟢 Phase 3 — Animation Polish (Sprint 6–7)
> **Goal:** Production-quality Motion v12 animations. Every interaction feels alive.

### Motion v12 Activation (Ron)
- [ ] **P3-001** Sidebar spring collapse (`motion.aside` width: 56↔224px, `spring(300,30)`)
- [ ] **P3-002** Active nav indicator `layoutId="sidebar-active-bg"` + left border bar
- [ ] **P3-003** Tab underline `layoutId="cluster-tab-underline"` (`stiffness:500, damping:40`)
- [ ] **P3-004** Tab content crossfade `AnimatePresence mode="wait"` (exit -4px, enter +8px, 200ms)
- [ ] **P3-005** Data table row stagger with `useInView` (once, `-50px` margin, 30ms delay per row)
- [ ] **P3-006** Animated stat count-up in cluster header (`useMotionValue + animate()`, 800ms decelerate)
- [ ] **P3-007** Button micro-interactions: `whileHover={{scale:1.02}}` + `whileTap={{scale:0.97}}`
- [ ] **P3-008** Card hover lift: `whileHover={{y:-2, boxShadow:"0 8px 24px rgba(0,0,0,0.12)"}}`
- [ ] **P3-009** Skeleton → stagger entrance: `AnimatePresence mode="popLayout"` on all loading states
- [ ] **P3-010** Shared element: cluster list icon → cluster detail icon (`layoutId="cluster-icon-{id}"`)

### New Libraries (Ron)
- [ ] **P3-011** Install `vaul` → drawer for pod detail, alert detail on mobile
- [ ] **P3-012** Install `react-resizable-panels` → split-pane logs below cluster content
- [ ] **P3-013** Wrap heavy animations with `LazyMotion + domAnimation` (saves ~23kb gzipped)

### Cleanup
- [ ] **P3-014** Remove dead code: unused hooks, old sidebar routes, duplicate motion polyfills

---

## 🧪 E2E Test Specs (Yuval — runs after each Phase deploy)

### Phase 1 E2E
- [ ] **E2E-P1** Write + run `tests/e2e/sidebar-redesign.spec.ts` (5 tests)
- [ ] **E2E-P1** Write + run `tests/e2e/cluster-routing.spec.ts` (6 tests — deep links, back button)
- [ ] **E2E-P1** Write + run `tests/e2e/settings-consolidation.spec.ts` (3 tests)
- [ ] **E2E-P1** Write + run `tests/e2e/critical-bug-fixes.spec.ts` (2 tests — BUG-RD-001, RD-005)
- [ ] **Gate:** 0 failures. All 16 tests pass.

### Phase 2 E2E
- [ ] **E2E-P2** Write + run `tests/e2e/cluster-tabs-data.spec.ts` (12 tests — all tabs with real data)
- [ ] **E2E-P2** Write + run `tests/e2e/command-palette-enhanced.spec.ts` (4 tests)
- [ ] **Gate:** 0 failures. All 16 tests pass.

### Phase 3 E2E
- [ ] **E2E-P3** Write + run `tests/e2e/animations-smoke.spec.ts` (7 tests)
- [ ] **E2E-P3** Write + run `tests/e2e/responsive-redesign.spec.ts` (3 tests)
- [ ] **Gate:** 0 failures. All 10 tests pass.

---

## 📋 Pipeline Checklist (per Phase)

Each phase follows this flow:
- [ ] Dev complete (Ron/Shiri/Dima) → report to Discord
- [ ] Code review (Lior) → 10/10 → APPROVED
- [ ] Merge + tag (Gil) → `v194-phase1` / `v194-phase2` / `v194-phase3`
- [ ] Deploy (Uri) → helm uninstall + helm install → image tag verified
- [ ] E2E (Yuval) → all tests pass → evidence file written
- [ ] QA (Mai) → desktop ≥8.5/10 → evidence file written
- [ ] Guardian: all 5 gates → write `status: deployed-awaiting-review`
