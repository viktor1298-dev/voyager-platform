# Roadmap: Live Data Pipeline

## Overview

Fix the broken SSE pipeline so K8s resource updates flow continuously from cluster to browser, then harden reconnection and optimize burst performance, expand live watching to all 24 resource types with per-cluster lifecycle, and clean up ~900 lines of dead code plus missing DB indexes. The pipeline works end-to-end after Phase 1; it is production-grade after Phase 2; it covers all resources after Phase 3; the codebase is clean after Phase 4.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Diagnose & Fix Pipeline** - Find and fix root cause of SSE stopping after first event; eliminate TQ polling conflict (completed 2026-03-30)
- [ ] **Phase 2: Harden & Optimize** - Add reconnection reliability (event IDs, heartbeat, backoff) and client-side event batching for burst performance
- [ ] **Phase 3: Expand Coverage** - Extend live watching to all 24 cluster tab types with per-cluster on-demand lifecycle
- [ ] **Phase 4: Cleanup** - Remove dead code, add missing DB indexes, fix ignoreBuildErrors

## Phase Details

### Phase 1: Diagnose & Fix Pipeline
**Goal**: SSE stream continuously delivers live K8s events to the browser without stopping, and the UI updates in real-time without polling fallback
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. QA test: delete a pod, take 4 screenshots every 3 seconds (at 0s, 3s, 6s, 9s) — each screenshot must show progressively updated data (pod terminating → new pod starting → running), proving live data not 10s polling
  2. User can trigger a pod delete or scale operation and see the change appear in the dashboard without refreshing the page, continuously (not just the first event)
  3. No TanStack Query polling requests appear in the browser network tab for resource types that are SSE-fed (pods, deployments, services, etc.)
  4. After leaving a cluster view open for 10+ minutes, events continue arriving (no silent informer death)
  5. **Phase gate:** Full functional QA — navigate every cluster tab, perform actions (delete pod, scale deployment), verify live data updates on each tab via screenshot + console check
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Fix backend pipeline (heartbeat timeout + watch-db-writer refactor)
- [x] 01-02-PLAN.md — Fix frontend polling conflicts + E2E live data test

### Phase 2: Harden & Optimize
**Goal**: SSE connections are resilient to network drops and server restarts, and the UI handles burst events (rolling updates) without jank
**Depends on**: Phase 1
**Requirements**: CONN-01, CONN-02, CONN-03, PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. User's SSE connection drops (network blip or API restart) and automatically reconnects within 30 seconds with no visible flash of empty state
  2. No events are lost during reconnection -- resources that changed while disconnected appear after reconnect (Last-Event-ID replay)
  3. User triggers a rolling update (50+ events in 5 seconds) and the UI updates smoothly without frame drops or input lag
  4. If an informer silently stops emitting events, the system detects and recovers within 30 seconds (heartbeat timeout)
  5. **Phase gate:** Full functional QA — navigate every cluster tab, trigger reconnect scenarios, verify no empty state flashes, test burst events via rolling update
**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — Server-side event IDs, ring buffer replay, and named heartbeat event
- [ ] 02-02-PLAN.md — Client-side reconnect with backoff, heartbeat monitor, and event buffer

### Phase 3: Expand Coverage
**Goal**: All 24 cluster tab resource types show live data, and watches are scoped to only the cluster the user is viewing
**Depends on**: Phase 2
**Requirements**: COVER-01, COVER-02, COVER-03
**Success Criteria** (what must be TRUE):
  1. User views any of the 15 currently-watched resource types and sees live updates without polling or page refresh
  2. User views network policies, resource quotas, Helm releases, CRDs, or topology and sees live updates (9 additional types)
  3. User switches from Cluster A to Cluster B -- watches for Cluster A stop within 10 seconds, watches for Cluster B start immediately
  4. With 30 clusters in the system, only the actively-viewed cluster(s) have running watches (verified via API health/metrics endpoint)
  5. **Phase gate:** Full functional QA — navigate all 24 cluster tabs one by one, perform human actions (create/delete/scale resources), verify live updates on each tab, test cluster switching
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Cleanup
**Goal**: Dead code removed, database queries fast, build pipeline honest
**Depends on**: Nothing (independent -- can run in parallel with Phases 2-3)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03
**Success Criteria** (what must be TRUE):
  1. The files cluster-watch-manager.ts, resource-watch-manager.ts, cluster-connection-state.ts, and subscriptions.ts no longer exist in the codebase
  2. Database queries on events, nodes, audit_log, alert_history, and health_history tables use indexes (verified via EXPLAIN ANALYZE)
  3. `pnpm build` succeeds with `ignoreBuildErrors: false` in next.config.ts (no TypeScript errors hidden)
  4. **Phase gate:** Full functional QA — verify no regressions after cleanup, navigate all pages, check console for errors
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases 1-3 execute sequentially. Phase 4 is independent and can execute in parallel with Phases 2-3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Diagnose & Fix Pipeline | 2/2 | Complete    | 2026-03-30 |
| 2. Harden & Optimize | 0/2 | Not started | - |
| 3. Expand Coverage | 0/2 | Not started | - |
| 4. Cleanup | 0/1 | Not started | - |
