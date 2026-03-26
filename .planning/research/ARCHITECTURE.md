# Architecture: Branch Merge & Cleanup Order of Operations

**Domain:** Git branch merge strategy for diverged monorepo
**Researched:** 2026-03-26
**Overall confidence:** HIGH (based on actual dry-run merge data + exhaustive git analysis)

## Situation Assessment

Two branches have diverged from merge base `58a8407` (2026-03-14):

| Branch | Commits since merge base | Content |
|--------|--------------------------|---------|
| `main` | 37 commits | Phases 4-6 (sidebar polish, per-node metrics, IA redesign) + 3 project config commits |
| `origin/feat/init-monorepo` | 54 commits | v207-v225 (UX audit batches 1-5, DA2 batches 1-3, E2E selector updates, presence/SSE fixes, login overhaul) |

**Conflict severity from dry-run merge:** 9 files with conflicts, 30 total conflict markers. Heaviest in `metrics.ts` (9 markers) and `Sidebar.tsx` (5 markers). Two files (server.ts, ClusterHealthWidget.tsx) auto-resolve. 166 files changed in feat/init-monorepo, 89 in main, with 244 total differing files between branch tips. This is a **moderate** merge -- not trivial, not catastrophic.

## Branch Topology

```
                     main (37 commits ahead of merge-base)
                    /
  merge-base (58a8407) --- v202
                    \
                     feat/init-monorepo (54 commits ahead)
                       |-- worktree/ron (50 commits, ALL in feat/init-monorepo)
                       |-- worktree/dima (45 commits, ALL in feat/init-monorepo)
                       |-- worktree/shiri (merged via feat/init-monorepo)

  22 branches: fully merged into main (0 unmerged commits)
   2 branches: fully merged into feat/init-monorepo only (safe after merge)
   1 branch: fix/v117-phase-d-r2 (1 commit, superseded by v117-r3 already in main)
```

---

## Recommended Architecture: Three-Phase Sequential Pipeline

```
Phase 1: AUDIT & PROTECT (read-only, no mutations)
    |
    v
Phase 2: MERGE feat/init-monorepo into main (the big merge)
    |
    v
Phase 3: BRANCH CLEANUP (delete stale remotes)
```

### Why This Order

