# BOARD.md — Phase D Bug Fixes Round 2 (v121)

**Status:** READY
**Phase:** D-bugfix-r2
**Target version:** v121
**Base:** v120 (deployed, QA 5.5/10 — root cause identified)

---

## 🐛 Bug Fixes — Status Inconsistency (Root Cause Found by QA)

### BUG-STATUS-1: `normalizeLiveHealthStatus()` מפה לא נכון
**File:** `apps/web/src/` — search for `normalizeLiveHealthStatus`
**Problem:** The function maps `'degraded'` → `'Warning'` label. Should map `'degraded'` → `'Degraded'`.
DB has `health_status = 'degraded'` for minikube. Clusters list uses this function → shows 'Warning' (wrong).
**Fix:** Correct the mapping. `degraded` → `Degraded` (same label, consistent with enum).
**Expected:** Clusters list shows same status as dashboard.

### BUG-STATUS-2: Cluster detail page overrides DB `healthStatus` with live K8s query
**File:** `apps/web/src/app/clusters/[id]/page.tsx` + live tRPC query
**Problem:** Detail page fires live K8s query → receives `'Healthy'` from real cluster → displays that instead of DB `healthStatus`. This creates a different status than all other views.
**Fix:** Live query result should:
1. Update the DB `healthStatus` (via mutation or background update)
2. BUT display should still read from DB first — use the live result only to show a "live refresh" indicator, not override the primary status badge.
**Expected:** Detail page status badge = DB `healthStatus`. Live data shown in a separate "live" section.

### BUG-STATUS-3: `status` field vs `healthStatus` field — 4 views use different fields
**Problem:** 
- Dashboard → reads `healthStatus` from DB ✓
- Clusters list → reads `healthStatus` but passes through broken normalize function
- Detail page → reads from live K8s query (overrides)
- Settings → reads `status` field (VARCHAR, not the enum `health_status`)

**Fix:** Define ONE rule for status display across ALL views:
> **Rule:** All status badges/chips read from DB `healthStatus` (enum). The `status` VARCHAR field is internal only (not displayed).
> Live K8s data → updates DB `healthStatus` in background → all views auto-refresh via React Query invalidation.

---

## Acceptance Criteria
- [ ] Dashboard status = Clusters list status = Detail page status (all same value)
- [ ] `normalizeLiveHealthStatus('degraded')` returns `'Degraded'` (not 'Warning')
- [ ] Detail page primary status badge reads from DB, not live query
- [ ] Settings page doesn't show raw `status` VARCHAR — shows `healthStatus` enum
- [ ] E2E: ≥88/107 pass (0 new failures from status changes)
- [ ] QA Desktop: ≥8.5/10
- [ ] **VERSION CONTRACT:** git tag v121 → docker v121 → state.json v121 (all must match)

## Pipeline Gates
- Code Review (Lior): 10/10
- E2E (Yuval): ≥88/107
- Desktop QA (Mai): ≥8.5/10
