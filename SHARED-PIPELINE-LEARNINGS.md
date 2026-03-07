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

## v194 Phase 3 Pipeline — 2026-03-07

### Top 3 Learnings

1. **LazyMotion strict requires m.* not motion.* — affects ENTIRE codebase**
   When adding `<LazyMotion features={domAnimation} strict>` to providers.tsx, ALL files using `motion.div/motion.span/etc` must be migrated to `m.div/m.span`. This isn't just the new files — it's every pre-existing file too (26 files in our case). Review should catch this before merge.
   [SKILL-PATCH: code-review → add LazyMotion strict compatibility check to review checklist]

2. **Worktree divergence causes nav regressions**
   Ron's worktree had stale `navigation.ts` from before Phase 1 nav changes. Phase 3 animation work didn't touch this file, but the worktree diverged from main. Fix: Always run `git merge feat/init-monorepo` in worktree before starting new phase work, or verify key shared files match main.
   [SKILL-PATCH: frontend-feature → add pre-work step: sync worktree with main branch for shared files]

3. **Fix loop count tracking matters — 2 loops here was acceptable**
   Loop 1 (LazyMotion crash) was a genuine architecture issue caught by review. Loop 2 (nav regression) was a worktree sync issue caught by E2E. Both were real bugs fixed quickly. Total pipeline time: ~1 hour for all 3 phases' fix loops.

---

## Pipeline v195→v196-fix1 (2026-03-07) — Foreman Learnings

### 1. Git branch drift during deploy causes E2E to use stale test files
Uri's deploy checkout left repo on `feat/init-monorepo` instead of `main`. Yuval ran tests from the wrong branch, making selector fixes invisible. **Fix:** Always `git checkout main` before E2E. [SKILL-PATCH: e2e-test-suite → add branch verification step]

### 2. /trpc ingress route missing after helm install
Helm chart template had `/trpc` path but deployed ingress didn't include it. Root cause: older chart revision used during initial install. **Fix:** Always `helm upgrade` after deploy to ensure latest chart. Add ingress path verification to deploy checklist.

### 3. Test timeout for clusters table: waitForLoadState insufficient
`domcontentloaded` fires before React hydration + tRPC data fetch. The clusters page shows "Loading..." for seconds. **Fix:** Add `waitForFunction` to wait for loading text to disappear before asserting table/empty state.

---

## v196-fix1 Pipeline Resume — 2026-03-07

**Run**: v196-fix1 | **Stage resumed**: merged (Guardian down) | **Final**: deployed-awaiting-review

### Top 3 Learnings

1. **Check K8s state before spawning deploy** — v196-fix1 was already deployed and healthy. Running `kubectl get pods -o jsonpath=...` before spawning Uri saved an entire deploy cycle (~5 min). Always verify actual image tags before assuming deploy is needed.

2. **Agent timeout ≠ task failure** — Yuval timed out at 15 min, but the evidence file was already written (134/134 pass). Always check `pipeline-evidence/` for evidence files before re-spawning. Timeout often means the agent was stuck on post-task work (self-improvement, learnings) not the actual task.

3. **Pipeline-state vs actual state divergence** — `pipeline-state.json` said `status=merged` but K8s had v196-fix1 running. On resume, verify ACTUAL infrastructure state (pods, images, health, login) not just the JSON file. The source of truth is the cluster, not the state file.

---