1. **Audit first** because you cannot safely delete branches until you know which ones contain unique work. Deleting before auditing risks permanent work loss.
2. **Merge before cleanup** because `feat/init-monorepo` is the integration branch -- worktree branches flowed into it. Once it is merged to main, the worktree branches become provably redundant (their commits exist in main's history via the merge).
3. **Cleanup last** because it is the only destructive operation and requires the merge to have succeeded first to prove branch redundancy.

---

## Phase 1: Audit & Protect

**Goal:** Catalog every branch, determine what is merged vs. unique, create a safety record.

### Step 1.1: Create Safety Snapshot

```bash
# Tag current main so we can always return here
git tag pre-merge-snapshot main

# Record branch state for audit trail
git branch -a --sort=-committerdate > .planning/branch-audit.txt

# Record tip commits for every remote branch (recovery insurance)
for branch in $(git branch -r | grep -v HEAD); do
  echo "$branch $(git rev-parse $branch)" >> .planning/branch-tips.txt
done
```

**Rollback:** `git checkout pre-merge-snapshot` restores original main at any point.

### Step 1.2: Branch Evaluation Decision Tree

```
For each branch:
  1. Are ALL its commits reachable from main?
      YES -> SAFE TO DELETE (fully merged)
      NO  -> Continue to 2

  2. Are ALL its commits reachable from feat/init-monorepo?
      YES -> SAFE TO DELETE AFTER MERGE
             (will become merged once feat/init-monorepo merges)
      NO  -> Continue to 3

  3. Does it have unique commits not in main OR feat/init-monorepo?
      YES -> EVALUATE: Is the work valuable? Still relevant?
             YES, valuable  -> PRESERVE (cherry-pick or document for later)
             NO, superseded -> SAFE TO DELETE (document what was discarded)
      NO  -> SAFE TO DELETE
```

### Step 1.3: Pre-Computed Branch Evaluation

Based on actual git analysis (`git rev-list --count`, `git merge-base --is-ancestor`):

| Branch | Unmerged to main | Unique (not in feat/init-monorepo) | Verdict | Action |
|--------|------------------|------------------------------------|---------|--------|
| **origin/feat/init-monorepo** | 54 | N/A (this IS the source) | PRIMARY MERGE TARGET | Merge in Phase 2 |
| **origin/worktree/ron** | 50 | 0 (pure subset of feat/init-monorepo) | Redundant after merge | Delete in Phase 3, Batch 2 |
| **origin/worktree/dima** | 45 | 0 (pure subset of feat/init-monorepo) | Redundant after merge | Delete in Phase 3, Batch 2 |
| origin/worktree/shiri | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/beni | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/noam | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/uri | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/yuval | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/lior | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/ron-approved-v98 | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/ron-approved-v99 | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/ron-approved-v99-fix | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/ron-approved-v100 | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/worktree/ron-approved-d3215cc | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/api-improvements | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/helm-infra | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/k8s-live-dashboard | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/phase6-ia-redesign | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/ui-cluster-detail | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/ui-cluster-groups | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/ui-clusters-page | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/ui-events-page | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/feat/ui-settings-page | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| origin/fix/v117-phase-d-bugs | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |
| **origin/fix/v117-phase-d-r2** | 1 | 1 (but superseded by v117-r3 in main) | Superseded | Delete in Phase 3, Batch 3 (with documentation) |
| origin/develop | 0 | -- | Fully merged to main | Delete in Phase 3, Batch 1 |

**Key finding:** Only `feat/init-monorepo` has meaningful unmerged work. `worktree/ron` and `worktree/dima` are pure subsets of `feat/init-monorepo` (verified: 0 commits not in feat/init-monorepo). `fix/v117-phase-d-r2` has 1 commit (`eaa87c6`) but it was superseded by `fb5bb3c` (v117-r3) which is confirmed in main. Everything else has 0 unmerged commits.

### Phase 1 Safety Checks

- [ ] `pre-merge-snapshot` tag created on current main HEAD
- [ ] Branch audit recorded to `.planning/branch-audit.txt`
- [ ] Branch tip hashes recorded to `.planning/branch-tips.txt`
- [ ] Every branch evaluated using the decision tree
- [ ] No branches deleted yet -- Phase 1 is strictly read-only

---

## Phase 2: The Big Merge

**Goal:** Merge `origin/feat/init-monorepo` into `main` with all 54 commits, resolving 9 conflict files.

### Step 2.1: Pre-Merge Safety

```bash
# Ensure working tree is clean
git status  # Must show clean working tree

# Verify we are on main
git branch --show-current  # Must output "main"

# Verify the merge base is what we expect
git merge-base main origin/feat/init-monorepo
# Expected: 58a84072269db4b22506116ade503f31138d2d27

# Enable rerere (records conflict resolutions for replay if we abort and retry)
git config rerere.enabled true
```

### Step 2.2: Execute the Merge

```bash
# Standard merge with --no-commit for staged resolution
git merge --no-commit --no-ff origin/feat/init-monorepo
```

This will report 9 conflict files and stop. Expected.

### Step 2.3: Resolve Conflicts (Ordered by Risk -- Low to High)

#### Tier 1: Take-One-Side (resolve first, build confidence)

These files have a clear "winner" -- one branch is strictly more current.

| File | Conflict count | Strategy | Rationale |
|------|---------------|----------|-----------|
| `BOARD.md` | 4 | Accept theirs (feat/init-monorepo) | feat/init-monorepo has v223-v225 pipeline state. Main's BOARD.md reflects v202. The incoming version is strictly more current. |
| `pipeline-evidence/guardian-accuracy.json` | 1 | Accept theirs (feat/init-monorepo) | JSON data file with latest evidence. No semantic merge needed -- latest data wins. |

```bash
git checkout --theirs BOARD.md pipeline-evidence/guardian-accuracy.json
git add BOARD.md pipeline-evidence/guardian-accuracy.json
```

#### Tier 2: Test Files (low risk -- validated by running tests later)

| File | Conflict count | Strategy | Rationale |
|------|---------------|----------|-----------|
| `tests/e2e/optimistic-ui.spec.ts` | 2 | Accept theirs (feat/init-monorepo) | E2E selectors were updated for v215+ UI in feat/init-monorepo. Main has older selectors matching v202 UI. The newer selectors match the newer UI code that this merge brings in. |
| `tests/e2e/phase3-v194-animation.spec.ts` | 2 | Accept theirs (feat/init-monorepo) | Same reasoning -- E2E specs updated for latest UI state. |

```bash
git checkout --theirs tests/e2e/optimistic-ui.spec.ts tests/e2e/phase3-v194-animation.spec.ts
git add tests/e2e/optimistic-ui.spec.ts tests/e2e/phase3-v194-animation.spec.ts
```

#### Tier 3: Minor Component Conflicts (manual merge, low marker count)

| File | Conflict count | Strategy | Rationale |
|------|---------------|----------|-----------|
| `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` | 1 | Manual merge | Only 1 conflict. Main added node metrics table features (Phase 5). feat/init-monorepo added UX audit fixes and DA2 CSS improvements. Both changes are additive and needed. |
| `apps/web/src/components/metrics/ResourceSparkline.tsx` | 1 | Manual merge | Only 1 conflict. Main added Grafana-quality axes. feat/init-monorepo added DA2 CSS refinements. Both changes are additive. |

For each file: open in editor, examine the conflict block, combine both sides' changes, remove markers.

#### Tier 4: Heavy Component Conflicts (manual merge, most markers)

| File | Conflict count | Strategy | Rationale |
|------|---------------|----------|-----------|
| `apps/web/src/components/metrics/MetricsAreaChart.tsx` | 5 | Manual merge | Main: Grafana-quality time axes, CSS variable grid. feat/init-monorepo: DA2 batch 1 CSS/UX fixes, timeline chart refinements. Need to combine both feature sets -- they improve different aspects of the same component. |
| `apps/web/src/components/Sidebar.tsx` | 5 | Manual merge | Main: Phase 4 sidebar polish (SB-002..SB-011), compact stats bar. feat/init-monorepo: UX audit batches 3+5, DA2 CSS fixes. Core navigation component -- must carefully merge both sets of improvements. Watch for duplicate className changes. |
| `apps/api/src/routers/metrics.ts` | 9 | Manual merge -- HIGHEST CARE | Main: per-node metrics history, nodeTimeSeries tRPC, collector health endpoint (Phase 5 MX-001..004), query limits, batch node inserts. feat/init-monorepo: timeline chart refinements for short ranges, metrics RBAC fixes. This is the heaviest conflict. Start with main's version as base (larger structural changes), then layer feat/init-monorepo's refinements on top. |

**For Tier 3 and 4 files -- manual resolution process:**

1. Open the file and locate each `<<<<<<< HEAD` marker
2. Read the `HEAD` (main) version -- understand what feature it adds
3. Read the incoming (feat/init-monorepo) version -- understand what it adds
4. Determine: Does one supersede the other? Or do both contribute unique changes?
5. If both contribute: combine them, keeping both features intact
6. Remove all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
7. Save and `git add` the file

### Step 2.4: Post-Resolution Validation Gate

After resolving all conflicts, BEFORE committing:

```bash
# 1. Verify no remaining conflict markers
grep -rn "<<<<<<< " apps/ tests/ packages/ --include="*.ts" --include="*.tsx" --include="*.json"
# Must return nothing

# 2. Install dependencies (lockfile may have changed)
pnpm install --frozen-lockfile
# If frozen-lockfile fails: pnpm install (regenerate lockfile, then add pnpm-lock.yaml)

# 3. TypeScript check (catches import errors, type mismatches from bad merges)
pnpm typecheck

# 4. Lint check (catches formatting issues introduced by manual edits)
pnpm lint

# 5. Full monorepo build
pnpm build

# 6. Unit tests
pnpm test
```

**Critical rule:** Do NOT commit the merge until steps 1-6 all pass. Fix any issues before committing. Each fix should be `git add`-ed to the merge staging area.

**If validation fails:** Diagnose the failure. Common post-merge issues:
- Duplicate imports (both sides added the same import differently)
- Missing exports (one side renamed something the other side imports)
- Type mismatches (function signature changed on one side, call site on the other)
- CSS class conflicts (both sides modified the same Tailwind classes)

### Step 2.5: Commit the Merge

```bash
git commit -m "merge: feat/init-monorepo into main (v207-v225 -- UX audit, DA2, presence, login overhaul)"
```

### Step 2.6: Post-Merge Smoke Test

```bash
# Start local infra
docker compose up -d

# Start dev servers
pnpm --filter api dev &
pnpm --filter web dev &

# Verify API boots (wait ~5s for startup)
curl -s http://localhost:4000/health | head -1

# Verify web boots
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200

# Stop dev servers
kill %1 %2
```

### Step 2.7: Push

```bash
git push origin main
```

### Phase 2 Safety Checks

- [ ] Working tree clean before merge
- [ ] On `main` branch
- [ ] Merge base matches expected `58a8407`
- [ ] rerere enabled
- [ ] Tier 1 conflicts resolved (BOARD.md, guardian-accuracy.json) -- accept theirs
- [ ] Tier 2 conflicts resolved (E2E test files) -- accept theirs
- [ ] Tier 3 conflicts resolved (MetricsTimeSeriesPanel, ResourceSparkline) -- manual
- [ ] Tier 4 conflicts resolved (MetricsAreaChart, Sidebar, metrics.ts) -- manual
- [ ] Zero remaining conflict markers in codebase
- [ ] `pnpm install` succeeds
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] Merge committed
- [ ] Smoke test passes (API + web boot)
- [ ] Pushed to origin

