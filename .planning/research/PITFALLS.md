# Domain Pitfalls: Diverged-Branch Merge & Monorepo Stabilization

**Domain:** Git branch cleanup for a Next.js/Fastify/tRPC monorepo with 54-commit divergence
**Researched:** 2026-03-26
**Overall confidence:** HIGH (based on direct codebase analysis, not just web research)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or broken builds requiring hours to debug.

---

### Pitfall 1: Schema Divergence -- `nodeMetricsHistory` Feature Conflict

**What goes wrong:** Main has a complete `nodeMetricsHistory` feature (DB table in `init.sql`, Drizzle schema in `packages/db`, tRPC `nodeTimeSeries` route in `metrics.ts`, `NodeMetricsTable` component, `metrics-history-collector` job importing it). The `feat/init-monorepo` branch has **none** of this -- the schema file is deleted, the DB table is absent from `init.sql`, the metrics router lacks the `nodeTimeSeries` procedure, and the component does not exist. Accepting either side wholesale breaks the other side's code.

**Why it happens:** This feature was developed on main (Phase 5, commits `ccba9a2` through `af8a459`) via a separate feature branch (`feat/phase5-metrics-backend`) that merged to main but was never backported to `feat/init-monorepo`. Meanwhile, `feat/init-monorepo` continued UX audit work that modified the same metrics router file for unrelated reasons.

**Consequences:**
- If you accept feat/init-monorepo's `metrics.ts` (which lacks `nodeTimeSeries`): main loses the per-node metrics feature, `NodeMetricsTable` component has dead imports, `metrics-history-collector` crashes on missing schema export
- If you accept main's `metrics.ts` (which has `nodeTimeSeries`): you lose feat/init-monorepo's UX audit changes to the same file
- The Drizzle schema `packages/db/src/schema/index.ts` is a direct conflict: main exports `nodeMetricsHistory`, feat/init-monorepo does not even have the file
- The `charts/voyager/sql/init.sql` has 33 tables (main) vs 32 tables (feat) -- forgetting the SQL table means runtime crashes when the collector or tRPC route queries it

**Warning signs:**
- `pnpm build` fails with "Cannot find module './node-metrics-history.js'" or "nodeMetricsHistory is not exported"
- tRPC client TypeScript errors about missing `nodeTimeSeries` procedure
- Runtime crash: `relation "node_metrics_history" does not exist`

