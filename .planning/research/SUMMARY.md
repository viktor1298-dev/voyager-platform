# Project Research Summary

**Project:** Voyager Platform — Git Branch Cleanup & Monorepo Stabilization
**Domain:** Git branch consolidation, diverged-monorepo merge, post-merge validation
**Researched:** 2026-03-26
**Confidence:** HIGH

## Executive Summary

The Voyager Platform monorepo has accumulated 28 remote branches over months of parallel agent development. The primary integration branch (`feat/init-monorepo`) diverged 54 commits from `main` at merge-base `58a8407` (v202, 2026-03-14), while `main` simultaneously advanced 37 commits with Phase 4-6 features (sidebar polish, per-node metrics backend, IA redesign). The divergence cannot be reconciled via rebase — the branch contains 10+ merge commits from agent worktrees (`worktree/ron`, `worktree/dima`, `worktree/shiri`), rebasing would replay all 54 commits with per-commit conflict resolution, and PROJECT.md explicitly forbids force-pushing to `main`. The only correct strategy is `git merge --no-ff --no-commit`, which produces a staged resolution state reviewable before any commit is created. An actual dry-run confirms exactly 9 conflict files with 30 total conflict markers — a moderate merge, not catastrophic.

Of the 27 remaining remote branches beyond `feat/init-monorepo`, only `fix/v117-phase-d-r2` holds a unique commit not already in `main` or `feat/init-monorepo`. That single commit (`eaa87c6`) was superseded by `fb5bb3c` (v117-r3) already on `main`. This means cleanup after the merge is safe: all 26 other branches delete cleanly in three ordered batches once the merge is committed, verified, and pushed. The end state is a single-origin-branch repository (`origin/main` only).

The primary risks are not the merge mechanics but the semantic content of the merged files. Three specific hazards require active prevention: (1) the `nodeMetricsHistory` feature exists only on `main` and will be silently lost if `feat/init-monorepo`'s metrics files are accepted wholesale; (2) `apps/api/src/server.ts` will auto-merge with zero conflict markers but carries logically incompatible changes from both sides (Set-Cookie fix vs. health endpoint vs. viewer user bootstrap); (3) the Motion v12 import convention diverges between branches (`m` alias on `main` vs. `motion` namespace on `feat/init-monorepo`) across at least 10 component files and must be normalized post-merge. Budget 2-3 hours for careful manual resolution of the three heavy-conflict files plus post-merge normalization passes before running the validation gate.

---

## Key Findings

### Recommended Stack (Tools)

The cleanup requires no new tooling beyond what is already available. Built-in git commands handle all operations at this scale. The one optional tool — Mergiraf (AST-aware TypeScript/TSX merge driver) — is evaluated and deferred: for 9 files in a one-time merge, VS Code's built-in 3-way merge editor is adequate and has no setup cost. The recommended tools are:

- `git merge --no-ff --no-commit`: Forces staged conflict resolution before any commit is created — the core safety mechanism
- `git rerere`: Records conflict resolutions so the merge can be aborted and retried without re-resolving; MUST be enabled before the merge starts or it provides no benefit
- `git merge-tree` (already used): Dry-run confirmed 9 conflicts empirically; use `git merge-base --is-ancestor` post-merge to verify branch containment
- `pnpm build / typecheck / lint / test`: The four-gate validation suite; all must pass before committing the merge
- Built-in `git branch --merged` + `git push origin --delete`: Sufficient for 27 branches; no external tooling needed

### Expected Steps (Features)

Research produced a prioritized feature list using the table-stakes / differentiators / anti-features taxonomy:

