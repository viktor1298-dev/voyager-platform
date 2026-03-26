# Phase 3: Validation Gate - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Re-confirm that the merged codebase (from Phase 2) provably compiles, type-checks, and passes all automated tests. This is a re-confirmation pass — Phase 2 already ran the full validation gate before committing. Phase 3 provides an independent verification on the committed state.

</domain>

<decisions>
## Implementation Decisions

### Validation Scope
- **D-01:** Run `pnpm build` — TypeScript compilation for all packages must succeed (exit 0)
- **D-02:** Run `pnpm typecheck` — strict TypeScript checking must pass (exit 0)
- **D-03:** Run `pnpm test` — all Vitest unit AND integration tests must pass (exit 0)

### Docker Requirement
- **D-04:** Docker MUST be running before tests. Run `docker compose up -d` to start PostgreSQL + Redis. All 128 tests must pass including the 3 health-check integration tests that require PostgreSQL.
- **D-05:** Zero tolerance — no skipped tests, no partial passes. The validation gate is definitive.

### Re-Confirmation Context
- **D-06:** This is a re-confirmation pass per Phase 2 decision D-04. Phase 2 already validated typecheck + build + 125/128 tests before committing. Phase 3 adds Docker-dependent tests and provides independent verification.

### Claude's Discretion
- Order of validation commands (typecheck → build → test or any order)
- Whether to run lint (not in success criteria, pre-existing failures are known)
- How to handle any new failures discovered (fix in follow-up commits)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 Results
- `.planning/phases/02-the-big-merge/02-03-SUMMARY.md` — Validation results from Phase 2 (what passed, what failed, what was fixed)
- `.planning/phases/02-the-big-merge/02-VERIFICATION.md` — Phase 2 verification report

### Project Context
- `.planning/PROJECT.md` — Core value (main is single source of truth)
- `.planning/REQUIREMENTS.md` — VALID-01, VALID-02, VALID-03 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml` at repo root — PostgreSQL 17 + TimescaleDB + Redis 7

### Established Patterns
- `pnpm build` runs Turborepo across all packages
- `pnpm typecheck` runs `tsc --noEmit` across all packages
- `pnpm test` runs Vitest across all packages

### Integration Points
- Phase 3 validates the state left by Phase 2's merge commit + follow-up fixes
- Phase 3 passing unlocks Phase 4 (Push & Branch Cleanup)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — run the standard validation commands and verify exit codes.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-validation-gate*
*Context gathered: 2026-03-26*
