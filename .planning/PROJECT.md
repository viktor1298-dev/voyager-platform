# Voyager Platform — Live Data Pipeline

## What This Is

Voyager Platform is a web-based Kubernetes operations dashboard for multi-cloud cluster management (AWS EKS, Azure AKS, GCP GKE). The app provides monitoring, alerting, and interactive K8s operations — pod exec, log streaming, YAML viewing, Helm releases, RBAC, topology visualization — all from the browser. The goal is Lens-quality live data experience without requiring a desktop app.

## Core Value

**Every resource visible in the dashboard updates in real-time as it changes in the cluster** — no polling, no page refresh, no delay. When a pod crashes, scales, or gets deleted, the UI reflects it instantly, exactly like Lens does.

## Requirements

### Validated

- ✓ Multi-cloud K8s cluster management (EKS, AKS, GKE) — existing
- ✓ K8s Watch API → WatchManager → in-memory ObjectCache for 15 resource types — existing
- ✓ SSE endpoint `/api/resources/stream` sends watch events to browser — existing
- ✓ Pod exec terminal via WebSocket — existing
- ✓ Log streaming via SSE — existing
- ✓ YAML viewer, resource diff, action toolbar — existing
- ✓ Helm releases browser, CRD browser, RBAC matrix — existing
- ✓ Network policy visualization, resource quotas, topology map — existing
- ✓ TimescaleDB metrics with SSE real-time for short ranges — existing
- ✓ Better-Auth cookie session with RBAC — existing

### Active

- [x] **PIPE-01**: SSE stream delivers continuous events — heartbeat timeout detects silent informer death (Phase 1)
- [x] **PIPE-02**: TanStack Query polling disabled for SSE-fed types (Phase 1)
- [x] **PIPE-03**: Informer lifecycle robust — auto-recreate on silent death (Phase 1)
- [x] **PIPE-04**: watch-db-writer refactored to EventEmitter listener (Phase 1)
- [ ] **LIVE-01**: SSE stream delivers continuous real-time events (not just first event then silence)
- [ ] **LIVE-02**: All 15 currently-watched resource types update in browser without polling or page refresh
- [ ] **LIVE-03**: Smart per-cluster watching — only watch clusters the user is actively viewing (like Lens)
- [ ] **LIVE-04**: Expand live watching to all 24 cluster tab resource types (add Helm, CRDs, RBAC, network policies, resource quotas, topology, autoscaling, logs, metrics)
- [ ] **LIVE-05**: Frontend `useResourceSSE` correctly applies SSE events to TanStack Query cache and triggers re-renders
- [x] **LIVE-06**: SSE connection lifecycle is robust — auto-reconnect on drop, no silent failures (Phase 2)
- [ ] **LIVE-07**: Same data freshness and update speed as Lens for equivalent operations (pod restart, scale, delete)
- [ ] **CLEAN-01**: Remove dead code — legacy watchers (~900 lines), unused subscriptions router, dead emitter methods
- [ ] **CLEAN-02**: Add missing DB indexes on events, nodes, audit_log, alert_history, health_history tables
- [ ] **CLEAN-03**: Remove `ignoreBuildErrors: true` from Next.js config and fix any build errors it was hiding

### Out of Scope

- Electron desktop app — web-first approach, same as Rancher/Headlamp/K8s Dashboard v3
- WebSocket for live data transport — SSE is correct for server→client streaming; WS stays for pod exec only
- Helm mutations (upgrade/rollback) — read-only for now
- Port forwarding proxy — copy kubectl command only
- Live data for clusters not being viewed — resource waste at scale (30+ clusters)

## Context

**Current state of live data pipeline:**
The 3-link chain (K8s Watch → Backend SSE → Browser UI) partially works. Initial events arrive (pod delete shows immediately). But then the stream appears to stop — data only updates when the page is refreshed or on a ~10s interval that looks like polling. The root cause needs investigation: could be SSE connection dropping, frontend subscription bug, TanStack Query overriding SSE with stale poll data, or WatchManager not emitting after initial sync.

**Reference implementations:**
Rancher Dashboard, Headlamp, Kubernetes Dashboard v3 all use the same architecture — server-side K8s watches with SSE/streaming to browser. This is the industry-standard approach for web-based K8s dashboards. Research should examine how these projects handle connection lifecycle, per-cluster resource management, and event batching.

**Scale target:** ~30 clusters. Per-cluster on-demand watching (start watches when user opens a cluster, stop when they leave) is critical to avoid overwhelming the K8s API servers.

**Codebase health:** Fresh codebase map in `.planning/codebase/` (2026-03-30). Key concerns: ~900 lines dead code from legacy watchers, missing DB indexes, `ignoreBuildErrors: true` in Next.js config.

## Constraints

- **Transport**: SSE for live data (industry standard for web K8s dashboards), WebSocket only for bidirectional needs (pod exec)
- **Scale**: Must handle 30 clusters without watching all simultaneously — per-cluster on-demand only
- **Design**: Follow `docs/DESIGN.md` B-style animation standards
- **Stack**: Next.js 16 + Fastify 5 + tRPC 11 — no framework changes
- **K8s API**: Use `@kubernetes/client-node` informers (Watch API) — not polling

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep SSE over WebSocket for live data | SSE is standard for server→client streaming in web K8s dashboards (Rancher, Headlamp). WS is bidirectional overhead we don't need. | — Pending |
| Per-cluster on-demand watching | Can't watch all 30 clusters simultaneously — matches Lens behavior (watch active cluster only) | — Pending |
| Expand from 15 to 24 watched types | All cluster tabs should show live data, not just the originally-watched types | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-30 after Phase 2 completion*
