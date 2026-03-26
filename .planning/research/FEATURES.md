# Feature Landscape: Branch Cleanup & Monorepo Stabilization

**Domain:** Git branch management, monorepo stabilization, post-merge validation
**Researched:** 2026-03-26
**Overall confidence:** HIGH (based on direct repo analysis + established git best practices)

## Repo State at Research Time

| Metric | Value |
|--------|-------|
| Total branches (local + remote) | 30 |
| Remote branches (excluding main) | 28 |
| Unmerged commits (feat/init-monorepo -> main) | 54 (51 unique via `git cherry`) |
| Commits on main not in feat/init-monorepo | 37 |
| Merge conflicts (dry-run) | 9 files |
| Files changed between branches | 244 (6,092 insertions, 15,054 deletions) |
| Worktree branches merged into feat/init-monorepo | All 13 (8 base + 5 ron-approved variants) |
| Feature branches already merged into main | 11 of 12 |
| Feature branches with unique unmerged work | 1 (fix/v117-phase-d-r2: 1 commit) |

## Table Stakes

Features/steps that are non-negotiable. Skipping any of these risks data loss, broken builds, or an incomplete cleanup.

| # | Feature/Step | Why Required | Risk If Skipped | Complexity |
|---|-------------|--------------|-----------------|------------|
| T1 | **Pre-merge backup tags** | Create lightweight tags on main (`pre-cleanup-main`) and feat/init-monorepo (`pre-cleanup-feat`) before any operations. Recovery points if merge goes wrong. | Lose recovery point; must untangle from ambiguous state if merge needs to be retried | Low |
| T2 | **Branch audit report** | For every remote branch, record: last commit date, author, merge status (ancestor of main? ancestor of feat/init-monorepo?), unique commit count via `git cherry`. Already done during research -- all worktree branches are ancestors of feat/init-monorepo, all feature branches except fix/v117-phase-d-r2 are ancestors of main. | Delete a branch with unmerged work. The worktree branches LOOK merged but only via feat/init-monorepo, not directly into main yet | Med |
| T3 | **Merge feat/init-monorepo into main** | This is the primary integration branch with 51 unique commits (v207-v225 work). Use `git merge --no-ff --no-commit` to preview before finalizing. | Lose 51 commits of active development including UX fixes, E2E updates, DA2 batches, presence fixes | High |
| T4 | **Resolve 9 merge conflicts correctly** | 9 files conflict: BOARD.md, metrics.ts, Sidebar.tsx, 3 metrics chart components, guardian-accuracy.json, 2 E2E specs. Each needs manual resolution understanding both sides. | Silent data loss in resolved files. Taking the wrong side of a conflict means features disappear or regress | High |
| T5 | **pnpm-lock.yaml regeneration** | After merge, if lockfile has conflicts, delete it and run `pnpm install` to regenerate. Never manually merge lockfiles -- the format is deterministic output from the dependency manifest. | Corrupted dependency tree, phantom packages, build failures that are hard to diagnose | Low |
| T6 | **Build validation (`pnpm build`)** | TypeScript compilation via Turborepo across all packages (api, web, db, types, ui, config). Must pass with zero errors. | Ship broken code to main. TypeScript errors compound -- one missed type breaks downstream consumers | Med |
| T7 | **Unit test validation (`pnpm test`)** | Run Vitest unit tests across all packages. Must pass with zero failures. | Merged code has regressions that only surface in production or during E2E | Low |
| T8 | **Lint validation (`pnpm lint`)** | Biome lint across all packages. Catches import ordering issues and style violations introduced by merge. | Code quality regression on main; future PRs inherit lint debt that blocks CI | Low |
| T9 | **Type check validation (`pnpm typecheck`)** | Separate from build -- catches type errors in test files and non-built code. | Type errors in test files go undetected; tests may pass but be testing the wrong contract | Low |
| T10 | **Delete fully-merged remote branches** | Remove all 26+ remote branches confirmed fully merged after the feat/init-monorepo merge completes. Must happen AFTER the merge, not before. | Branch sprawl persists. 28 stale branches create confusion about what is active vs abandoned | Low |
| T11 | **Preserve or document unmerged work** | fix/v117-phase-d-r2 has 1 unique commit (encryption key fix + connection-config schema changes). Either cherry-pick or document as intentionally deferred. | Lose a commit with encryption and schema changes -- potentially important for security | Low |
| T12 | **Push clean main to origin** | After all validations pass, push the merged main to origin. | Local-only cleanup is worthless; collaborators and CI still see the old diverged state | Low |