**Must have (table stakes — non-negotiable):**
- T1: Create backup tags (`pre-merge-snapshot` on `main`, `pre-cleanup-feat` on `feat/init-monorepo`) — recovery points before any mutation
- T2: Branch audit confirming every branch's containment status (pre-computed in research; create the audit files)
- T3: Merge `feat/init-monorepo` into `main` using `--no-ff --no-commit`
- T4: Manually resolve all 9 conflict files following the four-tier risk ordering
- T5: Regenerate `pnpm-lock.yaml` if it conflicts (delete and reinstall — never manually edit)
- T6-T9: Full validation gate — build, typecheck, lint, unit tests — all passing before commit
- T10: Delete 26 fully-merged remote branches in three ordered batches
- T11: Evaluate and document `fix/v117-phase-d-r2` before deletion (1 superseded commit)
- T12: Push clean `main` to origin

**Should have (differentiators — strongly recommended):**
- D1: Enable `git rerere` before the merge starts (zero-cost, enables safe retry)
- D3: Enable GitHub branch protection on `main` (PR requirement, status checks, no force-push)
- D4: Enable auto-delete head branches after merge (prevents future accumulation)
- D5: Document conflict resolution decisions in the merge commit message per file
- D6: Record post-cleanup baseline snapshot in `.planning/`
- D7: Enable `fetch.prune` globally for ongoing hygiene

**Defer to post-cleanup milestones:**
- E2E validation against a running instance (D2) — high value but requires running infra, not a merge blocker
- Mergiraf setup — overkill for a one-time 9-file merge
- CI/CD pipeline — explicitly out of scope per PROJECT.md
- Branch naming convention enforcement — a "developer experience" milestone, not cleanup
- Turborepo remote cache — separate infrastructure concern

**Anti-features (never do):**
- Rebase `feat/init-monorepo` onto `main` — rewrites 54 shared commits, replay would hit conflicts at every merge commit, violates PROJECT.md
- Squash-merge — loses 54 commits of granular history, breaks `git bisect` across the entire range
- Manually edit `pnpm-lock.yaml` — deterministic output, always regenerate
- Delete any branch before the merge is committed and pushed
- Mix code fixes or refactors with conflict resolution in the same commit
- Accept `--ours`/`--theirs` globally — silently discards an entire branch's features across 244 files

### Architecture Approach

The cleanup follows a strict three-phase sequential pipeline with hard gates between phases. No phase may begin until the previous is fully complete and verified. Phase 1 (Audit & Protect) is purely read-only. Phase 2 (The Big Merge) resolves conflicts in a four-tier risk-ordered sequence. Phase 3 (Branch Cleanup) is the only destructive operation and is conditional on Phase 2 being pushed to origin.

**Major components:**

1. **Phase 1: Audit & Protect** — Tag both branch tips, record `branch-audit.txt` and `branch-tips.txt` with all 27 branch SHA hashes, confirm branch containment via `git merge-base --is-ancestor`, enable rerere. No file deletions, no merges, no pushes.

2. **Phase 2: The Big Merge** — Execute `git merge --no-commit --no-ff origin/feat/init-monorepo`, resolve 9 conflict files in four tiers, run post-merge normalization (Motion import convention, `init.sql` table count check, evil-merge review of auto-resolved files), validate with the full four-gate suite, commit with documented resolution rationale, smoke test locally, push.

3. **Phase 3: Branch Cleanup** — Verify `feat/init-monorepo` is an ancestor of `main`, then delete in three batches: Batch 1 (22 fully-merged branches, zero risk), Batch 2 (3 post-merge-redundant branches including the source branch itself), Batch 3 (1 superseded branch with documentation). Prune local tracking refs. Final build and test.

**Conflict resolution tier structure (within Phase 2):**

| Tier | Files | Strategy | Rationale |
|------|-------|----------|-----------|
| 1 | `BOARD.md`, `guardian-accuracy.json` | Accept `--theirs` (feat/init-monorepo) | Strictly more recent pipeline state; no semantic merge needed |
| 2 | `optimistic-ui.spec.ts`, `phase3-v194-animation.spec.ts` | Accept `--theirs` | E2E selectors match the incoming UI from feat/init-monorepo |
| 3 | `MetricsTimeSeriesPanel.tsx`, `ResourceSparkline.tsx` | Manual — 1 marker each | Additive changes from both sides; combine both improvements |
| 4 | `MetricsAreaChart.tsx`, `Sidebar.tsx`, `metrics.ts` | Manual — 5, 5, 9 markers | Both sides contributed significant features; allocate most time here |