**Prevention:**
1. Before merging, create a checklist of features unique to each branch by diffing the file lists
2. For `metrics.ts`: merge both branches' changes manually -- keep the `nodeTimeSeries` procedure AND the UX audit changes
3. For `packages/db/src/schema/index.ts`: add the `nodeMetricsHistory` export line back
4. For `packages/db/src/schema/node-metrics-history.ts`: keep the file (do not accept feat/init-monorepo's deletion)
5. For `charts/voyager/sql/init.sql`: ensure the `CREATE TABLE node_metrics_history` block is present
6. For `apps/api/src/jobs/metrics-history-collector.ts`: verify it still imports `nodeMetricsHistory` from `@voyager/db`

**Recovery plan:**
- If caught post-merge: restore the node-metrics-history schema file from main's pre-merge state (`git show HEAD~1:packages/db/src/schema/node-metrics-history.ts`), add the export to schema/index.ts, add the table to init.sql, and fix the metrics router
- Run `pnpm typecheck` to verify all import chains resolve

---

### Pitfall 2: Semantic Merge Conflict -- Git Resolves Text But Breaks Logic

**What goes wrong:** Git's 3-way merge operates on text lines, not code semantics. Two branches can modify the same file in non-overlapping regions, producing a clean merge with zero textual conflicts, but the result is logically broken. This is called an "evil merge."

**Why it happens:** In this codebase, `apps/api/src/server.ts` is modified in both branches. Main added a `/health/metrics-collector` endpoint and `nodeMetricsHistory` imports. `feat/init-monorepo` added `ensureViewerUser()`, fixed Set-Cookie header forwarding for multi-cookie logout, and removed the `/health/metrics-collector` endpoint. Git may auto-merge these as non-overlapping hunks, but the resulting file could have conflicting import statements or duplicate/missing route registrations.

**Consequences:**
- Server starts but silently misses routes or has duplicate route registrations
- Auth changes (Set-Cookie fix) get silently dropped if the conflict resolution picks main's version of that block
- Build passes but runtime behavior is wrong -- hardest class of bugs to detect

**Warning signs:**
- `git merge` completes with "Auto-merging apps/api/src/server.ts" (no conflict marker) but the file has logical issues
- Tests pass because E2E tests may not exercise the specific broken code path
- Users report 401 errors on logout (the Set-Cookie fix was the exact fix for multi-cookie logout)

**Prevention:**
1. After merge, manually review EVERY auto-merged file that was modified in both branches. The 11 files are:
   - `apps/api/src/routers/metrics.ts`
   - `apps/api/src/server.ts`
   - `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx`
   - `apps/web/src/components/metrics/MetricsAreaChart.tsx`
   - `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx`
   - `apps/web/src/components/metrics/ResourceSparkline.tsx`
   - `apps/web/src/components/Sidebar.tsx`
   - `BOARD.md`
   - `tests/e2e/optimistic-ui.spec.ts`
   - `tests/e2e/phase3-v194-animation.spec.ts`
   - `pipeline-evidence/guardian-accuracy.json`
2. Use `git diff HEAD~1 -- <file>` after merge to review the combined result
3. Run `pnpm typecheck` immediately -- it catches many semantic issues in tRPC/TypeScript projects
4. Run a basic smoke test (server starts, login works, key pages load) before declaring merge complete

**Recovery plan:**
- `git log --diff-filter=M -p HEAD -- <file>` to see what the merge commit actually did to each file
- Compare against both parent commits: `git diff HEAD^1 HEAD -- <file>` and `git diff HEAD^2 HEAD -- <file>`
- If broken: create a follow-up fix commit with the correct file content

---

### Pitfall 3: Motion API Divergence (`m` vs `motion` imports)

**What goes wrong:** Main uses `m` (the tree-shakeable alias) from `motion/react` across all components, while `feat/init-monorepo` uses `motion` (the full namespace). These are functionally equivalent but syntactically incompatible. A merge that mixes them creates a codebase where some components use `<m.div>` and others use `<motion.div>`, and if any component uses `m` without importing it, the build breaks.

**Why it happens:** The branches independently made decisions about which Motion v12 API to use. Main adopted `m` for tree-shaking; feat/init-monorepo stayed with `motion` for clarity. At least 10 component files have this divergence in the diff: Sidebar, AppLayout, ClusterHealthWidget, MetricsAreaChart, MetricsTimeSeriesPanel, ResourceSparkline, and others.

**Consequences:**
- If you accept feat/init-monorepo's `motion` imports everywhere: clean, but any main-only components still using `<m.div>` JSX crash at build time with "Property 'm' does not exist"
- If you accept main's `m` imports: feat/init-monorepo components using `<motion.div>` JSX crash
- Mixed state compiles if both `m` and `motion` are imported, but creates inconsistency

**Warning signs:**
- `pnpm build` errors: "Cannot find name 'm'" or "Property 'div' does not exist on type..."
- Components render as plain `<div>` without animations (if fallback to HTML element name)

**Prevention:**
1. Choose ONE convention and apply it globally. Recommendation: use `motion` (feat/init-monorepo's convention) because it is more readable and the standard documented API. The `m` alias is an optimization only needed for large bundles.
2. After merge, run a global find-and-replace: all `import { ... m ...} from 'motion/react'` to use `motion`, and all `<m.` JSX tags to `<motion.`
3. Verify with `pnpm build` -- TypeScript will catch every JSX usage mismatch

**Recovery plan:**
- `grep -rn "from 'motion/react'" apps/web/src/` to find all import sites
- `grep -rn "<m\." apps/web/src/` to find all JSX usages of the old alias
- Batch replace and rebuild

---

### Pitfall 4: E2E Test Selector Massacres

**What goes wrong:** Both branches independently updated Playwright E2E selectors, often for the same UI changes but with different solutions. `feat/init-monorepo` modified 31 E2E test files (massive selector overhaul for card layout, UX audit, DA2 batches). Main modified 4 E2E test files (Phase 5/6 specific). Merging naively produces tests that reference UI elements from one branch's version of the component but run against the other branch's version.

**Why it happens:** The UI redesign (sidebar collapse, card layouts, accordion navigation) happened incrementally in both branches. Selectors evolved differently: feat/init-monorepo moved from `getByText('Alert Rules')` to `getByRole('heading', { name: /alert rules/i })`, removed comments, changed wait strategies. Main kept the older selector patterns for its additions.

**Consequences:**
- E2E tests pass individually on each branch but fail after merge
- False negatives: tests that should catch real bugs pass because they match stale DOM elements
- False positives: tests fail on elements that exist but have different selectors

**Warning signs:**
- E2E failures with "Timeout waiting for selector" or "Expected element to be visible"
- Tests that worked on feat/init-monorepo fail on the merged page.tsx because main's dashboard layout differs
- `clusters-page.spec.ts` is a recurring offender -- it was fixed in feat/init-monorepo 3 separate times (v204, v215, v225)

**Prevention:**
1. Accept feat/init-monorepo's E2E tests as the baseline -- they are 31 files of refined selectors vs main's 4 files of additions
2. For main-only test files (`cluster-tabs-data.spec.ts`, `command-palette-enhanced.spec.ts`): keep them but manually verify their selectors work against feat/init-monorepo's UI components
3. Do NOT run E2E as the merge validation step -- run `pnpm build` and `pnpm typecheck` first. E2E requires a running instance, which requires a clean build
4. After merge, expect 1-2 rounds of selector fixes. Budget time for this.

**Recovery plan:**
- Run E2E in headed mode (`npx playwright test --headed`) to visually see what the test is trying to click
- For each failure: check if the element exists with a different selector using `page.locator()` in the Playwright inspector
- The pattern is almost always: update the selector to match feat/init-monorepo's UI conventions (role-based locators, regex patterns)

---

## Moderate Pitfalls

Mistakes that cause hours of debugging but not full rewrites.

---

### Pitfall 5: Dashboard page.tsx -- 654 vs 889 Lines, Completely Different Compositions

**What goes wrong:** `apps/web/src/app/page.tsx` (the dashboard) is 654 lines on main and 889 lines on feat/init-monorepo. Both branches significantly reworked this file. Main added Phase 5/6 features (CompactStatsBar, ClusterHealthIndicator, node metrics table, IA redesign). Feat/init-monorepo added UX audit fixes (6 dashboard batches), login overhaul, and DA2 polish. The merge of this file will be the most complex single-file conflict.

**What goes wrong specifically:**
- Main's version imports components that only exist on main (`NodeMetricsTable`, `ClusterHealthIndicator`)
- Feat/init-monorepo's version has UX improvements (scrollbar tokens, hydration fixes, density changes) that main lacks
- Both modified the same layout regions (stats bar area, cluster cards, health section)

**Prevention:**
1. Use feat/init-monorepo's `page.tsx` as the base (it is 235 lines longer and represents more cumulative work)
2. Manually port main-only features into it: `CompactStatsBar`, `ClusterHealthIndicator`, node metrics section
3. Verify the `import` block at the top of the file -- missing imports are the #1 build failure cause in large merge files
4. Run `pnpm --filter web dev` and visually verify the dashboard renders

**Recovery plan:**
- If the merged page.tsx crashes: start from feat/init-monorepo's version and `git show main:apps/web/src/app/page.tsx` to manually port features
- Use `pnpm typecheck` to find missing imports before attempting to run

---

### Pitfall 6: Deleting Branches Before Verifying Containment

**What goes wrong:** Deleting 27 remote branches without verifying that every unique commit is reachable from the post-merge main. A branch that appears "fully merged" into `feat/init-monorepo` may have been merged via a squash or cherry-pick, meaning the original commits are orphaned when the branch is deleted.

**Why it happens:** `git branch --merged` checks if the branch tip is an ancestor of HEAD, which is correct for regular merges but misses squash merges. Additionally, the `fix/v117-phase-d-r2` branch has exactly 1 commit (`eaa87c6`) that is NOT in `feat/init-monorepo` or main -- deleting it before evaluating that commit loses that work.

**Verified branch status (from analysis):**
- `worktree/ron`, `worktree/dima`, `worktree/shiri`: fully merged into feat/init-monorepo (0 unique commits)
- `worktree/beni`, `worktree/lior`, `worktree/noam`, `worktree/uri`, `worktree/yuval`: fully merged into main (0 unique commits)
- `worktree/ron-approved-*` (5 branches): fully merged into main (0 unique commits)
- `develop`: fully contained in feat/init-monorepo
- `fix/v117-phase-d-r2`: has 1 unique commit -- `eaa87c6 fix: apply encryption key to k8s, fix connection-config schemas, show lastConnectedAt in detail`

**Consequences:**
- Permanent loss of commit history (reflog expires after 90 days)
- Lost bug fixes that were squash-merged and not trackable by ancestry

**Prevention:**
1. For each branch, run: `git log <branch> --not main --not origin/feat/init-monorepo --oneline`
2. If output is empty: safe to delete
3. If output has commits: evaluate each commit. Is the change already in main/feat via cherry-pick? Check file content, not just commit ancestry
4. Special case: `fix/v117-phase-d-r2` commit `eaa87c6` (encryption key, connection-config schemas) -- evaluate before deletion
5. Document every branch's status in a deletion audit log before running `git push --delete`
6. Safety net: create a local tag on every branch tip before deletion: `git tag archive/<branch-name> origin/<branch-name>`

**Recovery plan:**
- If a branch was deleted prematurely: `git reflog` (within 90 days) can recover the commit hash
- The remote reflog does NOT exist -- once `git push --delete origin <branch>` runs, only local reflogs help
- The archive tags strategy makes recovery trivial: `git checkout archive/<branch-name>`

---

### Pitfall 7: init.sql Divergence Breaks Runtime But Not Build

**What goes wrong:** The Helm chart's `charts/voyager/sql/init.sql` is the database schema source of truth (per the project's iron rules). Main has 33 tables; feat/init-monorepo has 32. The missing table (`node_metrics_history`) causes no build errors -- TypeScript and Drizzle don't validate against the live SQL file. The error only appears at runtime when a tRPC route or background job queries the table.

**Why it happens:** `pnpm build` and `pnpm typecheck` validate TypeScript types against the Drizzle schema definitions in `packages/db/`, not against the SQL init script. If the Drizzle schema includes `nodeMetricsHistory` but the SQL file omits `CREATE TABLE node_metrics_history`, everything compiles but crashes at runtime.

**Warning signs:**
- `pnpm build` succeeds but `pnpm --filter api dev` crashes within 60 seconds when the metrics collector runs
- Error: `error: relation "node_metrics_history" does not exist`
- Only manifests after a fresh `helm install` (existing DBs from before the merge still have the table)

**Prevention:**
1. After merge: diff the `init.sql` table list against the Drizzle schema exports
2. Quick check: `grep 'CREATE TABLE' charts/voyager/sql/init.sql | wc -l` should equal the number of `pgTable()` calls in `packages/db/src/schema/`
3. Run `pnpm db:push` against a fresh local Postgres to validate the Drizzle schema matches reality

**Recovery plan:**
- Add the missing `CREATE TABLE` block to `init.sql` from main's pre-merge version
- For existing databases: run the CREATE TABLE statement directly via `kubectl exec`

---

### Pitfall 8: Accepting "Ours" or "Theirs" Wholesale on Complex Files

**What goes wrong:** When git presents a conflict in a large file, the temptation is to run `git checkout --ours <file>` or `git checkout --theirs <file>` to avoid manual resolution. This silently drops ALL changes from the rejected side, including unrelated fixes embedded in the same file.

**Why it happens:** `apps/api/src/server.ts` has changes from both branches: main added metrics-collector health endpoint + RBAC; feat/init-monorepo added viewer user bootstrap, Set-Cookie header fix for multi-cookie logout, and removed the metrics-collector endpoint. Accepting "theirs" (feat/init-monorepo) drops the health endpoint. Accepting "ours" (main) drops the Set-Cookie fix and viewer user.

**Consequences:**
- Set-Cookie fix dropped: users cannot log out properly (multi-cookie browser issue returns)
- Viewer user dropped: the demo/viewer account bootstrap stops working
- Health endpoint dropped: monitoring loses a health check for the metrics collector

**Prevention:**
1. For every conflicted file: resolve by editing, never by `--ours`/`--theirs`
2. Use a 3-way merge tool (VS Code's built-in merge editor) to see both sides
3. After resolution, `git diff HEAD -- <file>` should show changes from BOTH parents, not just one

**Recovery plan:**
- `git show HEAD^1:<file>` (main's version) and `git show HEAD^2:<file>` (feat's version) to see what was in each
- Create a follow-up commit adding back the dropped changes

---

### Pitfall 9: Not Enabling rerere Before Merge

**What goes wrong:** You resolve 11 conflicted files carefully, then discover the build fails. You need to `git merge --abort` and retry. Without rerere, you must re-resolve all conflicts from scratch.

**Why it happens:** rerere is not enabled by default. Easy to forget during a one-time operation.

**Consequences:** Double the conflict resolution work. Higher chance of introducing resolution errors the second time.

**Prevention:** Run `git config rerere.enabled true` BEFORE starting the merge. Takes 2 seconds.

**Recovery plan:** If you already started without rerere: do NOT abort. Fix the build issue in-place and commit. Starting over is worse than patching.

---

## Minor Pitfalls

Annoyances that waste 30-60 minutes but are easily fixed.

---

### Pitfall 10: Pipeline Evidence and State Files Creating Noise Conflicts

**What goes wrong:** Files in `pipeline-evidence/` and `pipeline-state.json` are modified by both branches (different version numbers, different evidence snapshots). Git treats them as conflicts, but they are build artifacts, not source code. Spending time carefully merging them is wasted effort.

**Prevention:**
1. For `pipeline-evidence/*.json`: accept feat/init-monorepo's version (higher version numbers, more recent evidence)
2. For `BOARD.md`: accept whichever version is more recent, then update manually post-merge
3. For `pipeline-state.json`: delete and regenerate, or accept feat/init-monorepo's version

**Recovery plan:** These files have no impact on build or runtime. Just pick one version and move on.

---

### Pitfall 11: Navigation Config Type Mismatch

**What goes wrong:** Main's `navigation.ts` has `badge?: number` in the `NavItem` type; feat/init-monorepo does not. If a component on main references `navItem.badge`, it will fail TypeScript checks against feat/init-monorepo's type definition.

**Prevention:**
1. Check if any component actually uses `badge` -- search for `\.badge` in components that consume `navItems`
2. If used: keep the `badge` field in the type
3. If unused: remove it (feat/init-monorepo's cleaner type is preferred)

**Recovery plan:** Add `badge?: number` back to `NavItem` type if TypeScript errors appear about missing property.

---

### Pitfall 12: `pnpm install` Failures From Worktree Remnants

**What goes wrong:** If any git worktrees still exist on disk (from the `worktree/ron`, `worktree/dima`, etc. branches), `pnpm install` or `pnpm build` may fail or use the worktree's `node_modules` instead of the main checkout's.

**Prevention:**
1. Run `git worktree list` to find any active worktrees
2. Remove them with `git worktree remove <path>` before starting the merge
3. Run `pnpm install --frozen-lockfile` from the repo root after removing worktrees

**Recovery plan:** `git worktree prune` to clean up stale worktree references. Delete the worktree directories manually if `git worktree remove` fails.

---

### Pitfall 13: Stale Local Branch References After Remote Deletion

**What goes wrong:** After deleting remote branches, `git branch -a` still shows `remotes/origin/...` entries, creating confusion about what was actually deleted.

**Prevention:** Run `git remote prune origin` after all remote deletions. Or use `git fetch --prune` beforehand.

---

### Pitfall 14: Pushing Before Build Verification

**What goes wrong:** Merging and pushing to origin before running `pnpm build` / `pnpm test`. The merged code has type errors or broken imports. No CI/CD pipeline exists to catch this.

**Prevention:** Use `git merge --no-commit` to force a verification step before committing. Run `pnpm build && pnpm typecheck && pnpm test` before finalizing the merge commit.

**Recovery plan:** If pushed broken: fix forward with a new commit. Do NOT force-push main.

---

## Phase-Specific Warnings

| Phase / Step | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Pre-merge analysis | Pitfall 6: Missing unique commits in branches | Run containment check on ALL 27 branches before any deletion |
| Pre-merge setup | Pitfall 9: Forgetting rerere | Checklist item #1: `git config rerere.enabled true` |
| The merge itself | Pitfall 2: Evil merge in auto-resolved files | Review all 11 doubly-modified files, even if git says "no conflict" |
| The merge itself | Pitfall 1: Schema divergence in `nodeMetricsHistory` | Manually merge metrics.ts, keep schema file, keep init.sql table |
| The merge itself | Pitfall 8: Wholesale --ours/--theirs on server.ts | Edit manually; never accept one side entirely for complex files |
| Post-merge normalize | Pitfall 3: `m` vs `motion` API split | Choose `motion` globally, batch-replace after merge |
| Post-merge build | Pitfall 7: init.sql missing table vs Drizzle schema | Compare table counts: Drizzle schema exports vs SQL CREATE TABLE statements |
| Post-merge typecheck | Pitfall 5: page.tsx import failures | Start from feat/init-monorepo base, port main's Phase 5/6 components in |
| Post-merge E2E | Pitfall 4: Selector mismatches | Budget 1-2 fix rounds, use feat/init-monorepo selectors as baseline |
| Branch cleanup | Pitfall 6: Premature deletion | Tag every branch tip before deletion as safety net |
| Branch cleanup | Pitfall 10: Artifact file noise | Accept feat/init-monorepo versions of pipeline-evidence, move on |
| Push to remote | Pitfall 14: Pushing before verification | Use --no-commit merge, verify build/test/typecheck, then commit and push |

---

## Recommended Conflict Resolution Order

Based on the pitfall analysis and dependency chains, resolve conflicts in this order:

1. **Shared packages first** (`packages/db/`) -- schema determines what the API and frontend can reference
2. **SQL schema** (`charts/voyager/sql/init.sql`) -- must match the Drizzle schema
3. **API server** (`apps/api/src/server.ts`, `apps/api/src/routers/`) -- depends on schema
4. **API jobs** (`apps/api/src/jobs/`) -- depends on schema and server
5. **Frontend shared** (`apps/web/src/lib/`, `apps/web/src/config/`) -- animation constants, navigation, trpc client
6. **Frontend components** (`apps/web/src/components/`) -- depends on shared libs
7. **Frontend pages** (`apps/web/src/app/`) -- depends on components
8. **E2E tests** (`tests/e2e/`) -- depends on the final UI structure
9. **Non-code files** (`BOARD.md`, `pipeline-evidence/`, docs) -- last, lowest risk

---

## Sources

- Direct codebase analysis: `git diff`, `git log`, `git merge-base`, `git show` across main and origin/feat/init-monorepo (HIGH confidence -- primary source for all project-specific pitfalls)
- [Julia Evans -- Dealing with diverged git branches](https://jvns.ca/blog/2024/02/01/dealing-with-diverged-git-branches/) (git merge fundamentals)
- [Atlassian -- Git merge strategy options](https://www.atlassian.com/git/tutorials/using-branches/merge-strategy) (merge strategy reference)
- [Baeldung -- Git Merging: Conflict Resolution](https://www.baeldung.com/ops/git-merge-conflicts-undo) (evil merge / silent data loss patterns)
- [Understanding Git Branch Divergences](https://weirdion.com/posts/2025-01-03-understanding-git-divergences/) (divergence patterns and best practices)
- [Quora -- Can Git merging make a mistake without detecting a conflict?](https://www.quora.com/Is-it-possible-for-Git-merging-to-make-a-mistake-without-detecting-a-conflict) (semantic merge failure patterns)
- [Git rerere -- Pro Git book](https://git-scm.com/book/en/v2/Git-Tools-Rerere) (rerere documentation)
