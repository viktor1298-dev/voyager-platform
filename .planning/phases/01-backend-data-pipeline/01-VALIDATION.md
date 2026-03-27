---
phase: 1
slug: backend-data-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (installed) |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PIPE-01, PIPE-02, PIPE-03, PIPE-05 | unit | `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x` | W0 | pending |
| 01-01-02 | 01 | 1 | PIPE-01, PIPE-02, PIPE-03 | unit | `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x` | W0 | pending |
| 01-02-01 | 02 | 2 | PIPE-01, PIPE-05 | typecheck | `pnpm typecheck` | existing | pending |
| 01-02-02 | 02 | 2 | PIPE-01, PIPE-05 | typecheck+build | `pnpm typecheck && pnpm build` | existing | pending |

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/metrics-pipeline.test.ts` — covers PIPE-01, PIPE-02, PIPE-03 (time_bucket query construction, response shape, bucket alignment)
- [ ] `apps/api/src/__tests__/metrics-validation.test.ts` — covers PIPE-05 (Zod schema rejects old ranges, accepts new ranges)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DB time_bucket() works on non-hypertable | PIPE-02 | Needs running TimescaleDB | `docker compose up -d && psql -U voyager -c "SELECT time_bucket('1 hour', NOW())"` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-28
