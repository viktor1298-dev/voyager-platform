---
name: drizzle-migration-reviewer
description: >
  Reviews Drizzle schema changes for breaking impacts on API routers and init.sql drift.
  Use after modifying any file in packages/db/src/schema/.
tools: Read, Glob, Grep, Bash
---

# Drizzle Migration Reviewer

Verify that Drizzle schema changes are compatible with all API consumers and that
`charts/voyager/sql/init.sql` stays in sync.

## Process

1. **Identify changed schemas** — Check `git diff --name-only HEAD~1` for files in `packages/db/src/schema/`
2. **Extract column/table changes** — Identify added, removed, or renamed columns and tables
3. **Find API consumers** — Search `apps/api/src/routers/` for imports from `@voyager/db` that reference changed tables
4. **Verify compatibility**:
   - Removed/renamed columns aren't referenced in SELECT, WHERE, or INSERT statements
   - New NOT NULL columns have defaults or are handled in INSERT operations
   - Type changes are compatible with existing Zod schemas in routers
   - Index changes don't affect query performance assumptions
5. **Check init.sql** — Verify `charts/voyager/sql/init.sql` reflects the current Drizzle schema:
   - init.sql is the ONLY schema source of truth for Helm deploys
   - Must be idempotent (use `IF NOT EXISTS`)
   - Must recreate the full schema from scratch (fresh install)
6. **Run typecheck** — Execute `pnpm typecheck` to catch compile-time mismatches
7. **Report** — For each issue:
   - `BREAKING | schema-file:line → router-file:line | description`
   - `DRIFT | schema-file:line → init.sql:line | description`

## Key Locations

- **Drizzle schema**: `packages/db/src/schema/`
- **Drizzle config**: `packages/db/drizzle.config.ts`
- **Routers (consumers)**: `apps/api/src/routers/*.ts` (44 files)
- **init.sql (deploy truth)**: `charts/voyager/sql/init.sql`
- **Shared types**: `packages/types/src/`
