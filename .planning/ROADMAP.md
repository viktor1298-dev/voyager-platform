# Roadmap: Voyager Platform Reset & Stabilization

## Overview

This roadmap takes the Voyager Platform monorepo from a diverged state (54 unmerged commits on feat/init-monorepo, 27 stale remote branches) to a clean single-branch repository where main is the sole source of truth, all meaningful work is merged, the project builds and passes tests, and GitHub protections prevent recurrence. The five phases are strictly sequential -- each phase gates on the previous completing fully.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Safety Net** - Create recovery tags, record branch tips, enable rerere before any mutations
- [ ] **Phase 2: The Big Merge** - Merge 54 commits from feat/init-monorepo into main with conflict resolution and normalization
- [ ] **Phase 3: Validation Gate** - Verify the merged codebase compiles, type-checks, and passes all unit tests
- [ ] **Phase 4: Push & Branch Cleanup** - Push merged main to origin and delete all 27 stale remote branches
- [ ] **Phase 5: GitHub Protection** - Set up branch protection and auto-delete to prevent future branch accumulation

## Phase Details

### Phase 1: Safety Net
**Goal**: Full recovery capability exists before any repository mutation occurs
**Depends on**: Nothing (first phase)
**Requirements**: SAFE-01, SAFE-02, SAFE-03
**Success Criteria** (what must be TRUE):
  1. Tags `pre-merge-snapshot` (on main) and `pre-cleanup-feat` (on feat/init-monorepo) exist and point to correct SHAs
  2. `.planning/branch-tips.txt` contains the SHA hash for every remote branch (all 27+)
  3. `git rerere` is enabled so conflict resolutions are recorded for replay on retry
  4. Running `git tag -l pre-merge*` and `git tag -l pre-cleanup*` shows both recovery tags
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md -- Recovery tags, rerere config, and branch-tips recording

### Phase 2: The Big Merge
**Goal**: All 54 commits from feat/init-monorepo are integrated into main with conflicts resolved, imports normalized, and schema integrity preserved
**Depends on**: Phase 1
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, MERGE-05, MERGE-06
**Success Criteria** (what must be TRUE):
  1. `git log main` shows a merge commit integrating feat/init-monorepo with a descriptive message documenting the resolution
  2. Zero conflict markers remain in the working tree (`grep -rn "<<<<<<< " .` returns nothing)
  3. All Motion imports use the `motion` convention consistently (no mixed `m` / `motion` imports across component files)
  4. `init.sql` contains 33 CREATE TABLE statements (nodeMetricsHistory preserved from main)
  5. Auto-resolved files (server.ts, ClusterHealthWidget.tsx, page.tsx) have been manually reviewed for evil-merge logic errors
**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md -- Execute merge and resolve all 9 conflicting files (Tier 1-4)
- [x] 02-02-PLAN.md -- Evil-merge review, Motion import normalization, schema integrity
- [x] 02-03-PLAN.md -- Validation gate (typecheck + lint + build + test) and merge commit

### Phase 3: Validation Gate
**Goal**: The merged codebase provably compiles and passes all automated checks
**Depends on**: Phase 2
**Requirements**: VALID-01, VALID-02, VALID-03
**Success Criteria** (what must be TRUE):
  1. `pnpm build` exits with code 0 (TypeScript compilation succeeds for all packages)
  2. `pnpm typecheck` exits with code 0 (strict TypeScript checking passes)
  3. `pnpm test` exits with code 0 (all Vitest unit tests pass)
**Plans:** 1 plan

Plans:
- [x] 03-01-PLAN.md -- Full validation gate with Docker (build + typecheck + 128 tests including integration)

### Phase 4: Push & Branch Cleanup
**Goal**: Origin reflects the merged main and all stale branches are removed with no work lost
**Depends on**: Phase 3
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05
**Success Criteria** (what must be TRUE):
  1. `git push origin main` has completed successfully -- origin/main matches local main
  2. `git branch -r` shows only `origin/HEAD` and `origin/main` (all 27 stale branches deleted)
  3. worktree/ron and worktree/dima commits are verified as contained in feat/init-monorepo (via `git merge-base --is-ancestor`) before their branches are deleted
  4. fix/v117-phase-d-r2's unique commit (eaa87c6) is evaluated, documented (cherry-picked or discarded with rationale), before branch deletion
  5. Local stale branches (claude/objective-shockley and others) are cleaned up
**Plans:** 2 plans

Plans:
- [x] 04-01-PLAN.md -- Push main to origin and delete 22 fully-merged remote branches (Batch 1)
- [x] 04-02-PLAN.md -- Verify and delete Batch 2 (feat/init-monorepo, worktree/ron, worktree/dima), document and delete Batch 3 (fix/v117-phase-d-r2), local cleanup

### Phase 5: GitHub Protection
**Goal**: Branch protection rules prevent future divergence and stale branch accumulation
**Depends on**: Phase 4
**Requirements**: PROT-01, PROT-02
**Success Criteria** (what must be TRUE):
  1. GitHub branch protection on main requires pull requests (no direct push), prevents force push, and prevents branch deletion
  2. GitHub repository setting "Automatically delete head branches" is enabled -- merged PR branches are cleaned up automatically
**Plans:** 1 plan

Plans:
- [x] 05-01-PLAN.md -- Branch protection rules and auto-delete of merged branches

### Phase 7: Performance Optimization
**Goal**: Chart rendering performs smoothly with 1000+ data points, synchronized crosshair without jank, and debounced resize handling
**Depends on**: None (independent of phases 1-5)
**Requirements**: PERF-01, PERF-02, PERF-03
**Success Criteria** (what must be TRUE):
  1. LTTB downsampling limits chart data points to ~200 for any dataset size
  2. Crosshair synchronization across 4 panels uses throttled shared state
  3. ResponsiveContainer resizes are debounced
  4. `pnpm build` passes with 0 errors
**Plans:** 1 plan

Plans:
- [x] 07-01-PLAN.md -- LTTB downsampling, crosshair sync, debounced resize

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safety Net | 1/1 | Complete | 2026-03-26 |
| 2. The Big Merge | 3/3 | Complete | 2026-03-26 |
| 3. Validation Gate | 1/1 | Complete | 2026-03-26 |
| 4. Push & Branch Cleanup | 2/2 | Complete | 2026-03-26 |
| 5. GitHub Protection | 1/1 | Complete | 2026-03-26 |
| 7. Performance Optimization | 1/1 | Complete | 2026-03-28 |
