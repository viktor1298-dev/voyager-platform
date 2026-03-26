# Phase 2: The Big Merge - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Merge all 54 commits from feat/init-monorepo into main with conflict resolution, import normalization, and schema integrity preservation. This phase produces a single merge commit on main that is guaranteed to build, typecheck, and pass tests. No code refactoring beyond what is needed to resolve conflicts and normalize imports.

</domain>

<decisions>
## Implementation Decisions

### Merge Strategy
- **D-01:** Use `git merge --no-ff --no-commit origin/feat/init-monorepo` (carried from STATE.md)
- **D-02:** Follow the tiered conflict resolution strategy from ARCHITECTURE.md (Tier 1: accept-theirs for BOARD.md/pipeline-evidence, Tier 2: accept-theirs for E2E tests, Tier 3: manual merge for 1-conflict components, Tier 4: manual merge for heavy conflicts)

### Pre-Commit Validation
- **D-03:** Run FULL validation gate (pnpm install → typecheck → lint → build → test) BEFORE committing the merge. The merge commit on main must be a guaranteed working state.
- **D-04:** Phase 3 (Validation Gate) becomes a re-confirmation pass on the committed state, not the first validation.

### Build Failure Strategy
- **D-05:** If build/test fails after conflict resolution, fix issues within the merge staging area (git add fixes to the merge). All fixes are part of the ONE merge commit. Main never has a broken commit.
- **D-06:** Do NOT commit a broken merge and fix in follow-up commits. Do NOT abort and retry unless the merge is fundamentally unsalvageable.

### Motion Import Normalization
- **D-07:** Normalize ALL Motion imports in the entire repo to the `motion` convention (not `m`). Full repo sweep, not limited to merge-touched files.
- **D-08:** This is done AFTER conflict resolution but BEFORE the validation gate, so the sweep is included in the merge commit.

### Schema Integrity
- **D-09:** init.sql MUST contain 33 CREATE TABLE statements (nodeMetricsHistory preserved from main) — carried from ROADMAP success criteria
- **D-10:** metrics.ts: use main's version as structural base (has nodeTimeSeries, collector health), layer feat/init-monorepo's refinements (RBAC fix, timeline ranges) on top — from ARCHITECTURE.md

### Evil-Merge Review
- **D-11:** Manually review ALL auto-resolved files that were modified in both branches (server.ts, ClusterHealthWidget.tsx, and others listed in PITFALLS.md §Pitfall 2)
- **D-12:** Use `git diff` review after merge resolution — no need for dev server startup/visual testing (that's Phase 3's territory)

### Claude's Discretion
- Exact ordering of conflict resolution within tiers (can do all Tier 1 first, then Tier 2, etc.)
- Whether to use `git checkout --theirs` or manual editing for Tier 1-2 files (both are valid)
- How to structure the merge commit message (must be descriptive per ROADMAP SC #1)
- Whether to run `pnpm install --frozen-lockfile` first or `pnpm install` (depends on whether lockfile conflicts exist)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Merge Strategy & Conflict Resolution
- `.planning/research/ARCHITECTURE.md` — Full merge order of operations, per-file conflict resolution strategy (Tiers 1-4), rollback plan, anti-patterns
- `.planning/research/PITFALLS.md` — Critical pitfalls: nodeMetricsHistory schema divergence, semantic merge conflicts (evil merges), Motion import chaos

### Project Context
- `.planning/PROJECT.md` — Git safety constraints (no force-push, preserve history), merge-only strategy
- `.planning/REQUIREMENTS.md` — MERGE-01 through MERGE-06 acceptance criteria
- `.planning/research/STACK.md` — Tool recommendations and merge tooling

### Phase 1 Artifacts
- `.planning/phases/01-safety-net/01-CONTEXT.md` — Recovery tag decisions, branch-tips recording
- `.planning/branch-tips.txt` — All branch HEADs for recovery

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No code assets to reuse — this phase is pure git merge operations
- Recovery tags (`pre-merge-snapshot`, `pre-cleanup-feat`) are in place from Phase 1

### Established Patterns
- `git rerere` enabled — conflict resolutions will be recorded for replay if merge needs retry
- `.planning/` directory committed to git — all artifacts tracked

### Integration Points
- Merge result feeds into Phase 3 (Validation Gate) as a re-confirmation pass
- Merge result feeds into Phase 4 (Branch Cleanup) — worktree/ron and worktree/dima become provably redundant once feat/init-monorepo is merged
- Motion normalization sweep ensures Phase 3 won't find import inconsistencies

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow research-recommended approaches for all operations. The ARCHITECTURE.md research is based on an actual dry-run merge with empirical conflict counts.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-the-big-merge*
*Context gathered: 2026-03-26*
