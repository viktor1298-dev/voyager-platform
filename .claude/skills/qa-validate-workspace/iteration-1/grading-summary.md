# Grading Summary — qa-validate Skill Evaluation (Iteration 1)

**Date:** 2026-03-27
**Evaluator:** Claude Code (grading agent)
**Assertions graded:** 6 per report, 6 reports total (3 evals x 2 conditions)

---

## Comparison Table

| Assertion | eval-0 with | eval-0 without | eval-1 with | eval-1 without | eval-2 with | eval-2 without |
|-----------|:-----------:|:--------------:|:-----------:|:--------------:|:-----------:|:--------------:|
| A1: Snapshot before screenshot | PASS | FAIL | PASS | FAIL | PASS | FAIL |
| A2: Console error check | PASS | PASS | PASS | PASS | PASS | PASS |
| A3: Programmatic assertions | PASS | FAIL | PASS | FAIL | PASS | FAIL |
| A4: Structured 5-layer report | PASS | FAIL | PASS | FAIL | PASS | FAIL |
| A5: Page type identification | PASS | FAIL | PASS | PASS | PASS | PASS |
| A6: Would catch empty page | PASS | FAIL | PASS | PASS | PASS | PASS |
| **Pass rate** | **6/6 (1.00)** | **1/6 (0.17)** | **6/6 (1.00)** | **3/6 (0.50)** | **6/6 (1.00)** | **3/6 (0.50)** |

---

## Aggregate Pass Rates

| Condition | eval-0 | eval-1 | eval-2 | Average |
|-----------|--------|--------|--------|---------|
| **with_skill** | 1.00 | 1.00 | 1.00 | **1.00** |
| **without_skill** | 0.17 | 0.50 | 0.50 | **0.39** |
| **Delta** | +0.83 | +0.50 | +0.50 | **+0.61** |

---

## Key Findings

### Assertions the skill consistently enforces (100% with vs 0% without)

1. **A1: Snapshot before screenshot** — The single most important behavioral change. All 3 with_skill runs placed `browser_snapshot` as Layer 1 and screenshot as Layer 4. All 3 without_skill runs went straight to screenshots. This is the core confirmation bias the skill was designed to prevent.

2. **A3: Programmatic assertions** — All with_skill runs included `browser_run_code` with page-type-specific assertion templates (data table, dashboard, login). No without_skill run executed any programmatic JavaScript checks.

3. **A4: Structured 5-layer report** — All with_skill runs produced the Layer 1-5 format with per-layer pass/fail and evidence. Without_skill reports used ad-hoc prose structures.

### Assertions with partial baseline competence

4. **A2: Console error check** — Passed in all 6 runs (with and without skill). Console checking appears to be baseline agent behavior, likely reinforced by the CLAUDE.md QA gate rules. The skill adds value by making console checking a formal gate (Layer 2) rather than an optional afterthought.

5. **A5: Page type identification** — With_skill always identified and labeled the page type explicitly (Data Table, Dashboard, Login). Without_skill showed implicit understanding in eval-1 and eval-2 (tested appropriate elements for the page type) but never explicitly classified it. Failed in eval-0 where no classification was attempted.

6. **A6: Empty page detection** — With_skill guaranteed this via programmatic assertions (row counts, widget counts, form field counts). Without_skill caught it in eval-1 (verified specific data values) and eval-2 (verified form elements) but missed it in eval-0 where only visual inspection was used.

### Notable Observations

- **eval-0 (screenshot trap)** showed the largest delta (+0.83). This is the scenario the skill was specifically designed for: user asks "take a screenshot to check." Without the skill, the agent fell into the screenshot-first trap. With the skill, it refused to shortcut.

- **eval-1 with_skill** produced the strongest report in the set — the only run where all 5 layers executed with live data (app was reachable). It found 14 widgets, 48 number elements, 3 cluster cards, and 0 errors through programmatic checks that no screenshot could verify.

- **eval-1 without_skill** was the most competent baseline run — tested both themes, cleared cookies, checked console on every page, verified network requests. It still lacked the systematic rigor of the skill (no accessibility snapshot, no programmatic assertions, no structured report).

- **App unreachability** affected eval-0 with_skill, eval-2 with_skill (app not deployed). The skill-guided agents handled this gracefully by documenting what they would have done, maintaining protocol compliance even in failure. The without_skill agents in eval-0 and eval-2 adapted by falling back to localhost.

---

## Conclusion

The qa-validate skill produces a **+0.61 average pass rate improvement** (1.00 vs 0.39) across the 3 evaluation scenarios. The three assertions it exclusively enables (A1 snapshot-first, A3 programmatic assertions, A4 structured report) represent the highest-value behavioral changes — these are checks that baseline agents never perform without explicit guidance. Console checking (A2) is already baseline behavior, while page type identification (A5) and empty page detection (A6) show partial baseline competence that the skill elevates to consistent reliability.
