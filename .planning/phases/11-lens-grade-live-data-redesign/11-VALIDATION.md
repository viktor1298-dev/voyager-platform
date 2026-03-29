---
phase: 11
slug: lens-grade-live-data-redesign
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-29
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (unit), pnpm typecheck (type safety) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm build && pnpm typecheck` |
| **Full suite command** | `pnpm test && pnpm build && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build && pnpm typecheck`
- **After every plan wave:** Run `pnpm test && pnpm build && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | L11-IMMEDIATE-SSE, L11-SNAPSHOT | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | L11-COMPRESS-FIX | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 11-02-01 | 02 | 1 | L11-ZUSTAND-STORE | unit | `pnpm test -- src/stores/__tests__/resource-store.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | L11-SELECTOR-READS | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 2 | L11-DIRECT-SSE, L11-ZUSTAND-WIRE | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 11-03-02 | 03 | 2 | L11-PROXY-REMOVAL | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 11-04-01 | 04 | 3 | L11-CONSUMER-MIGRATION | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |
| 11-04-02 | 04 | 3 | L11-NO-POLLING-WATCHED | build+type | `pnpm build && pnpm typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/src/stores/__tests__/resource-store.test.ts` — TDD stubs for Zustand store (created in Plan 02 Task 1)

*Test file is created as part of Plan 02 Task 1 (TDD approach — write tests first, then store).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE latency <100ms | L11-IMMEDIATE-SSE | Requires live K8s cluster + browser DevTools | Set K8S_ENABLED=true, open Network tab, delete a pod, measure time between K8s event and SSE message |
| Direct SSE connection | L11-DIRECT-SSE | Requires running app with CORS | Open browser, check EventSource URL points to API port (4001), not Next.js (3000) |
| Zero dropped events | L11-ZUSTAND-WIRE | Requires load testing | Delete/create pods rapidly, verify store count matches kubectl count |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