### Rollback Plan for Phase 2

| Situation | Command | Effect |
|-----------|---------|--------|
| In-progress merge, want to abort | `git merge --abort` | Returns to pre-merge state |
| Merge committed but not pushed | `git reset --hard pre-merge-snapshot` | Discards merge commit locally |
| Merge pushed, need to undo | `git revert -m 1 <merge-commit>` | Creates new revert commit |

**Preference order:** abort > reset > revert. Never force-push main.

---

## Phase 3: Branch Cleanup

**Goal:** Delete all stale remote branches. Only execute after Phase 2 merge is committed and pushed.

### Step 3.1: Verify Merge Success

```bash
# Confirm feat/init-monorepo is now an ancestor of main
git merge-base --is-ancestor origin/feat/init-monorepo main && echo "MERGED" || echo "NOT MERGED"
# Must say "MERGED"

# Confirm worktree/ron and worktree/dima are now reachable from main
git merge-base --is-ancestor origin/worktree/ron main && echo "ron: MERGED" || echo "ron: NOT MERGED"
git merge-base --is-ancestor origin/worktree/dima main && echo "dima: MERGED" || echo "dima: NOT MERGED"
# Both must say "MERGED"
```

### Step 3.2: Batch 1 -- Fully-Merged Branches (Zero Risk)

