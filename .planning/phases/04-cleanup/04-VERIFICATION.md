---
phase: 04-cleanup
verified: 2026-03-30T19:30:00Z
status: gaps_found
score: 3/4 success criteria verified
re_verification: false
gaps:
  - truth: "Database queries on events, nodes, audit_log, alert_history, and health_history tables use indexes"
    status: partial
    reason: "Both 04-01 and 04-02 independently added indexes to init.sql, creating duplicate definitions for idx_events_cluster_ts and idx_nodes_cluster. Additionally the 04-01 block adds 6 indexes with different names (idx_events_kind, idx_audit_log_user_ts, idx_audit_log_ts, idx_audit_log_action, idx_alert_history_alert_ts, idx_health_history_cluster_ts) that are not mirrored in any Drizzle schema file."
    artifacts:
      - path: "charts/voyager/sql/init.sql"
        issue: "idx_events_cluster_ts defined twice (lines 144 and 624). idx_nodes_cluster defined twice (lines 128 and 626). 6 indexes from the 04-01 block (idx_events_kind, idx_audit_log_user_ts, idx_audit_log_ts, idx_audit_log_action, idx_alert_history_alert_ts, idx_health_history_cluster_ts) have no matching Drizzle index() definitions."
    missing:
      - "Remove the duplicate 04-01 block (lines 623-631) from init.sql — all desired coverage is already present from the correctly-placed indexes inserted by 04-02 directly after each table definition. Alternatively keep the extra indexes (idx_events_kind, idx_audit_log_user_ts etc.) but then mirror them in Drizzle schema files."
      - "Decide which audit_log index naming to keep: 04-02 added idx_audit_log_timestamp + idx_audit_log_resource_id; 04-01 added idx_audit_log_user_ts + idx_audit_log_ts + idx_audit_log_action. If keeping all, mirror in Drizzle."
human_verification:
  - test: "Navigate all dashboard pages — clusters, pods, deployments, nodes, events, audit log, alerts, helm, CRDs — after the cleanup changes"
    expected: "Every page renders content, zero console errors, no regressions from dead code removal"
    why_human: "Cannot verify UI rendering and absence of runtime errors programmatically without a running server"
  - test: "Restart docker compose and verify init.sql applies cleanly with duplicate CREATE INDEX IF NOT EXISTS statements"
    expected: "PostgreSQL startup log shows no errors; EXPLAIN ANALYZE on an events query shows Index Scan on idx_events_cluster_ts"
    why_human: "Requires a live PostgreSQL instance to confirm duplicate CREATE INDEX IF NOT EXISTS is silently ignored"
---

# Phase 4: Cleanup Verification Report

**Phase Goal:** Dead code removed, database queries fast, build pipeline honest
**Verified:** 2026-03-30T19:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | cluster-watch-manager.ts, resource-watch-manager.ts, cluster-connection-state.ts, subscriptions.ts no longer exist | VERIFIED | All 6 deleted files absent from filesystem; no broken imports remain |
| 2 | Database queries on events, nodes, audit_log, alert_history, health_history use indexes | PARTIAL | 8 indexes present in correct positions (04-02 work) but init.sql also has a second duplicate block from 04-01 with different naming — 6 of those 14 total index names not mirrored in Drizzle |
| 3 | `pnpm build` succeeds with `ignoreBuildErrors: false` in next.config.ts | VERIFIED | next.config.ts line 9: `ignoreBuildErrors: false`; `pnpm typecheck` exits 0 (6/6 tasks successful) |
| 4 | Full functional QA — no regressions, all pages load, console clean | HUMAN NEEDED | Cannot verify without running application |

