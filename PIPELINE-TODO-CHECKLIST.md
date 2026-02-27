# Pipeline Improvement TODO Checklist
## Generated: 2026-02-27 | Source: Phase F Post-Mortem (v144→v147)

---

## 🔴 P0 — Critical Issues (חייב לתקן לפני pipeline הבא)

- [ ] **[PIPE-001]** Foreman dies mid-pipeline → no auto-resurrection
  - **Problem:** Foreman session died/exited during pipeline. Guardian cron detected "stalled" but only reported — didn't steer or respawn. Morpheus had to manually intervene.
  - **Root cause:** Guardian skill only has "report" capability, not "steer active Foreman" or "respawn from checkpoint". Foreman uses spawn-and-exit pattern instead of staying alive.
  - **Impact:** ~30min idle time per occurrence while waiting for manual intervention. Pipeline stalls completely.
  - **Fix:** (1) Add `steer` capability to Guardian skill — if Foreman is alive but stuck, send steer message. (2) If Foreman is dead, Guardian should respawn from `pipeline-state.json` checkpoint. (3) Foreman must stay alive until pipeline reaches terminal state.
  - **Where:** `skills/guardian-verification/SKILL.md`, `skills/pipeline-orchestrator/SKILL.md`
  - **Verification:** Run pipeline, kill Foreman mid-stage → Guardian should auto-resurrect within 5min

- [ ] **[PIPE-002]** Dev fixes partial component → misses 2/3 components with same bug
  - **Problem:** Ron fixed `animate-slide-up` opacity bug in DataTable.tsx (v145) but missed the identical pattern in ResponsiveTable.tsx and page.tsx cluster cards. Required a full extra deploy cycle (v147) to fix.
  - **Root cause:** Dev didn't run `rg "animate-slide-up"` across entire codebase before declaring fix complete. Fixed only the reported component.
  - **Impact:** ~20min wasted on extra deploy cycle (commit→deploy→E2E→QA). $2-3 in compute/tokens.
  - **Fix:** Add mandatory step to `frontend-feature/SKILL.md`: "Before declaring ANY fix complete, run `rg <pattern>` across ALL of `apps/web/src/` to find every instance."
  - **Where:** `skills/frontend-feature/SKILL.md` — add "Grep-All Rule" section
  - **Verification:** Next fix loop — dev must show `rg` output proving all instances found

