# Technology Stack: Branch Cleanup & Monorepo Stabilization

**Project:** Voyager Platform — Git Branch Consolidation
**Researched:** 2026-03-26
**Overall confidence:** HIGH

## Recommended Strategy & Tools

### Core Merge Strategy

| Strategy | Approach | Why |
|----------|----------|-----|
| `git merge` (not rebase) | Merge `feat/init-monorepo` into `main` with a merge commit | feat/init-monorepo is a shared branch with 10+ merge commits from worktree branches. Rebasing would rewrite 54 commits of shared history, break SHA references, and risk data loss. Merge preserves the full development narrative. |
| `--no-ff` flag | Force a merge commit even if fast-forward is possible | Creates an explicit merge point that documents when stabilization happened. Easy to revert the entire merge if needed. |
| `--no-commit` first pass | Preview the merge before committing | Allows manual inspection of all conflict resolutions and auto-merged files before finalizing. Safety net. |

**The verdict: MERGE, not rebase.** Three decisive reasons:

1. **Shared history** -- feat/init-monorepo has merge commits from worktree/ron, worktree/dima, worktree/shiri. Rebase would replay all 54 commits one by one, each potentially hitting conflicts. Merge resolves all conflicts in one shot.
2. **Divergence is symmetric** -- 37 commits in main, 54 in feature. Rebase of either direction would rewrite a massive amount of history.
3. **PROJECT.md constraint** -- "No force-pushing to main. Merge only -- preserve full history." This rules out rebase entirely.

### Conflict Resolution Tools

| Tool | Version/Source | Purpose | Why This One |
|------|---------------|---------|-------------|
| VS Code 3-way merge editor | Built-in (v1.96+) | Primary conflict resolution UI | Shows base/incoming/current side-by-side. Handles TypeScript/TSX well. You already use VS Code. |
| Mergiraf | Latest (cargo install) | Syntax-aware merge driver | Parses TypeScript/TSX as AST, resolves import ordering and non-overlapping function changes automatically. Reduces the 9 conflicting files to only truly semantic conflicts. |
| `git rerere` | Built-in | Record/replay conflict resolutions | If the first merge attempt fails validation (build/test), you can abort and retry without re-resolving the same conflicts. Essential safety net. |
| `git merge-tree` | Built-in (Git 2.38+) | Dry-run merge preview | Already confirmed: exactly 9 files conflict. Use before the real merge to plan the resolution order. |

### Branch Cleanup Tools

| Tool | Installation | Purpose | Why This One |
|------|-------------|---------|-------------|
| `git branch --merged` | Built-in | Identify fully-merged branches | Simple, reliable, no dependencies. Works for this scale (27 branches). |
| `git push origin --delete` | Built-in | Delete remote branches | Direct, explicit. Better than a tool for a one-time cleanup of 27 branches. |
| `git remote prune origin` | Built-in | Clean stale remote-tracking refs | Run after remote deletions to sync local refs. |
| `git-delete-merged-branches` | `pip install git-delete-merged-branches` | Automated bulk deletion with safety | Interactive confirmation, --dry-run mode, --force-with-lease for remote. Use if you want a single command instead of manual scripting. |

### Verification Tools

| Tool | Purpose | Command |
|------|---------|---------|
| Turborepo build | Verify merged code compiles | `pnpm build` |
| Vitest | Unit test verification | `pnpm test` |
| Biome | Lint check (catches import issues) | `pnpm lint` |
| TypeScript | Type check across monorepo | `pnpm typecheck` |

## Detailed Merge Plan

### Phase 1: Pre-Merge Setup

```bash
# Enable rerere BEFORE starting (records conflict resolutions for replay)
git config rerere.enabled true

# Set up fetch pruning for future hygiene
git config fetch.prune true

# Dry-run to confirm conflict scope (already done - 9 files)
git merge-tree --write-tree main origin/feat/init-monorepo 2>&1 | grep "^100644" | awk '{print $4}' | sort -u
```

