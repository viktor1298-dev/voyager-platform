# Shared Pipeline Learnings

## [LEARN-20260305-001] best_practice

**Logged**: 2026-03-05T18:28:00+02:00
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
E2E test failures: always check the navigation URL first before fixing selectors or timeouts.

### Details
v188 had 2 failing E2E tests in optimistic-ui.spec.ts. We went through 3 fix iterations (h2→h1 selector, waitForURL timeout, DOM waitForSelector) before identifying the real root cause: `goto('/')` redirects away from `/clusters`, so the test never reaches the page it expects. The correct fix was simply `goto('/clusters')`.

### Suggested Action
When E2E tests fail on "element not found" or timeout: first verify the test navigates to the correct URL. Check redirect behavior before touching selectors or timeouts.

### Metadata
- Source: pipeline-consolidation
- Agent: foreman
- Wave: Phase-M v188
- Tags: e2e, flaky-tests, root-cause-analysis, fix-loop

## v192 E2E Run — 2026-03-06

**Agent**: Yuval 🧪
**Result**: GATE FAIL — 9 failures (but all test-side, not product regressions)

### Key Finding
m-p3-features.spec.ts written with wrong selectors when M-P3 features were added.
Clusters page uses router.push() not <a href> links. Tests look for `a[href*="/clusters/"]` = always fails.

### Action Items
- [ ] Dima: Fix selectors in tests/e2e/m-p3-features.spec.ts (ERR-20260306-YUV)
- [ ] byok-flow.spec.ts flaky test (failCount now 2) — increase toBeEnabled() timeout or add explicit wait

### Pipeline Note
Evidence written to pipeline-evidence/e2e-v192.json
Flaky registry updated for byok-flow (failCount: 2)

---

## [v192 Pipeline Resume — 2026-03-06]

**Run**: v192 | **Stage resumed**: qa | **Final QA score**: 9/10 PASS

### Top 3 Learnings

1. **Check evidence files before respawning** — qa-v192.json already existed from Mai's prior run. On resume, Foreman should check `pipeline-evidence/qa-v192.json` before spawning a new Mai instance. Avoids redundant QA work.

2. **Discord cross-context block in webchat** — When Foreman runs in webchat subagent context, `message(action=send, channel=discord)` is blocked. Discord progress updates must be delegated to spawned agents (Mai, Uri, etc.) who run in proper Discord context.

3. **foreman-resume SKILL.md location** — Skill is in `~/.openclaw/workspace/skills/foreman-resume/SKILL.md`, not in npm-global skills. Use `find` to locate if path is unclear.

---