- [ ] **[PIPE-003]** Fix loop #1 didn't catch all instances → wasted full deploy cycle
  - **Problem:** v145 fix loop addressed 5 QA bugs but only partially fixed the table row fade (1/3 components). v147 was needed to clean up remaining 2 components.
  - **Root cause:** Same as PIPE-002 — no systematic search. Also, QA v145 scored 9/10 and PASSED despite the partial fix (the unfixed components weren't tested in that QA round).
  - **Impact:** 20min extra cycle + 1 extra version deployed
  - **Fix:** (1) Frontend-feature skill: grep-all rule. (2) QA-visual skill: "When verifying a fix, test ALL components that could have the same pattern, not just the reported one."
  - **Where:** `skills/frontend-feature/SKILL.md`, `skills/qa-visual/SKILL.md`
  - **Verification:** QA report must list "grepped components" for each fix verified

- [ ] **[PIPE-004]** Mai browser tabs not closing → memory leak (תוקן הלילה ✅)
  - **Problem:** Mai QA sessions opened browser tabs but didn't close them, accumulating memory usage over multiple QA runs.
  - **Root cause:** qa-visual skill didn't have explicit "close tab at end" instruction. Fixed in tonight's v147 QA session.
  - **Impact:** Browser memory leak, potential OOM in long pipeline runs
  - **Fix:** ✅ Already fixed — Mai now closes tabs. Document in qa-visual SKILL.md as permanent rule.
  - **Where:** `skills/qa-visual/SKILL.md` — add "Browser Cleanup" section
  - **Verification:** Check Mai's session history — last action should be tab close

- [ ] **[PIPE-005]** QA 7.5 gate failure → no early warning before full deploy
  - **Problem:** v144 deployed, ran full E2E (passed), then QA found 5 visual bugs scoring 7.5/10. The visual issues were predictable from code review (animation patterns, color choices).
  - **Root cause:** No pre-deploy visual lint or automated check for known problematic patterns (e.g., `animationFillMode: 'both'`, green color on zero values).
  - **Impact:** Full deploy cycle wasted when issues could have been caught at review stage
  - **Fix:** Add checklist to `code-review/SKILL.md`: "Flag known visual anti-patterns: animationFillMode, semantic color misuse, hardcoded opacity values"
  - **Where:** `skills/code-review/SKILL.md`
  - **Verification:** Next review catches visual anti-patterns before deploy

---

## 🟡 P1 — Agent Efficiency Issues

- [ ] **[PIPE-006]** Task prompts duplicate SKILL.md content
  - **Problem:** Foreman writes long task prompts (500+ words) that repeat instructions already in the agent's SKILL.md. Wastes tokens and creates conflicting instructions when skill updates.
  - **Root cause:** No standard template for spawn prompts. Each Foreman writes differently.
  - **Impact:** ~10-20K extra tokens per spawn (~$0.30-0.60 per pipeline)
  - **Fix:** Create standard spawn prompt template: "Read SKILL.md first. Task: [specific what+where]. Context: [version, branch, evidence file path]."
  - **Where:** `skills/pipeline-orchestrator/SKILL.md` — add "Spawn Prompt Template" section
  - **Verification:** Audit next Foreman's spawn calls — prompts should be <200 words

- [ ] **[PIPE-007]** Foreman spawn-and-exit pattern reappearing
  - **Problem:** Foreman spawns workers then exits instead of staying alive to coordinate the full cycle. Workers complete but no one picks up the next stage.
  - **Root cause:** Subagent depth limits and session timeouts cause Foreman to exit. No explicit "stay alive" instruction in orchestrator skill.
  - **Impact:** Pipeline stalls between stages, requires manual restart
  - **Fix:** Add explicit instruction to pipeline-orchestrator: "You MUST stay alive until pipeline reaches terminal state (complete/paused/failed). Use cleanup:'keep' for workers."
  - **Where:** `skills/pipeline-orchestrator/SKILL.md`
  - **Verification:** Foreman session stays alive through full pipeline cycle

- [ ] **[PIPE-008]** Guardian reports but doesn't heal
  - **Problem:** Guardian cron detected "stalled" pipeline state but only sent a report to Discord. Didn't attempt to steer the stuck Foreman or respawn it.
  - **Root cause:** Guardian skill only has verification/reporting capabilities, not intervention capabilities.
  - **Impact:** Pipeline stays stuck until human notices Guardian's report
  - **Fix:** Add escalation ladder to Guardian: (1) Steer active Foreman. (2) If no response after 5min, respawn Foreman from checkpoint. (3) If respawn fails, alert Morpheus.
  - **Where:** `skills/guardian-verification/SKILL.md`
  - **Verification:** Simulate stalled pipeline → Guardian should auto-heal within 10min

- [ ] **[PIPE-009]** Pipeline monitor shows "stalled" but doesn't auto-heal
  - **Problem:** pipeline-state.json shows old timestamp but no automated recovery kicks in.
  - **Root cause:** Related to PIPE-008 — Guardian is the monitor but lacks healing capability.
  - **Impact:** Same as PIPE-008
  - **Fix:** Covered by PIPE-008 fix
  - **Where:** Same as PIPE-008
  - **Verification:** Same as PIPE-008

- [ ] **[PIPE-010]** Dev agent doesn't systematically search codebase
  - **Problem:** Ron fixed the reported component but didn't use `rg` to find all instances of the same pattern across the codebase.
  - **Root cause:** frontend-feature skill doesn't mandate codebase-wide search before declaring fix complete.
  - **Impact:** Covered by PIPE-002/003
  - **Fix:** Covered by PIPE-002 fix
  - **Where:** `skills/frontend-feature/SKILL.md`
  - **Verification:** Dev agent session shows `rg` command before completion report

---

## 🟢 P2 — Skill Gaps

- [ ] **[PIPE-011]** Missing skill: `pipeline-deep-research`
  - **Problem:** No structured skill for pipeline post-mortem analysis.
  - **Fix:** ✅ Created in this session — `skills/pipeline-deep-research/SKILL.md`
  - **Verification:** Skill file exists and is loadable

- [ ] **[PIPE-012]** Missing skill: `foreman-resume` (checkpoint-based resume)
  - **Problem:** When Foreman dies, there's no clear contract for resuming from checkpoint. Each resume attempt re-reads everything and may repeat completed stages.
  - **Fix:** Create `foreman-resume` skill with: (1) Read pipeline-state.json. (2) Identify last completed stage. (3) Resume from next stage. (4) Don't repeat completed work.
  - **Where:** `skills/foreman-resume/SKILL.md` (new)
  - **Verification:** Kill Foreman mid-pipeline, resume → skips completed stages

- [ ] **[PIPE-013]** qa-visual skill missing "grep all theme variants" instruction
  - **Problem:** QA verifies fix in one theme mode but not both. v145 QA passed 9/10 but dark mode still had fade issues in untested components.
  - **Fix:** Add to qa-visual: "For EVERY fix verified, test in BOTH dark and light mode. For table/list fixes, test on pages with different row counts."
  - **Where:** `skills/qa-visual/SKILL.md`
  - **Verification:** QA report shows dark+light verification for each fix

- [ ] **[PIPE-014]** frontend-feature skill missing "grep ALL instances" rule
  - **Problem:** Covered by PIPE-002
  - **Fix:** Add "Grep-All Rule" section: Before declaring any CSS/animation/styling fix complete, run `rg <pattern> apps/web/src/` and fix ALL matches.
  - **Where:** `skills/frontend-feature/SKILL.md`
  - **Verification:** Dev completion report includes grep output

- [ ] **[PIPE-015]** Guardian skill missing "steer active Foreman" capability
  - **Problem:** Covered by PIPE-008
  - **Fix:** Add steer + respawn escalation ladder to Guardian skill
  - **Where:** `skills/guardian-verification/SKILL.md`
  - **Verification:** Guardian can steer via `subagents(action='steer')`

---

## 📚 P3 — Documentation & Process

- [ ] **[PIPE-016]** SHARED-PIPELINE-LEARNINGS.md is empty
  - **Problem:** File exists but has no content. All learnings are scattered across individual agent `.learnings/` directories.
  - **Fix:** Consolidate key learnings from tonight's pipeline into SHARED-PIPELINE-LEARNINGS.md. Add instruction to pipeline-orchestrator: "At pipeline end, Foreman writes top 5 learnings to SHARED-PIPELINE-LEARNINGS.md"
  - **Where:** `workspace/.learnings/SHARED-PIPELINE-LEARNINGS.md`, `skills/pipeline-orchestrator/SKILL.md`
  - **Verification:** File has content after next pipeline run

- [ ] **[PIPE-017]** Agent spawn prompts not standardized
  - **Problem:** Each Foreman instance writes different quality task prompts. Some are 500+ words, others are vague one-liners.
  - **Fix:** Define standard template in pipeline-orchestrator skill (see PIPE-006)
  - **Where:** `skills/pipeline-orchestrator/SKILL.md`
  - **Verification:** Audit 3 consecutive Foreman spawn calls — all follow template

- [ ] **[PIPE-018]** No rollback procedure documented
  - **Problem:** If a deploy breaks production, there's no documented rollback procedure. Agents would need to figure it out ad-hoc.
  - **Fix:** Document in build-deploy skill: "Rollback: `helm rollback voyager-api/web` + verify pods + update pipeline-state.json"
  - **Where:** `skills/build-deploy/SKILL.md`
  - **Verification:** Rollback section exists with exact commands

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| 🔴 P0 Critical | 5 | 1 fixed (PIPE-004), 4 pending |
| 🟡 P1 Efficiency | 5 | All pending |
| 🟢 P2 Skill Gaps | 5 | 1 fixed (PIPE-011), 4 pending |
| 📚 P3 Documentation | 3 | All pending |
| **Total** | **18** | **2 fixed, 16 pending** |

## Next Steps
1. Fix P0 items before next pipeline run
2. Update skills with grep-all rules and Guardian steer capability
3. Create foreman-resume skill
4. Populate SHARED-PIPELINE-LEARNINGS.md