**Dependency chain:** D1 (rerere) must precede T3 (merge); T3 must precede T4 (conflicts); T4 must precede T6-T9 (validation); T6-T9 must all pass before T12 (push); T12 must precede T10 (branch cleanup).

### Critical Pitfalls

1. **nodeMetricsHistory schema divergence (CRITICAL)** — `feat/init-monorepo` is missing the entire `nodeMetricsHistory` feature: DB table in `init.sql`, Drizzle schema export in `packages/db/src/schema/`, tRPC `nodeTimeSeries` procedure in `metrics.ts`, and the Drizzle schema file `node-metrics-history.ts`. Accepting feat's metrics files or DB package wholesale silently deletes a complete Phase 5 feature. Build and typecheck will NOT catch this — the error appears only at runtime as `relation "node_metrics_history" does not exist` when the metrics collector runs. Prevention: manually merge `metrics.ts` preserving both the Phase 5 procedures and feat's RBAC/timeline fixes; keep `node-metrics-history.ts`; verify `init.sql` has 33 tables (not 32); verify `metrics-history-collector.ts` still imports the schema post-merge.

2. **Evil merge in auto-resolved files (CRITICAL)** — `apps/api/src/server.ts` and `ClusterHealthWidget.tsx` will auto-merge with zero conflict markers, but carry logically incompatible changes. `main` added a `/health/metrics-collector` endpoint; `feat/init-monorepo` removed it, added `ensureViewerUser()`, and fixed the Set-Cookie header for multi-cookie logout. Silently dropping the Set-Cookie fix causes a known logout regression. Prevention: after the merge completes, manually review all 11 doubly-modified files even when git reports "Auto-merging" with no conflict markers.

