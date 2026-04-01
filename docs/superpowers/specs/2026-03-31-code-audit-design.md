# Code Audit — Full Codebase Scan

**Date:** 2026-03-31
**Purpose:** Parallel agent scan for duplications, hardcoded values, orphaned code, and inconsistencies across the entire voyager-platform monorepo.

## Approach: Hybrid (4 Domain + 1 Cross-Cutting)

5 parallel read-only agents, each scanning all 4 concern types within their scope.

## Agent Definitions

| # | Agent | Scope | Approximate Files |
|---|-------|-------|-------------------|
| 1 | api-routers | `apps/api/src/routers/`, `apps/api/src/routes/`, `apps/api/src/services/` | ~57 |
| 2 | api-core | `apps/api/src/lib/`, `apps/api/src/jobs/`, `apps/api/src/config/`, `apps/api/src/__tests__/`, `apps/api/src/server.ts` | ~80 |
| 3 | web-app | `apps/web/src/` (components, hooks, stores, lib, app pages) | ~150 |
| 4 | packages | `packages/db/`, `packages/config/`, `packages/types/`, `packages/ui/` | ~40 |
| 5 | cross-cutting | All scopes (selective reads) — cross-domain issues only | selective |

## Concern Types

1. **Duplications** — near-identical code blocks, copy-pasted logic, repeated patterns
2. **Hardcoded values** — magic numbers, URLs, ports, timeouts, string literals belonging in config
3. **Orphaned code** — unused exports, dead functions, unreferenced files, imports to nowhere
4. **Inconsistencies** — naming convention drift, pattern violations, mismatched approaches

## Severity Levels

- 🔴 **Critical** — could cause runtime errors, security issues, or data loss if touched incorrectly
- 🟡 **Warning** — code smell that increases maintenance burden or confusion
- 🔵 **Info** — improvement opportunity, low risk

## Agent Rules

### DO
- Read every file in scope before judging
- Check import/export chains to verify orphaned status
- Check if constants exist in `packages/config/` or `apps/api/src/config/` before flagging hardcoded values
- Include `file:line` references for every finding
- Note false positive awareness (similar but intentionally different code)

### DO NOT
- Suggest fixes or refactoring — report only
- Flag test files for duplication (legitimate setup repetition)
- Flag `packages/ui/` shadcn components as duplicated (generated)
- Scan `.next/`, `node_modules/`, or migration files
- Flag similar Zod schemas for different endpoints as duplicates

### Cross-Cutting Agent (Agent 5) Specific
- Compare type definitions in `packages/types/` against actual usage
- Find logic duplicated between `apps/api/src/lib/` and `apps/web/src/lib/`
- Check if routers define inline types already in `packages/types/`
- Verify `packages/config/` constants are used where hardcoded alternatives exist

## Output

Single file: `docs/code-audit-2026-03-31.md`

Structured by agent, then by concern type. Each finding includes severity, file:line, and description. Summary section at top with counts. Recommended actions section at bottom prioritized by risk.