These have 0 unmerged commits to main even before the Phase 2 merge. Completely safe to delete at any time.

```bash
# Worktree branches (agent worktrees from prior development)
git push origin --delete \
  worktree/shiri \
  worktree/beni \
  worktree/noam \
  worktree/uri \
  worktree/yuval \
  worktree/lior

# Worktree approval branches
git push origin --delete \
  worktree/ron-approved-v98 \
  worktree/ron-approved-v99 \
  worktree/ron-approved-v99-fix \
  worktree/ron-approved-v100 \
  worktree/ron-approved-d3215cc

# Old feature branches (all fully merged)
git push origin --delete \
  feat/api-improvements \
  feat/helm-infra \
  feat/k8s-live-dashboard \
  feat/phase6-ia-redesign \
  feat/ui-cluster-detail \
  feat/ui-cluster-groups \
  feat/ui-clusters-page \
  feat/ui-events-page \
  feat/ui-settings-page

# Old fix branch (fully merged)
git push origin --delete fix/v117-phase-d-bugs

# Stale integration branch
git push origin --delete develop
```

**Total Batch 1:** 22 branches deleted.

### Step 3.3: Batch 2 -- Post-Merge Redundant Branches

These are safe ONLY after Phase 2 merge is confirmed successful.

```bash
# Guard: only proceed if merge is confirmed
git merge-base --is-ancestor origin/feat/init-monorepo main && \
  git push origin --delete \
    feat/init-monorepo \
    worktree/ron \
    worktree/dima
```

**Total Batch 2:** 3 branches deleted.

### Step 3.4: Batch 3 -- Superseded Branch (with documentation)

```bash
# Document what is being discarded
echo "DISCARDED: fix/v117-phase-d-r2" >> .planning/branch-audit.txt
echo "  Commit: eaa87c6 - fix: apply encryption key to k8s, fix connection-config schemas, show lastConnectedAt in detail [v117-r2]" >> .planning/branch-audit.txt
echo "  Superseded by: fb5bb3c - fix: QA findings (v117-r3), confirmed in main" >> .planning/branch-audit.txt

git push origin --delete fix/v117-phase-d-r2
```

**Total Batch 3:** 1 branch deleted.

### Step 3.5: Prune Local Tracking References

```bash
git remote prune origin
git fetch --prune
```

### Step 3.6: Final Verification

```bash
# Only main should remain
git branch -r
# Expected output:
#   origin/HEAD -> origin/main
#   origin/main

# Count remaining remote branches
git branch -r | wc -l
# Expected: 2 (HEAD pointer + main)

# Final build verification
pnpm build && pnpm test
```

### Phase 3 Safety Checks