### Phase 2: The Merge

```bash
# Start on main
git checkout main

# Merge WITHOUT committing -- inspect first
git merge --no-commit --no-ff origin/feat/init-monorepo

# Git will stop with conflicts in 9 files. Resolve them.
# After resolution:
git add .
git diff --cached --stat  # Review what's staged

# Verify before committing
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test

# If all passes, commit
git commit -m "merge: consolidate feat/init-monorepo into main (v207-v225 stabilization)

Merges 54 commits of active development: UX fixes, E2E updates, DA2 batches,
presence fixes, and worktree integration (ron, dima, shiri).

Conflicts resolved in 9 files:
- apps/api/src/routers/metrics.ts
- apps/web/src/components/Sidebar.tsx
- apps/web/src/components/metrics/* (3 files)
- BOARD.md
- pipeline-evidence/guardian-accuracy.json
- tests/e2e/* (2 files)"

# If build/test fails: abort and retry (rerere remembers resolutions)
# git merge --abort
# Fix issues, then re-merge (rerere auto-applies previous resolutions)
```

### Phase 3: Branch Cleanup

```bash
# 1. Verify which branches are safe to delete (already confirmed via research)
# These 22 branches are fully merged into main:
git branch -r --merged main | grep -v HEAD | grep -v "origin/main"

# 2. Delete remote branches that are fully merged into main
# Safe to delete (confirmed merged):
for branch in \
  origin/develop \
  origin/feat/api-improvements \
  origin/feat/helm-infra \
  origin/feat/k8s-live-dashboard \
  origin/feat/phase6-ia-redesign \
  origin/feat/ui-cluster-detail \
  origin/feat/ui-cluster-groups \
  origin/feat/ui-clusters-page \
  origin/feat/ui-events-page \
  origin/feat/ui-settings-page \
  origin/fix/v117-phase-d-bugs \
  origin/worktree/beni \
  origin/worktree/lior \
  origin/worktree/noam \
  origin/worktree/ron-approved-d3215cc \
  origin/worktree/ron-approved-v100 \
  origin/worktree/ron-approved-v98 \
  origin/worktree/ron-approved-v99 \
  origin/worktree/ron-approved-v99-fix \
  origin/worktree/shiri \
  origin/worktree/uri \
  origin/worktree/yuval
do
  name=${branch#origin/}
  echo "Deleting: $name"
  git push origin --delete "$name"
done

# 3. After merging feat/init-monorepo, these also become merged:
# origin/worktree/ron (merged into feat/init-monorepo)
# origin/worktree/dima (merged into feat/init-monorepo)
# origin/feat/init-monorepo (the source branch itself)
for branch in worktree/ron worktree/dima feat/init-monorepo; do
  git push origin --delete "$branch"
done

# 4. Handle fix/v117-phase-d-r2 (1 unique commit, not merged anywhere)
# Evaluate the commit first, then either cherry-pick or delete
git log --oneline -1 origin/fix/v117-phase-d-r2
# If valuable: git cherry-pick <sha>
# If stale: git push origin --delete fix/v117-phase-d-r2

# 5. Clean up local tracking refs
git remote prune origin

# 6. Delete local branches that no longer have remotes
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -d
```

### Phase 4: Post-Merge Verification

```bash
# Full verification suite
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# Confirm branch state
git branch -a  # Should show only: main + any intentionally kept branches
git log --oneline --graph -20  # Verify merge history looks clean
```

## Conflict Resolution Guide (Per File)

Based on the analysis of divergence in each conflicting file:

