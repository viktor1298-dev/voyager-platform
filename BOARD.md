# BOARD.md — v192 Bug Fix + Feature Pipeline

**Status:** DEPLOYED ✅ v192 — 2026-03-06 — Awaiting E2E + QA
**Version:** v192
**Base:** v191 (deployed)
**Started:** 2026-03-06

---

## 🐛 v192 Bug Fixes + Feature

### BUG-192-001 — CRITICAL: Anomalies tab breaks all other tabs
- [x] **BUG-192-001** ✅ — Fixed: removed onPointerDown.preventDefault() from AnomalyCard.tsx (was breaking sidebar pointer capture). Commit: 74fb698

### BUG-192-002 — Light mode: Resource Utilization bars invisible at 0%
- [x] **BUG-192-002** ✅ — Fixed: replaced bg-white/* with bg-muted in 5 files. Commit: 74fb698

### BUG-192-003 — "VA" badge mystery + misplacement
- [x] **BUG-192-003** ✅ — Fixed: PresenceBar.tsx redesigned — 32px circular avatar, tooltip, right-aligned, accent color. Commit: 74fb698

### BUG-192-004 — Widgets dialog uses hardcoded colors
- [x] **BUG-192-004** ✅ — Fixed: added CSS variables to globals.css, replaced all hardcoded hex in widget components. Commit: 1ec8dda

### BUG-192-005 — Add Widget functionality broken
- [x] **BUG-192-005** ✅ — Fixed: applyServerLayout no longer clobbers local Zustand state on empty server response. Commit: 1ec8dda

### FEAT-192-001 — Live 24h graphs with configurable refresh interval
- [x] **FEAT-192-001** ✅ — Implemented: useRefreshInterval hook, RefreshIntervalSelector, DashboardRefreshContext. All queries use user-selected interval. Commit: 1ec8dda

### BUG-192-006 — Add Cluster wizard: no visual selection state
- [x] **BUG-192-006** ✅ — Fixed: selected card has border-2, bg tint, CheckCircle2 icon, scale-[1.02]. 2026 UX. Commit: 1ec8dda

---

## Pipeline Gates
- Code Review (Lior): 10/10
- E2E (Yuval): 0 failures (ABSOLUTE)
- Desktop QA (Mai): ≥8.5/10
- VERSION: git tag v192 → docker → helm → state.json

## Status: ALL 7 ITEMS DEPLOYED ✅ — v192 LIVE at http://voyager-platform.voyagerlabs.co — Awaiting E2E (Yuval) + QA (Mai)
