# Phase 1: Diagnose & Fix Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 01-diagnose-fix-pipeline
**Areas discussed:** Dual data source conflict, Investigation approach, QA validation method, emitWatchEvent safety

---

## Dual Data Source Conflict

| Option | Description | Selected |
|--------|-------------|----------|
| SSE only, no tRPC fallback | For 15 watched types, components read exclusively from Zustand. Remove all refetchInterval. Like Lens. | ✓ |
| SSE primary, tRPC lazy fallback | Read Zustand first, call tRPC if SSE hasn't delivered within 10s. No periodic polling. | |
| You decide | Claude picks the approach | |

**User's choice:** SSE only — "I want that our app will work with live-data like lens, rancher, and all these high tech companies, I want their approach, I want live-data prod-grade ready."
**Notes:** User deferred the specific technical choice but was clear on the goal: match Lens/Rancher. This maps to SSE-only for watched types.

---

## Investigation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Fix known suspects directly | Remove TQ polling, fix informer reconnect, verify monkeypatch. Test after each. | ✓ |
| Add diagnostic logging first | Instrument each pipeline link, reproduce bug, then fix based on evidence | |
| You decide | Claude picks based on debugging context | |

**User's choice:** Fix known suspects directly (Recommended)
**Notes:** Research has high confidence on root causes. Direct fix approach preferred.

---

## QA Validation Method

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright automated test | Build E2E test: delete pod, 4 screenshots at 3s intervals, compare | |
| Manual with functional-qa skill | Use existing skill for manual verification | |
| Both — automated + manual | Write Playwright test for CI, also do manual QA for phase gate | ✓ |

**User's choice:** Both — "I also want to make sure we really have e2e tests for everything. This can help us avoid bugs."
**Notes:** User emphasized comprehensive E2E test coverage, not just for this feature but as a general practice.

---

## emitWatchEvent Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor to proper middleware | Replace monkeypatch with EventEmitter listener pattern. Zero SSE blocking risk. | ✓ |
| Just verify + add safety | Keep monkeypatch, add try/catch and health check | |
| You decide | Claude picks safest approach | |

**User's choice:** Refactor to proper middleware (Recommended)
**Notes:** None

---

## Claude's Discretion

- Specific order of fixes within the three known suspects
- Whether to upgrade @kubernetes/client-node or patch informer reconnect locally
- Implementation details of the EventEmitter listener refactor

## Deferred Ideas

None — discussion stayed within phase scope