| File | main changes | feat changes | Resolution Strategy |
|------|-------------|-------------|-------------------|
| `BOARD.md` | +92/-23 (Phase 4-6 updates) | +33/-23 (different updates) | Take main's version -- it has more recent phase tracking |
| `apps/api/src/routers/metrics.ts` | +119/-35 | +228/-134 | Take feat's version -- larger rewrite, more complete. Cherry-pick any main-only additions. |
| `apps/web/src/components/Sidebar.tsx` | +241/-114 (major redesign) | +28/-20 (minor fixes) | Take main's version -- has the full redesign. Apply feat's fixes on top. |
| `MetricsAreaChart.tsx` | +6 lines vs feat | Different refactors | Manual merge -- both sides have meaningful changes |
| `MetricsTimeSeriesPanel.tsx` | 219 vs 295 lines | feat has more content | Likely take feat -- more complete implementation |
| `ResourceSparkline.tsx` | 142 vs 137 lines | Small differences | Diff carefully -- nearly identical, likely formatting |
| `guardian-accuracy.json` | 641 vs 645 lines | JSON data file | Take whichever is newer (feat, dated 2026-03-17) |
| `optimistic-ui.spec.ts` | 99 vs 93 lines | Minor test differences | Take feat -- more recent E2E fixes |
| `phase3-v194-animation.spec.ts` | 226 vs 169 lines | main has more tests | Take main -- has Phase 3 animation tests |

## Optional: Mergiraf Setup

Mergiraf can auto-resolve TypeScript/TSX conflicts where changes touch different parts of the syntax tree (e.g., one branch adds an import while another modifies a function body). For 9 conflicting files, it may reduce manual work by 30-50%.

```bash
# Install (macOS via Cargo -- requires Rust toolchain)
cargo install --locked mergiraf

# Configure as git merge driver
git config merge.mergiraf.name mergiraf
git config merge.mergiraf.driver 'mergiraf merge --git %O %A %B -s %S -x %X -y %Y -p %P -l %L'

# Enable for TypeScript/TSX files in .gitattributes
echo '*.ts merge=mergiraf' >> .gitattributes
echo '*.tsx merge=mergiraf' >> .gitattributes

# Generate full language support list
mergiraf languages --gitattributes >> .gitattributes
```

**Recommendation:** For 9 conflicts, Mergiraf is optional -- manual resolution with VS Code's 3-way merge editor is perfectly adequate. Install Mergiraf if you plan ongoing branch integration workflows, not just for this one-time merge.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Merge strategy | `git merge --no-ff` | `git rebase` | Shared history, 10+ merge commits in feat branch, PROJECT.md forbids force-push. Rebase would replay 54 commits with per-commit conflict resolution. |
| Merge strategy | `git merge --no-ff` | Squash merge | Loses 54 commits of granular history. PROJECT.md says "preserve full history." |
| Conflict tool | VS Code 3-way | KDiff3 | VS Code is already the editor, TypeScript syntax highlighting built-in, no context switch. |
| Conflict tool | VS Code 3-way | Mergiraf | Mergiraf adds value for ongoing workflows but is overkill for a one-time 9-file merge. |
| Branch cleanup | Built-in git commands | git-delete-merged-branches | For 27 branches, a scripted loop is clearer and more auditable than an interactive tool. The tool is better for ongoing hygiene. |
| Branch cleanup | Script loop | GitHub branch protection auto-delete | Requires PR-based workflow. This project uses direct merges. |
| Dry run | `git merge --no-commit` | `git merge-tree` | Both are useful. merge-tree for conflict counting (already done), --no-commit for the actual safe merge attempt. |

## Sources

- [Git merge documentation](https://git-scm.com/docs/git-merge) -- official reference for --no-commit, --no-ff, --abort flags
- [Git merge-tree documentation](https://git-scm.com/docs/git-merge-tree) -- dry-run merge preview
- [Git rerere documentation](https://git-scm.com/docs/git-rerere) -- conflict resolution recording
- [Mergiraf](https://mergiraf.org/) -- syntax-aware merge driver for TypeScript/TSX
- [git-delete-merged-branches](https://github.com/hartwork/git-delete-merged-branches) -- automated branch cleanup tool
- [Atlassian: Merging vs Rebasing](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) -- strategy comparison
- [Git merge conflict resolution](https://www.atlassian.com/git/tutorials/using-branches/merge-conflicts) -- Atlassian tutorial