## Differentiators

Best practices that prevent future mess. Not strictly required for this cleanup, but strongly recommended.

| # | Feature/Step | Value Proposition | Complexity |
|---|-------------|-------------------|------------|
| D1 | **Enable `git rerere` before merge** | Records conflict resolutions so if the merge attempt fails validation (build/test broken), you can abort, fix the issue, re-merge, and rerere auto-applies the same conflict resolutions. Zero-cost safety net. | Low |
| D2 | **E2E test validation** | Run Playwright E2E tests against a running instance (requires `docker compose up -d` + api + web). Catches integration bugs unit tests miss. With 244 changed files, this is high-value validation. | High |
| D3 | **GitHub branch protection on main** | Require PR for merges, require status checks (build + test), prevent force-push, prevent deletion. Prevents future direct pushes that caused the current divergence. | Low |
| D4 | **Auto-delete head branches after merge** | GitHub setting: "Automatically delete head branches" after PR merge. Prevents branch accumulation going forward. | Low |
| D5 | **Conflict resolution documentation** | For each of the 9 conflict files, document which side was chosen and why, in the merge commit message. Future debugging can trace regressions to specific resolution decisions. | Med |
| D6 | **Post-cleanup baseline snapshot** | After cleanup, record: commit SHA of clean main, build time, test count/pass rate, lint error count. Store in `.planning/` as the known-good state. | Low |
| D7 | **Enable `fetch.prune` globally** | Automatic cleanup of stale remote-tracking refs on every fetch. Prevents future accumulation of ghost refs for deleted branches. | Low |
| D8 | **Branch naming convention enforcement** | Define allowed patterns (e.g., `feat/*`, `fix/*`, `chore/*`) via GitHub rulesets. Block ad-hoc patterns like `worktree/*` and `develop` from recurring. | Low |

## Anti-Features