- [ ] Phase 2 merge confirmed (`feat/init-monorepo` is ancestor of main)
- [ ] `branch-tips.txt` recorded (recovery insurance for all branch tip hashes)
- [ ] Batch 1 deleted (22 branches, zero-risk, fully merged pre-merge)
- [ ] Batch 2 deleted (3 branches, post-merge safe)
- [ ] Batch 3 deleted (1 branch, superseded, documented)
- [ ] Local tracking refs pruned
- [ ] `git branch -r` shows only origin/HEAD and origin/main
- [ ] Final build + test passes

### Rollback Plan for Phase 3

Remote branch deletion is **not easily reversible** once git garbage-collects (~90 days). Mitigations:

1. **branch-tips.txt** records every branch tip hash. To restore any deleted branch:
   ```bash
   git push origin <commit-hash>:refs/heads/<branch-name>
   ```

2. **GitHub retains refs for ~90 days** even after deletion. Recovery possible via API:
   ```bash
   gh api repos/OWNER/REPO/git/refs
   ```

3. **pre-merge-snapshot tag** preserves the exact state of main before any changes.

---

## Conflict Resolution Guide: File-by-File Detail

### metrics.ts (9 conflicts -- highest risk)

**Main added (Phase 5):**
- `nodeTimeSeries` tRPC procedure
- Node metrics batch inserts
- Collector health endpoint (`/health/collector`)
- Query limits for nodeTimeSeries
- Health endpoint documentation

**feat/init-monorepo added:**
- Timeline chart refinements for short time ranges
- Metrics RBAC fix (collection permissions)

**Strategy:** Use main's version as the structural base. Main has the larger additions (entire new procedures and endpoints). Layer feat/init-monorepo's refinements on top -- the RBAC fix and timeline range adjustments are localized changes that do not conflict semantically with the node metrics features. Test with `pnpm typecheck` after resolution to catch any import/type issues.

### Sidebar.tsx (5 conflicts -- high risk, core navigation)

**Main added (Phase 4):**
- Sidebar polish items SB-002 through SB-011
- Compact stats bar integration
- Icon centering in collapsed mode

**feat/init-monorepo added:**
- UX audit batch 3 fixes (sidebar, SSE reconnection, settings)
- UX audit batch 5 fixes (settings, alerts, permissions, global)
- DA2 batch 1 CSS/UX improvements

**Strategy:** Use main's structural sidebar changes as the base (Phase 4 polish is the more significant refactor). Apply feat/init-monorepo's CSS refinements and UX audit fixes on top. Watch for: duplicate `className` changes, conflicting Tailwind utility classes, or competing style overrides. This is the core navigation component -- test visually after merge.

### MetricsAreaChart.tsx (5 conflicts -- medium risk)

**Main added:** Grafana-quality time axes, CSS variable grid system
**feat/init-monorepo added:** DA2 batch 1 CSS/UX fixes, timeline chart refinements

**Strategy:** Both sides improved chart quality from different angles. Combine: main's axis formatting + feat/init-monorepo's CSS polish. They are likely additive. Verify the recharts props do not conflict.

### MetricsTimeSeriesPanel.tsx (1 conflict -- low risk)

**Main added:** Node metrics table features, MX-005 anomaly badge
**feat/init-monorepo added:** UX audit batch 4 chart fixes, DA2 CSS improvements

**Strategy:** Single conflict -- examine and combine. Likely a className or styling change where both sides modified the same element differently.

### ResourceSparkline.tsx (1 conflict -- low risk)

**Main added:** Grafana-quality axes for sparklines
**feat/init-monorepo added:** DA2 CSS refinements, short-range timeline fixes

**Strategy:** Single conflict -- examine and combine. Both sides improved the sparkline rendering.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Delete-Then-Merge
**What:** Cleaning up branches before completing the main merge.
**Why bad:** If the merge fails catastrophically and you need to reference branch content, the branches are gone. `worktree/ron` and `worktree/dima` are only provably redundant AFTER `feat/init-monorepo` merges into main.
**Instead:** Always merge first, verify, then cleanup.

### Anti-Pattern 2: Rebase Instead of Merge
**What:** Rebasing feat/init-monorepo onto main for "clean" linear history.
**Why bad:** Rewrites 54 commits, changes their hashes, breaks the ancestor relationship with worktree branches (you can no longer prove they are subsets via `git merge-base --is-ancestor`), and the PROJECT.md explicitly says "Merge only -- preserve full history. No force-pushing to main."
**Instead:** Use `git merge --no-ff` to preserve the complete DAG.

