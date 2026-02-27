# Pipeline Improvement TODO Checklist
## Generated: 2026-02-27 | Source: Phase F Post-Mortem (v144→v147)
## Last Updated: 2026-02-28

---

## 🔴 P0 — Critical Issues

- [ ] **[PIPE-001]** Foreman dies mid-pipeline → no auto-resurrection
  - **Where:** `skills/guardian-verification/SKILL.md`, `skills/pipeline-orchestrator/SKILL.md`

- [x] **[PIPE-002]** Dev fixes partial component → misses 2/3 components with same bug ✅ 2026-02-27
  - **Fix:** Grep-All Rule added to `frontend-feature/SKILL.md`

- [x] **[PIPE-003]** Fix loop #1 didn't catch all instances ✅ 2026-02-28
  - **Fix:** qa-visual SKILL.md updated: test ALL components with same pattern, show evidence per component

- [x] **[PIPE-004]** Mai browser tabs not closing ✅ 2026-02-27
  - **Fix:** Close tabs rule in qa-visual SKILL.md

- [x] **[PIPE-005]** QA 7.5 gate failure → no early warning ✅ 2026-02-28
  - **Fix:** Visual Anti-Pattern Checklist added to `code-review/SKILL.md`

---

## 🟡 P1 — Agent Efficiency Issues

- [x] **[PIPE-006]** Task prompts duplicate SKILL.md content ✅ 2026-02-28
  - **Fix:** Standard spawn template created in `pipeline-orchestrator/references/spawn-templates.md`

- [ ] **[PIPE-007]** Foreman spawn-and-exit pattern reappearing
  - **Where:** `skills/pipeline-orchestrator/SKILL.md`

- [ ] **[PIPE-008]** Guardian reports but doesn't heal
  - **Where:** `skills/guardian-verification/SKILL.md`

- [ ] **[PIPE-009]** Pipeline monitor shows "stalled" but doesn't auto-heal
  - Covered by PIPE-008

- [x] **[PIPE-010]** Dev agent doesn't systematically search codebase ✅ 2026-02-27
  - Covered by PIPE-002 fix

---

## 🟢 P2 — Skill Gaps

- [x] **[PIPE-011]** Missing skill: `pipeline-deep-research` ✅ 2026-02-27

- [x] **[PIPE-012]** Missing skill: `foreman-resume` ✅ 2026-02-28
  - **Fix:** Created `skills/foreman-resume/SKILL.md`

- [x] **[PIPE-013]** qa-visual skill missing "grep all theme variants" ✅ 2026-02-28
  - **Fix:** Added dark+light mode testing rule to `qa-visual/SKILL.md`

- [x] **[PIPE-014]** frontend-feature skill missing "grep ALL instances" rule ✅ 2026-02-27
  - Covered by PIPE-002 fix

- [ ] **[PIPE-015]** Guardian skill missing "steer active Foreman" capability
  - **Where:** `skills/guardian-verification/SKILL.md`

---

## 📚 P3 — Documentation & Process

- [x] **[PIPE-016]** SHARED-PIPELINE-LEARNINGS.md is empty ✅ 2026-02-27
  - **Fix:** Populated with Phase F learnings

- [x] **[PIPE-017]** Agent spawn prompts not standardized ✅ 2026-02-28
  - **Fix:** Template in `pipeline-orchestrator/references/spawn-templates.md`

- [x] **[PIPE-018]** No rollback procedure documented ✅ 2026-02-28
  - **Fix:** Rollback section added to `build-deploy/SKILL.md`

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| 🔴 P0 Critical | 5 | 4 fixed, 1 pending (PIPE-001) |
| 🟡 P1 Efficiency | 5 | 2 fixed, 3 pending (PIPE-007/008/009) |
| 🟢 P2 Skill Gaps | 5 | 4 fixed, 1 pending (PIPE-015) |
| 📚 P3 Documentation | 3 | 3 fixed ✅ |
| **Total** | **18** | **13 fixed, 5 pending** |

## Remaining Items
All 5 pending items relate to Guardian steer/heal capability (PIPE-001/007/008/009/015).
These require Guardian skill overhaul — separate task.