Things to deliberately NOT do during this cleanup. Each is a common mistake.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|-------------|-----------|-------------------|
| A1 | **Do NOT rebase feat/init-monorepo onto main** | Rewriting 54 commits of shared history violates PROJECT.md constraints ("No force-pushing to main. Merge only -- preserve full history"). The branch contains 10+ merge commits from worktree branches -- rebase would replay each, hitting conflicts at every merge commit. | Use `git merge --no-ff` to integrate. The merge commit preserves both histories intact. |
| A2 | **Do NOT squash-merge feat/init-monorepo** | Squashing 54 commits into 1 loses granular history (which version introduced which change). Makes `git bisect` useless across the entire merge range. | Merge with full history. Each commit (v207-v225) stays individually addressable. |
| A3 | **Do NOT manually edit pnpm-lock.yaml** | The lockfile is deterministic output from the dependency manifest. Manual edits create inconsistencies between lockfile and actual node_modules. In pnpm v9+, the lockfile recursively lists every peerDependency, amplifying merge conflicts by orders of magnitude. | Delete lockfile, run `pnpm install`, commit the regenerated result. |
| A4 | **Do NOT delete branches before verifying the merge** | If you delete feat/init-monorepo before merging, the 51 unique commits become unreachable (garbage collected after ~30 days). Same risk for worktree branches that are only reachable through feat/init-monorepo. | Merge first, verify build/test, THEN delete branches. |
| A5 | **Do NOT fix code during conflict resolution** | Mixing "resolve conflict" with "fix bug" or "improve code" in the same merge commit makes it impossible to distinguish merge decisions from intentional changes. Breaks `git blame` attribution. | Resolve conflicts minimally -- pick one side or combine both. Fix code in separate, subsequent commits. |
| A6 | **Do NOT run cleanup on a dirty working tree** | Uncommitted changes interact with merge operations unpredictably. Stashed changes can conflict with the merge. `git merge` will refuse to start if working tree is dirty in affected files. | Commit or stash all work first. Verify `git status` is clean before starting. |
| A7 | **Do NOT batch-delete remote branches with an unsupervised wildcard** | A bug in the branch-matching pattern could delete branches you intended to keep. `git push origin --delete` is immediate and not easily reversible for remote branches. | Generate the deletion list, review it manually, then execute. Delete one category at a time (worktree/*, then feat/*, etc.). |
| A8 | **Do NOT attempt CI/CD pipeline setup during cleanup** | Per PROJECT.md, CI/CD is explicitly out of scope. Mixing infrastructure setup with branch cleanup creates coupling and rollback complexity. | Stabilize main first. CI/CD is a subsequent milestone. |
| A9 | **Do NOT restructure or refactor code** | Per PROJECT.md: "only fixing what's broken to pass tests." Refactoring during merge creates ambiguity about what changed due to merge vs. intentional redesign. | Cleanup milestone = clean main. Refactoring = future milestone. |
| A10 | **Do NOT use `--strategy=ours` or `--strategy=theirs` globally** | These strategies silently discard one entire side's changes across all 244 files. | Resolve each conflict individually. Use `--strategy-option` (ours/theirs) only for specific files where one side is clearly superseded. |

## Feature Dependencies

```
T1 (backup tags) ──────────────────────────────────────┐
                                                        v
A6 (clean working tree) ──> T2 (branch audit) ──> T3 (merge feat/init-monorepo)
                                                        │
D1 (enable rerere) ────────────────────────────────────>│
                                                        v
                                               T4 (resolve 9 conflicts)
                                                        │
                                                        v
                                               T5 (regenerate pnpm-lock)
                                                        │
                                                        v
                                         ┌──────────────┼──────────────┐
                                         v              v              v
                                   T6 (build)     T7 (test)     T8 (lint)
                                         │              │              │
                                         v              v              v
                                   T9 (typecheck)  D2 (E2E)    D5 (doc conflicts)
                                         │              │
                                         └──────┬───────┘
                                                v
                                    T11 (handle fix/v117-phase-d-r2)
                                                │
                                                v
                                    T10 (delete merged branches)
                                                │
                                                v
                                    T12 (push clean main to origin)
                                                │
                                                v
                                 ┌──────────────┼──────────────┐
                                 v              v              v
                           D3 (branch     D4 (auto-      D6 (baseline
                            protection)   delete)         snapshot)
```

**Critical path:** D1 -> T1 -> T2 -> T3 -> T4 -> T5 -> T6/T7/T8/T9 (parallel) -> T10 -> T12

**Key dependency insight:** D1 (rerere) MUST be enabled BEFORE T3 (merge) starts, otherwise conflict resolutions are not recorded and cannot be replayed on retry.

## MVP Recommendation

**The cleanup is all-or-nothing.** Unlike product features, you cannot ship a "partial" cleanup. Either main is the single source of truth with all work merged and branches cleaned, or it is not.

### Phase 1: Prepare (before touching anything)
1. **D1** - Enable `git rerere` (5 seconds, massive safety benefit)
2. **D7** - Enable `fetch.prune` (future hygiene)
3. **T1** - Create backup tags on both branches
4. **T2** - Generate/confirm branch audit report (already done during research)
5. **A6** - Verify clean working tree

### Phase 2: Merge (the core operation)
6. **T3** - Merge feat/init-monorepo into main with `--no-commit --no-ff`
7. **T4** - Resolve 9 merge conflicts (with D5 documentation in commit message)
8. **T5** - Regenerate pnpm-lock.yaml if conflicted

### Phase 3: Validate (proves the merge is sound)
9. **T6** - `pnpm build` passes
10. **T9** - `pnpm typecheck` passes
11. **T8** - `pnpm lint` passes
12. **T7** - `pnpm test` passes
13. **D2** - E2E tests pass (if local infra is available)

### Phase 4: Clean (only after all validations pass)
14. **T11** - Handle fix/v117-phase-d-r2 (evaluate, cherry-pick or document)
15. **T10** - Delete all fully-merged remote branches (26+)
16. **T12** - Push clean main to origin
17. **D6** - Record baseline snapshot

### Phase 5: Protect (prevent recurrence)
18. **D3** - Enable branch protection on main
19. **D4** - Enable auto-delete head branches
20. **D8** - Set up branch naming conventions (optional)

### Defer
- Mergiraf setup: For 9 conflicts, manual resolution with VS Code 3-way merge is adequate. Install Mergiraf only if ongoing branch integration workflows are planned.
- CI/CD pipeline: Explicitly out of scope per PROJECT.md.
- Pre-commit hooks (Husky + lint-staged): Good practice but belongs in a "developer experience" milestone, not cleanup.
- Turborepo remote cache: Not needed for cleanup; adds infrastructure complexity.

## Conflict Resolution Strategy by File

Based on the dry-run merge and branch divergence analysis. These are the 9 files that will require manual resolution.

| File | Category | Why It Conflicts | Resolution Strategy |
|------|----------|-----------------|-------------------|
| `BOARD.md` | Documentation | Both branches track pipeline state independently | Take feat/init-monorepo side -- has latest pipeline state through v225 |
| `apps/api/src/routers/metrics.ts` | Backend | feat has +228/-134 (larger rewrite), main has +119/-35 | Take feat's version as base -- more complete rewrite. Cherry-pick any main-only metric additions. |
| `apps/web/src/components/Sidebar.tsx` | Core UI | main has +241/-114 (full redesign), feat has +28/-20 (minor fixes) | Take main's version -- has the full sidebar redesign. Apply feat's minor fixes on top. |
| `MetricsAreaChart.tsx` | Chart component | Both branches modified chart rendering | Manual merge -- main has v200 Grafana-quality time axis fixes, feat has UX audit batch fixes. Must preserve both. |
| `MetricsTimeSeriesPanel.tsx` | Chart component | main: 219 lines, feat: 295 lines | Likely take feat -- more complete implementation. Verify main's v200 time axis improvements are present. |
| `ResourceSparkline.tsx` | Chart component | main: 142 lines, feat: 137 lines | Diff carefully -- nearly identical. Likely formatting + minor logic differences. |
| `guardian-accuracy.json` | Pipeline artifact | Both branches updated pipeline evidence data | Take feat/init-monorepo -- dated 2026-03-17, more recent pipeline data |
| `optimistic-ui.spec.ts` | E2E test | main: 99 lines, feat: 93 lines | Take feat -- has latest E2E selector updates from v224-v225 |
| `phase3-v194-animation.spec.ts` | E2E test | main: 226 lines, feat: 169 lines | Take main -- has more Phase 3 animation tests. Verify feat's adjustments are compatible. |

**Highest-risk conflicts:** The 3 metrics chart components (MetricsAreaChart, MetricsTimeSeriesPanel, ResourceSparkline). Main has v200 Grafana-quality chart fixes while feat has UX audit batch fixes. These require line-by-line review to preserve both improvements.

## Sources

- Direct repository analysis via git commands (branch status, merge-base, cherry, dry-run merge)
- [pnpm: Working with Git (lockfile strategies)](https://pnpm.io/git)
- [pnpm: Git Branch Lockfiles](https://pnpm.io/git_branch_lockfiles)
- [pnpm lockfile merge conflicts handling (DEV Community)](https://dev.to/francecil/lockfile-merge-conflicts-how-to-handle-it-correctly-588b)
- [Julia Evans: Dealing with diverged git branches](https://jvns.ca/blog/2024/02/01/dealing-with-diverged-git-branches/)
- [GitHub Docs: Managing automatic deletion of branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches)
- [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Docs: Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [Graphite: Testing strategies for monorepos](https://graphite.com/guides/testing-strategies-for-monorepos)
- [Graphite: Branching strategies for monorepo development](https://graphite.com/guides/branching-strategies-monorepo)
- [Pull Panda: Git branch cleanup strategies](https://pullpanda.io/blog/deleting-feature-branches-cleanup-strategies)
- [CodePulse: Git Branch Aging Report](https://codepulsehq.com/guides/git-branch-aging-report)
