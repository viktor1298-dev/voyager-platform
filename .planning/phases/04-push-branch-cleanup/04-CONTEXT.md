# Phase 4: Push & Branch Cleanup - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Push the merged main to origin and delete all stale remote and local branches. This is a destructive phase (branch deletion is hard to reverse after git GC) but mitigated by branch-tips.txt recovery insurance from Phase 1. No code changes — pure git operations.

</domain>

<decisions>
## Implementation Decisions

### Push Strategy
- **D-01:** Push main to origin first, before any branch deletions. Remote needs the merge to prove worktree branches are redundant.
- **D-02:** Standard `git push origin main` — no force-push (PROJECT.md constraint)

### Branch Deletion — 3-Batch Strategy
- **D-03:** Batch 1 (22 branches, zero-risk): Delete fully-merged branches that have 0 unmerged commits to main even before the Phase 2 merge. Includes worktree/shiri, worktree/beni, worktree/noam, worktree/uri, worktree/yuval, worktree/lior, all ron-approved-* branches, all old feat/* branches, fix/v117-phase-d-bugs, develop.
- **D-04:** Batch 2 (3 branches, post-merge safe): Delete feat/init-monorepo, worktree/ron, worktree/dima — only after verifying `git merge-base --is-ancestor` against main.
- **D-05:** Batch 3 (1 branch, superseded): Delete fix/v117-phase-d-r2 after documenting in branch-audit.txt.

### fix/v117-phase-d-r2 Handling
- **D-06:** DISCARD with documentation. Commit eaa87c6 is superseded by fb5bb3c (v117-r3) already in main. Document the commit content and supersession rationale in branch-audit.txt before deletion. No cherry-pick.

### Local Branch Cleanup
- **D-07:** Delete local stale branches (claude/objective-shockley and any others). Run `git branch` to discover, delete with `git branch -d` (safe delete — only deletes if merged).

### Post-Cleanup Verification
- **D-08:** After all deletions, `git branch -r` must show only `origin/HEAD` and `origin/main`
- **D-09:** Run `git remote prune origin && git fetch --prune` to clean up stale tracking refs

### Claude's Discretion
- Exact ordering within Batch 1 (can do all at once or in sub-groups)
- Whether to use `git push origin --delete` for each branch individually or batch them
- Content and format of the branch-audit.txt documentation entry

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Branch Strategy & Topology
- `.planning/research/ARCHITECTURE.md` — Full 3-batch deletion strategy, branch evaluation decision tree, per-branch verdicts
- `.planning/branch-tips.txt` — All branch HEADs for recovery if needed

### Project Context
- `.planning/PROJECT.md` — Git safety constraints (no force-push)
- `.planning/REQUIREMENTS.md` — CLEAN-01 through CLEAN-05 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.planning/branch-tips.txt` — Recovery insurance with all branch SHAs
- Recovery tags: `pre-merge-snapshot`, `pre-cleanup-feat`, `merge-feat-init-monorepo`

### Established Patterns
- `git push origin --delete <branch>` for remote branch deletion
- `git merge-base --is-ancestor` for proving branch redundancy

### Integration Points
- Phase 4 completing unlocks Phase 5 (GitHub Protection)
- After cleanup, `git branch -r` should show only origin/HEAD and origin/main

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow the research-recommended 3-batch approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-push-branch-cleanup*
*Context gathered: 2026-03-27*