3. **Motion import convention split (HIGH)** — At least 10 components diverge: `main` uses `m` (tree-shaking alias from `motion/react`), `feat/init-monorepo` uses `motion` (full namespace). Mixed state compiles only if both imports are present everywhere, creating inconsistency and potential runtime failures. Prevention: post-merge, choose `motion` globally (feat/init-monorepo's convention, more readable, standard documented API), then batch-replace all `{ m }` imports and `<m.` JSX tags. Verify with `pnpm build`.

4. **`init.sql` table count mismatch breaks runtime, not build (HIGH)** — `pnpm build` and `pnpm typecheck` validate against Drizzle schema files in `packages/db/`, not the SQL init script. If `init.sql` ends up with 32 tables (feat's version) while Drizzle has the 33rd table exported, everything compiles but crashes at runtime when the metrics collector queries `node_metrics_history`. Prevention: after conflict resolution, count `CREATE TABLE` statements in `init.sql` and verify the count matches `pgTable()` call count in `packages/db/src/schema/`.

5. **Premature branch deletion (HIGH)** — `worktree/ron` (50 commits) and `worktree/dima` (45 commits) are pure subsets of `feat/init-monorepo` — verified with 0 unique commits. However, they only become redundant AFTER `feat/init-monorepo` merges into `main`. Deleting them before the Phase 2 merge leaves those commits reachable only through `feat/init-monorepo`, which hasn't merged yet. Prevention: Batch 2 of cleanup (which includes `worktree/ron`, `worktree/dima`, and `feat/init-monorepo` itself) is gated on `git merge-base --is-ancestor origin/feat/init-monorepo main && echo "MERGED"`.

---

## Implications for Roadmap

Based on combined research, the roadmap follows the three-phase pipeline directly. All phases are strictly sequential with no parallelism between phases.

### Phase 1: Audit & Protect
**Rationale:** Must complete before any mutation. The branch containment analysis is pre-computed (in ARCHITECTURE.md), but the safety artifacts — tags, branch tip records — must be created before anything else. Phase 1 is the only phase where failure has no consequences: all operations are read-only.
**Delivers:** `pre-merge-snapshot` tag on `main`, `pre-cleanup-feat` tag on `feat/init-monorepo`, `branch-audit.txt`, `branch-tips.txt` (SHA for all 27 remote branches), `git rerere` enabled, `fetch.prune` configured, working tree confirmed clean
**Addresses:** T1, T2, D1, D7 from the features list
**Avoids:** Pitfall 6 (premature deletion without containment proof), Pitfall 9 (no rerere forces complete re-resolution on retry), Pitfall 12 (git worktree remnants interfering with install)
**Estimated time:** 5-10 minutes

### Phase 2: The Big Merge
**Rationale:** The core operation. Cannot be parallelized or split. The four-tier conflict resolution ordering (Tier 1 → Tier 2 → Tier 3 → Tier 4) minimizes risk by building confidence on safe files before tackling the three heavy conflicts. Post-merge normalization (Motion convention, `init.sql` count check, evil-merge file review) runs inside this phase because defects must be caught before the validation gate, not after.
**Delivers:** A single merged `main` containing all 91 commits (37 Phase 4-6 + 54 v207-v225), zero conflict markers, Motion imports normalized to `motion`, `init.sql` verified at 33 tables, all four validation gates passing (typecheck, lint, build, test), merge committed with documented resolution rationale, smoke-tested locally, pushed to origin
**Addresses:** T3, T4, T5, T6-T9, T12; implements all four tiers from ARCHITECTURE.md
**Avoids:** Pitfall 1 (nodeMetricsHistory loss), Pitfall 2 (evil merge), Pitfall 3 (Motion split), Pitfall 7 (init.sql count), Pitfall 8 (wholesale --ours/--theirs on complex files)
**Estimated time:** 60-120 minutes (30-60 min for Tier 4 manual merges + normalization passes + validation runtime)

Sub-steps within Phase 2 (must follow this order):
1. Pre-merge safety checks: clean working tree, on `main`, merge-base is `58a8407`
2. `git merge --no-commit --no-ff origin/feat/init-monorepo`
3. Tier 1 conflicts: `git checkout --theirs BOARD.md pipeline-evidence/guardian-accuracy.json && git add`
4. Tier 2 conflicts: `git checkout --theirs tests/e2e/optimistic-ui.spec.ts tests/e2e/phase3-v194-animation.spec.ts && git add`
5. Tier 3 conflicts: Manual edit — `MetricsTimeSeriesPanel.tsx`, `ResourceSparkline.tsx`; combine both sides' additive changes
6. Tier 4 conflicts: Manual edit — `MetricsAreaChart.tsx`, `Sidebar.tsx`, `metrics.ts`; use `main` as structural base for `metrics.ts` and `Sidebar.tsx`, layer feat's refinements on top
7. Post-merge normalization: batch-replace `m` → `motion` imports; count `init.sql` tables; manually review `server.ts` and `ClusterHealthWidget.tsx` for evil-merge
8. Verify zero remaining conflict markers: `grep -rn "<<<<<<< "` must return nothing
9. `pnpm install --frozen-lockfile` (or regenerate lockfile if it conflicted)
10. Validation gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` — all must pass
11. Commit the merge with conflict resolution documentation in the message
12. Smoke test: API boots (`curl localhost:4000/health`), web boots (`curl localhost:3000` → 200)
13. `git push origin main`

### Phase 3: Branch Cleanup
**Rationale:** All destructive remote operations. Only executes after Phase 2 merge is confirmed live on `origin/main`. The three-batch ordering ensures zero-risk deletions (Batch 1: 22 already-merged branches) happen before merge-dependent deletions (Batch 2: 3 branches), with the evaluated superseded commit documented and deleted last (Batch 3: 1 branch).
**Delivers:** `git branch -r` shows only `origin/HEAD` and `origin/main` (2 lines). All 27 stale branches removed. Local tracking refs pruned. Final build and test re-run to confirm clean state.
**Addresses:** T10, T11
**Avoids:** Pitfall 6 (containment verified before each batch), Pitfall 10 (pipeline artifact files handled quickly), Pitfall 13 (local tracking refs pruned at end)
**Estimated time:** 10-15 minutes

### Phase 4: Hygiene & Protection
**Rationale:** Prevents recurrence of the 28-branch accumulation pattern. Low effort, high leverage. These do not block the stabilization milestone but should complete in the same session while context is fresh.
**Delivers:** GitHub branch protection on `main` (PR required, status checks required, no force-push, no deletion), auto-delete head branches enabled, post-cleanup baseline snapshot in `.planning/` (clean main SHA, build time, test count), `pre-merge-snapshot` tag documented for 30-day retention then deletion
**Addresses:** D3, D4, D6 from the features list

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** Cannot merge safely without recovery tags and without rerere recording enabled. Snapshot creation is a prerequisite, not a nice-to-have.
- **Phase 3 only after Phase 2 is pushed to origin:** `worktree/ron` and `worktree/dima` are only provably redundant once `feat/init-monorepo` is an ancestor of `main`; this is verified via `git merge-base --is-ancestor` as the guard before Batch 2. If verified locally but not yet pushed, a network failure could leave remote branches deleted with no corresponding merge on `origin/main`.
- **Tier ordering within Phase 2:** Low-risk accept-theirs resolutions (Tiers 1-2) reduce the remaining conflict surface and build resolver confidence before the heavy manual merges begin. `metrics.ts` with 9 markers is saved for last within Tier 4 so all simpler files are already staged.
- **Post-merge normalization inside Phase 2, not Phase 4:** Motion import inconsistency and `init.sql` table count mismatch will cause the validation gate to fail if not fixed first. They are not aesthetic concerns — they affect build correctness and runtime stability respectively.

### Research Flags

**Phases requiring judgment calls during execution (no automated resolution possible):**
- **Phase 2, Tier 4** (`metrics.ts`, `Sidebar.tsx`, `MetricsAreaChart.tsx`): Requires reading and understanding both sides' intent before combining. Allocate 60-90 minutes for these three files. `metrics.ts` (9 markers) is the highest-risk — must preserve Phase 5 `nodeTimeSeries` procedure AND feat's RBAC/timeline fixes simultaneously.
- **Phase 2, evil-merge review** (`server.ts`, `ClusterHealthWidget.tsx`): These files auto-resolve with zero conflict markers but carry the highest semantic risk. Easy to overlook precisely because git reports no conflict. Make this an explicit checklist item.
- **Phase 2, post-merge normalization**: The `m` → `motion` sweep and `init.sql` table count check are not conflict-marker-driven and require deliberate action after resolution feels "complete."

**Phases with standard patterns (low execution risk):**
- Phase 1 (Audit & Protect): All read-only commands; pre-computed branch status in ARCHITECTURE.md; no judgment calls
- Phase 3, Batch 1 (22 branches): All verified at 0 unique commits; deletion is mechanical and scripted
- Phase 4 (Hygiene): GitHub settings UI changes; no code involved

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (tools) | HIGH | All tools are built-in git or existing pnpm commands. Conflict file list from actual `git merge-tree` dry-run on this repo, not estimated. |
| Features (steps) | HIGH | All steps derived from direct repo analysis: `git rev-list`, `git merge-base --is-ancestor`, `git cherry` run against every branch. Branch containment status is empirical. |
| Architecture (order of ops) | HIGH | Three-phase pipeline is the only safe order given branch dependencies. Conflict tier assignments from actual marker counts per file (9, 5, 5, 1, 1, and so on). |
| Pitfalls | HIGH | All five critical pitfalls grounded in direct file analysis (`git diff`, line-count comparisons, schema file inspection). Pitfall 2 (evil merge) is inferred from known git behavior but the specific at-risk files are identified. |
| Per-file conflict resolution | MEDIUM | Tier 1-2 strategies (accept-theirs) are HIGH confidence — those files have unambiguous winners. Tier 3-4 manual merge strategies are based on commit history analysis; actual content may surface nuances that require additional judgment during resolution. |

**Overall confidence:** HIGH

### Gaps to Address

- **`page.tsx` not in the 9-conflict list but high evil-merge risk**: `apps/web/src/app/page.tsx` (654 vs. 889 lines across branches) is NOT in the dry-run conflict list — git will auto-merge it. Given both branches substantially modified the same layout regions (stats bar, cluster cards, health section), it is a high-probability evil-merge target. After Phase 2 commits, run `git diff HEAD^1 HEAD -- apps/web/src/app/page.tsx` and `git diff HEAD^2 HEAD -- apps/web/src/app/page.tsx` to verify the merged result contains both `CompactStatsBar`/`ClusterHealthIndicator`/`NodeMetricsTable` (from `main`) AND the UX audit polish (from feat/init-monorepo).

- **E2E selector validity post-merge**: Budget 1-2 rounds of selector fixes after the merge. Research confirms which selector style to prefer (feat/init-monorepo's role-based locators over text-based), but the specific failures can only be discovered by running Playwright against a live instance. This is not a blocker for the Phase 2 commit, but should complete before declaring stabilization done.

- **`fix/v117-phase-d-r2` final decision**: Research identifies commit `eaa87c6` (encryption key k8s apply, connection-config schemas, lastConnectedAt display) as superseded by `fb5bb3c` (v117-r3) on `main`. Confirm by running `git show eaa87c6` and verifying each change is present in `main`'s current files. Only then delete the branch (Phase 3, Batch 3).

- **`pnpm-lock.yaml` conflict potential**: The dry-run did not flag the lockfile as conflicted, but historically monorepo lockfiles surface merge conflicts during the actual merge that the `--no-commit` dry-run misses. If `pnpm install --frozen-lockfile` fails post-merge, delete the lockfile and run `pnpm install` to regenerate. Never manually edit the lockfile.

---

## Sources

### Primary (HIGH confidence — empirical, direct codebase analysis)
- `git merge-tree --write-tree main origin/feat/init-monorepo` on this repository (2026-03-26) — 9 conflict files, 30 total markers confirmed
- `git rev-list --count`, `git merge-base --is-ancestor`, `git cherry` on all 27 remote branches — containment status of every branch verified
- `git diff main...origin/feat/init-monorepo --stat` — 244 files differing, 6,092 insertions, 15,054 deletions
- Line-count comparisons from `git show`: `page.tsx` (654 vs. 889 lines), `metrics.ts` (+119/-35 main vs. +228/-134 feat), `Sidebar.tsx` (+241/-114 main vs. +28/-20 feat)
- Schema analysis: `init.sql` table count (33 in main, 32 in feat), Drizzle schema export inspection

### Secondary (HIGH confidence — official documentation)
- [Git merge documentation](https://git-scm.com/docs/git-merge) — `--no-commit`, `--no-ff`, `--abort` flags
- [Git merge-tree documentation](https://git-scm.com/docs/git-merge-tree) — dry-run merge preview
- [Git rerere documentation](https://git-scm.com/docs/git-rerere) — conflict resolution recording and replay
- [Git - Advanced Merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging) — `--ours`/`--theirs` strategy reference, evil merge patterns
- [pnpm: Working with Git](https://pnpm.io/git) — lockfile conflict handling guidance

### Tertiary (MEDIUM confidence — community sources)
- [Julia Evans: Dealing with diverged git branches](https://jvns.ca/blog/2024/02/01/dealing-with-diverged-git-branches/) — divergence patterns and practical merge strategies
- [Atlassian: Merging vs. Rebasing](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) — strategy comparison, merge commit vs. rebase trade-offs
- [Mergiraf](https://mergiraf.org/) — AST-aware TypeScript/TSX merge driver (evaluated, deferred as optional for this one-time merge)
- [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — branch protection configuration for Phase 4

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
