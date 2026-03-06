# BOARD.md — v192 Bug Fix + Feature Pipeline

**Status:** 🔄 FIX LOOP — BUG-192-001 patch deploy in progress
**Version:** v192
**Base:** v191 (deployed)
**Started:** 2026-03-06
**Completed:** 2026-03-06

---

## 🐛 v192 Bug Fixes + Feature

### BUG-192-001 — CRITICAL: Anomalies tab breaks all other tabs
- [x] **BUG-192-001** 🔄 — Fix Loop Iteration 2: REAL root cause found by Foreman. InlineAiPanel useCallback(askQuestion) depended on contextChatMutation (new ref every render) → useEffect re-fired every render → infinite setState loop when open=false → React event queue saturated → ALL sidebar navigation unresponsive. Fix: mutationRef pattern + useRef for hasAskedInitial. Commit: 7f6d2e8. Deploying as v192-fix.

### BUG-192-002 — Light mode: Resource Utilization bars invisible at 0%
- [x] **BUG-192-002** ✅ — Fixed: replaced bg-white/* with bg-muted, then bg-[var(--color-track)]. Commits: 74fb698, 878a7d7. QA verified: bars visible at 0%.

### BUG-192-003 — "VA" badge mystery + misplacement
- [x] **BUG-192-003** ✅ — Fixed: PresenceBar.tsx redesigned — 32px circular avatar, tooltip, right-aligned. Commit: 74fb698. QA verified.

### BUG-192-004 — Widgets dialog uses hardcoded colors
- [x] **BUG-192-004** ✅ — Fixed: added CSS variables to globals.css, replaced all hardcoded hex. Commits: 1ec8dda, 878a7d7. E2E verified.

### BUG-192-005 — Add Widget functionality broken
- [x] **BUG-192-005** ✅ — Fixed: applyServerLayout guard, connect refetchInterval to widgets. Commit: 1ec8dda. E2E verified.

### FEAT-192-001 — Live 24h graphs with configurable refresh interval
- [x] **FEAT-192-001** ✅ — Implemented: useRefreshInterval hook, RefreshIntervalSelector, DashboardRefreshContext, localStorage persistence. Commit: 1ec8dda. QA verified: LIVE pulse + 5m selector visible.

### BUG-192-006 — Add Cluster wizard: no visual selection state
- [x] **BUG-192-006** ✅ — Fixed: selected card border-2, bg tint, CheckCircle2 icon, scale-[1.02]. Commit: 1ec8dda. E2E verified.

---

## Pipeline Gates
- ✅ Code Review (Lior): 10/10
- ✅ E2E (Yuval): 0 failures (95 pass, 18 skip)
- ✅ Desktop QA (Foreman): 9/10
- ✅ VERSION: git tag v192 → docker → helm → state.json

## Status: ✅ ALL 7 ITEMS COMPLETE — v192 DEPLOYED

**Deploy URL:** http://voyager-platform.voyagerlabs.co
**Tag:** v192 (e9fd725)
**Merged to:** main
**Awaiting:** Vik review