**Score:** 3/4 success criteria verified (2 fully, 1 partial, 1 human)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/lib/cluster-watch-manager.ts` | DELETED | VERIFIED | File absent from filesystem |
| `apps/api/src/lib/resource-watch-manager.ts` | DELETED | VERIFIED | File absent from filesystem |
| `apps/api/src/lib/cluster-connection-state.ts` | DELETED | VERIFIED | File absent from filesystem |
| `apps/api/src/routers/subscriptions.ts` | DELETED | VERIFIED | File absent from filesystem |
| `apps/api/src/lib/k8s-watchers.ts` | DELETED (extra, correct) | VERIFIED | File absent; all 3 exports were only consumed by subscriptions.ts |
| `apps/api/src/__tests__/subscriptions.test.ts` | DELETED (extra, correct) | VERIFIED | Test file for deleted router — also gone |
| `apps/api/src/routers/index.ts` | subscriptions import removed | VERIFIED | No `subscriptions` import; 91 lines; all remaining routers accounted for |
| `apps/api/src/server.ts` | stopAllWatchers removed | VERIFIED | No `stopAllWatchers` or `k8s-watchers` reference |
| `apps/api/src/lib/k8s-units.ts` | Comment updated | VERIFIED | Line 1: `/** Shared K8s unit parsers — used by metrics router and watch-manager */` (legacy reference removed) |
| `apps/web/next.config.ts` | `ignoreBuildErrors: false` | VERIFIED | Line 9: `ignoreBuildErrors: false` |
| `charts/voyager/sql/init.sql` | 8 new idempotent indexes | PARTIAL | 8 required indexes present but file has duplicate block — see Gaps section |
| `packages/db/src/schema/events.ts` | `idx_events_cluster_ts` index | VERIFIED | Line 33: `index('idx_events_cluster_ts').on(table.clusterId, table.timestamp)` |
| `packages/db/src/schema/nodes.ts` | `idx_nodes_cluster` + `idx_nodes_cluster_name` | VERIFIED | Lines 27-28: both indexes present |
| `packages/db/src/schema/audit-log.ts` | `idx_audit_log_timestamp` + `idx_audit_log_resource_id` | VERIFIED | Lines 17-18: both indexes present |
| `packages/db/src/schema/alerts.ts` | `idx_alert_history_alert_triggered` | VERIFIED | Line 29: index present on alertHistory |
| `packages/db/src/schema/health-history.ts` | `idx_health_history_cluster_checked` + `idx_health_history_checked` | VERIFIED | Lines 17-18: both indexes present |

---

### Key Link Verification (from 04-02 PLAN must_haves)

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `charts/voyager/sql/init.sql` | `packages/db/src/schema/*.ts` | Index names must match exactly | PARTIAL | The 8 indexes added by 04-02 (lines 128-144, 162-179, 408-410) match Drizzle exactly. However 6 indexes from the 04-01 duplicate block (lines 623-631) use different names that have NO Drizzle counterparts: idx_events_kind, idx_audit_log_user_ts, idx_audit_log_ts, idx_audit_log_action, idx_alert_history_alert_ts, idx_health_history_cluster_ts |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase adds infrastructure (indexes, build config) and removes code. No new components that render dynamic data were introduced.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No broken imports after dead code removal | `grep -r "cluster-watch-manager\|resource-watch-manager\|cluster-connection-state\|k8s-watchers" apps/api/src/` | Zero matches | PASS |
| subscriptions router removed from barrel | `grep "subscriptions" apps/api/src/routers/index.ts` | Zero matches | PASS |
| ignoreBuildErrors is false | `grep "ignoreBuildErrors" apps/web/next.config.ts` | `ignoreBuildErrors: false` | PASS |
| TypeScript compiles clean | `pnpm typecheck` | 6/6 tasks successful, 0 errors | PASS |
| 8 required index names in init.sql | `grep -c "idx_events_cluster_ts\|..."` | All 8 present | PASS |
| 8 Drizzle index() definitions | `grep -r "index('" packages/db/src/schema/` | 8 phase-related definitions found | PASS |
| Commits from summaries exist | `git log --oneline` | cb6e732, ec77061, cf84bea, 40fbfcb, ce0cf6c all present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CLEAN-01 | 04-01 | Remove dead code — legacy watchers, unused subscriptions router, dead emitter methods (~900 lines) | SATISFIED | All 6 files deleted (1312 lines total including k8s-watchers.ts and subscriptions.test.ts), no broken imports, server.ts cleaned |
| CLEAN-02 | 04-01, 04-02 | Add missing DB indexes on events, nodes, audit_log, alert_history, health_history | PARTIAL | 8 indexes in Drizzle schemas match init.sql; however init.sql has a second independent block from 04-01 (lines 623-631) with 8 different/overlapping names not reflected in Drizzle |
| CLEAN-03 | 04-01 | Remove `ignoreBuildErrors: true` from Next.js config and fix any build errors it was hiding | SATISFIED | `ignoreBuildErrors: false` confirmed; `pnpm typecheck` exits 0 |

**Orphaned requirements check:** REQUIREMENTS.md maps CLEAN-01, CLEAN-02, CLEAN-03 to Phase 4. All three appear in plan frontmatter. No orphaned requirements.

---

### Anti-Patterns Found

| File | Lines | Pattern | Severity | Impact |
|------|-------|---------|----------|--------|
| `charts/voyager/sql/init.sql` | 623-631 | Duplicate index block — idx_events_cluster_ts (also at 144) and idx_nodes_cluster (also at 128) defined a second time; 6 additional index names (idx_events_kind, idx_audit_log_user_ts, etc.) not present in Drizzle schemas | Warning | PostgreSQL `CREATE INDEX IF NOT EXISTS` silently ignores duplicates so no runtime failure, but schema file is inconsistent: Drizzle-unaware indexes exist, and the file has two separate "add indexes for these 5 tables" blocks that were added by independent plans |

---

### Human Verification Required

#### 1. Post-Cleanup Functional QA

**Test:** Clear browser cookies, start dev servers, navigate to: dashboard, cluster list, pods, nodes, events, audit log, alerts, helm, CRDs. Switch between dark and light themes on at least two pages.
**Expected:** Every page renders data (not blank/spinner), zero `[ERROR]` entries in browser console
**Why human:** Requires a running application; console errors from tree-shaking or missing re-exports (e.g., if any component imported from deleted files transitively) can only be observed in a browser

#### 2. PostgreSQL Startup with Duplicate init.sql

**Test:** Run `docker compose down -v && docker compose up -d`, observe PostgreSQL startup logs for errors.
**Expected:** No errors relating to duplicate index creation; `CREATE INDEX IF NOT EXISTS` second invocations are silently skipped
**Why human:** Requires a live database; confirms the duplicate block is harmless at runtime

---

### Gaps Summary

**One gap — init.sql inconsistency from parallel plan execution:**

Plans 04-01 and 04-02 ran independently and both modified `charts/voyager/sql/init.sql`. The 04-02 plan correctly inserted indexes inline after each table definition (lines 128-144 area, 162-179 area, 408-410 area). The 04-01 plan appended a separate block at the end of the file (lines 623-631) with partially overlapping but differently-named indexes.

This resulted in:

1. **Two duplicate definitions** — `idx_events_cluster_ts` (lines 144 and 624) and `idx_nodes_cluster` (lines 128 and 626) appear twice. `CREATE INDEX IF NOT EXISTS` makes this a no-op at runtime.

2. **6 Drizzle-unaware indexes** — The 04-01 block adds: `idx_events_kind`, `idx_audit_log_user_ts`, `idx_audit_log_ts`, `idx_audit_log_action`, `idx_alert_history_alert_ts`, `idx_health_history_cluster_ts`. None of these appear in any Drizzle schema file. The 04-02 must_haves key_link specifies "Index names must match exactly between init.sql and Drizzle schemas."

**Resolution options:**
- **Recommended:** Remove the 04-01 duplicate block (lines 623-631) from init.sql. All required CLEAN-02 coverage is already present via the 04-02 inline insertions. If the extra indexes (idx_events_kind, idx_audit_log_user_ts etc.) are valuable, keep them and add matching Drizzle `index()` definitions.
- **Alternative:** Keep both blocks (they are idempotent) and add 6 Drizzle index definitions to close the Drizzle-SQL mismatch.

The CLEAN-02 requirement is functionally met — the database will have all required indexes when init.sql runs. The gap is schema file consistency and Drizzle awareness of 6 additional indexes.

---

_Verified: 2026-03-30T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
