---
phase: 10
slug: lens-style-live-data-k8s-watch-stream-architecture
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (installed) |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm build && pnpm typecheck` |
| **Full suite command** | `pnpm test && pnpm build && pnpm typecheck` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build && pnpm typecheck`
- **After every plan wave:** Run `pnpm test && pnpm build && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | D-06 | unit | `pnpm --filter api test -- src/__tests__/watch-manager.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | D-07 | unit | `pnpm --filter api test -- src/__tests__/watch-manager.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | D-01 | unit | `pnpm --filter api test -- src/__tests__/resource-stream.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | D-02 | unit | `pnpm --filter api test -- src/__tests__/resource-stream.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | D-03 | manual | grep for setQueryData in useResourceSSE | ✅ | ⬜ pending |
| 10-04-01 | 04 | 2 | D-08 | manual | `grep -r refetchInterval apps/web/src/ \| wc -l` = 0 (watched resources) | N/A | ⬜ pending |
| 10-05-01 | 05 | 3 | D-09 | manual | grep verification: health-sync, node-sync, event-sync removed from server.ts | N/A | ⬜ pending |
| 10-ALL | ALL | ALL | All | build | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/watch-manager.test.ts` — stubs for D-06, D-07 (WatchManager lifecycle + data reads)
- [ ] `apps/api/src/__tests__/resource-mappers.test.ts` — covers mapper extraction (same output from router and mapper)
- [ ] `apps/api/src/__tests__/resource-stream.test.ts` — covers D-01, D-02 (SSE data format + batching)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zero refetchInterval for watched resources | D-08 | Grep count verification across 40+ files | `grep -rn refetchInterval apps/web/src/ \| grep -v node_modules` should show only metrics/presence/settings queries |
| Sync jobs removed from server.ts | D-09 | Startup sequence verification | `grep -n 'health-sync\|node-sync\|event-sync' apps/api/src/server.ts` should return nothing |
| SSE carries transformed data in browser | D-01, D-03 | Requires running app with live K8s cluster | Open cluster page, check DevTools Network tab for SSE events with full resource objects |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
