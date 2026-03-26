# Phase 2: The Big Merge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 02-the-big-merge
**Areas discussed:** Pre-commit validation depth, Build failure strategy, Motion normalization scope

---

## Pre-Commit Validation Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full validation in Phase 2 | Run typecheck + lint + build + test BEFORE committing the merge. Phase 3 becomes a quick re-confirmation pass. | ✓ |
| Minimal in Phase 2, full in Phase 3 | Phase 2 only checks no conflict markers + pnpm install. Phase 3 does real validation. | |
| Collapse Phase 3 into Phase 2 | Merge Phase 3's requirements into Phase 2. Remove Phase 3 from roadmap. | |

**User's choice:** Full validation in Phase 2 (Recommended)
**Notes:** Phase 3 remains in roadmap as a re-confirmation/sanity check pass, not the first validation.

---

## Build Failure Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fix in merge staging area | Fix issues, git add fixes, commit as ONE merge commit. Main never has a broken commit. | ✓ |
| Commit merge, fix in follow-ups | Commit even if build fails, create separate fix commits. Faster but messy history. | |
| Abort and retry | git merge --abort, adjust strategy, redo from scratch. Rerere replays resolutions. | |

**User's choice:** Fix in merge staging area (Recommended)
**Notes:** The merge commit on main is guaranteed to be a working state. All fixes are staged into the merge commit.

---

## Motion Normalization Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full repo sweep | Grep entire codebase for mixed m/motion imports and normalize ALL of them. Definitive. | ✓ |
| Only merge-touched files | Normalize only in conflict files and git-modified files. Faster but incomplete. | |
| You decide | Let Claude choose scope based on file count. | |

**User's choice:** Full repo sweep (Recommended)
**Notes:** No leftover `m` imports after Phase 2. Sweep happens after conflict resolution but before validation gate.

---

## Claude's Discretion

- Conflict resolution ordering within tiers
- git checkout --theirs vs manual editing for Tier 1-2 files
- Merge commit message content
- pnpm install --frozen-lockfile vs pnpm install

## Deferred Ideas

None — discussion stayed within phase scope