### Anti-Pattern 3: Bulk Accept --theirs for All Files
**What:** Running `git checkout --theirs .` to resolve all conflicts at once.
**Why bad:** Main has Phase 4-6 features (sidebar polish, per-node metrics backend, IA redesign) that are NOT in feat/init-monorepo. Using `--theirs` globally would silently discard these features -- you would lose the Phase 5 node metrics system and Phase 4 sidebar polish.
**Instead:** Use `--theirs` only for files where feat/init-monorepo is strictly more current (BOARD.md, pipeline-evidence, E2E selectors). Manually merge component and API files where both sides contributed meaningful features.

### Anti-Pattern 4: Force-Push Main
**What:** Using `git push --force origin main` after a messy merge.
**Why bad:** Destroys other consumers' local history references. PROJECT.md constraint: "No force-pushing to main."
**Instead:** If the merge commit is wrong and not yet pushed, `git reset --hard pre-merge-snapshot`. If already pushed, `git revert -m 1 <merge-commit>`.

### Anti-Pattern 5: Skipping TypeCheck After Merge
**What:** Committing the merge after only verifying no conflict markers remain.
**Why bad:** Merge resolution can create type errors invisible to conflict markers: duplicate imports with different specifiers, wrong function signatures where one side renamed parameters, missing re-exports where one side restructured a barrel file. The monorepo's cross-package dependencies (packages/types, packages/ui) amplify this risk.
**Instead:** Run the full validation gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` before committing.

### Anti-Pattern 6: Committing Without Building
**What:** Trusting that typecheck alone means the merge is correct.
**Why bad:** TypeScript does not catch runtime issues. `pnpm build` (which runs Next.js build + Fastify build) catches: missing environment variable references, broken dynamic imports, incorrect barrel exports, and SSR/SSG issues that TypeScript alone misses.
**Instead:** Always run the full build. If build fails, diagnose before committing.

---

## Post-Stabilization: Future Branch Strategy

### Target State After Cleanup

```
Remote branches: 1 (origin/main)
Local branches:  1 (main)
Tags:            pre-merge-snapshot (keep for 30 days, then delete)
```

### Branching Rules Going Forward

| Rule | Rationale |
|------|-----------|
| No long-lived integration branches | The `feat/init-monorepo` pattern caused this 54-commit divergence |
| Feature branches merge to main directly | Eliminates the integration branch bottleneck |
| Feature branches live < 1 week | Prevents divergence from accumulating |
| Merge main INTO feature branches regularly | If a feature takes > 2 days, pull main in to prevent divergence |
| Delete feature branches immediately after merge | Prevents stale branch accumulation |

### Data Flow During Merge

```
1. git merge --no-commit --no-ff origin/feat/init-monorepo
   |
   Git 3-way merge algorithm:
   - base:   58a8407 (merge-base, v202)
   - ours:   main HEAD (37 commits: Phases 4-6)
   - theirs: feat/init-monorepo HEAD (54 commits: v207-v225)
   |
   Auto-merged: ~235 files (no conflicts)
   Conflicted:  9 files (manual resolution needed)
   |
2. Manual resolution (file by file, Tier 1-4)
   |
3. git add <resolved files>
   |
4. Validation gate: pnpm install -> typecheck -> lint -> build -> test
   |  PASS -> Continue
   |  FAIL -> Fix, re-add, re-validate
   |
5. git commit (finalizes merge)
   |
6. git push origin main
   |
7. Branch cleanup (Batches 1-3)
   |
8. git remote prune origin && git fetch --prune
   |
9. Final: git branch -r shows only origin/main
```

## Sources

- Actual `git merge --no-commit` dry-run performed on this repository (2026-03-26) -- conflict counts are empirical, not estimated
- `git rev-list`, `git merge-base --is-ancestor`, `git log` analysis of all 27 remote branches
- [Git - Advanced Merging](https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging) -- official conflict resolution documentation
- [Atlassian Git Merge Strategies](https://www.atlassian.com/git/tutorials/using-branches/merge-strategy) -- merge strategy options
- [Julia Evans - Dealing with diverged git branches](https://jvns.ca/blog/2024/02/01/dealing-with-diverged-git-branches/) -- practical merge patterns
- [Graphite - Git Divergent Branches](https://graphite.dev/guides/git-divergent-branches) -- resolution methods
- [Git merge-strategies documentation](https://git-scm.com/docs/merge-strategies) -- theirs/ours strategy reference
