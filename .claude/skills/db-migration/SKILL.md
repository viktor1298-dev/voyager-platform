---
name: db-migration
description: "Generate Drizzle migration and update init.sql (schema source of truth for Helm deploys). Use when modifying database schema."
---

# Database Migration Workflow

When modifying the database schema, follow this exact sequence:

## Steps

1. **Edit schema** in `packages/db/src/schema/`
2. **Generate migration**: `pnpm db:generate`
3. **Push to local DB**: `pnpm db:push`
4. **Update init.sql**: Copy the relevant DDL to `charts/voyager/sql/init.sql`
   - init.sql must be idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS` for constraints)
   - init.sql recreates the full schema from scratch — it is the ONLY schema source for Helm deploys
5. **Typecheck**: `pnpm typecheck` across all packages — schema changes may break routers
6. **Verify**: Run `pnpm db:seed` to confirm seed data still works with the new schema
7. **Test affected routers**: Check that API endpoints using changed tables return correct data

## Iron Rules

- **NEVER** add `migrate()` or schema init calls to `server.ts` — the comment in server.ts says this explicitly
- init.sql is the deploy-time truth; Drizzle migrations are for local dev only
- New NOT NULL columns MUST have defaults or the seed/init will break
- Always update both the Drizzle schema AND init.sql in the same commit
