# packages/db — Database Schema & ORM

Drizzle ORM schema package. Shared by API and used for migrations.

## Schema Source of Truth

**`charts/voyager/sql/init.sql`** is the authoritative schema — NOT these Drizzle files. The Drizzle schema in `src/schema/` mirrors init.sql for ORM type generation but init.sql is what runs in production and local docker compose.

## Schema Files

```
src/schema/
├── index.ts              # Re-exports all tables
├── clusters.ts           # Clusters, provider configs
├── nodes.ts              # Node inventory
├── events.ts             # K8s events
├── alerts.ts             # Alert rules + history
├── auth.ts               # Better-Auth tables (user, session, account, verification)
├── authorization.ts      # RBAC (roles, permissions, assignments)
├── audit-log.ts          # Audit trail
├── metrics-history.ts    # TimescaleDB hypertable for cluster metrics
├── node-metrics-history.ts # TimescaleDB hypertable for node metrics
├── dashboards.ts         # Custom dashboards
├── webhooks.ts           # Webhook configurations
├── feature-flags.ts      # Feature flag overrides
├── ai.ts                 # AI conversation history
├── anomalies.ts          # Anomaly detection results
├── health-history.ts     # Health check history
├── karpenter-cache.ts    # Karpenter data cache
├── sso.ts                # SSO provider configs
└── user-tokens.ts        # API tokens
```

## Adding a Table

1. Add `CREATE TABLE` to `charts/voyager/sql/init.sql` (source of truth)
2. Create matching Drizzle schema file in `src/schema/`
3. Re-export from `src/schema/index.ts`
4. Run `pnpm db:generate` to sync migrations

## Commands

```bash
pnpm db:generate    # Generate Drizzle migrations from schema changes
pnpm db:push        # Push schema directly to DB (dev only)
pnpm db:migrate     # Run pending migrations
pnpm db:seed        # Seed data (5 clusters, 37 nodes, 30 events)
```

## Gotchas

### Docker Compose Auto-Initializes Schema
`docker compose up -d` auto-runs `charts/voyager/sql/init.sql` on first start (mounted into `/docker-entrypoint-initdb.d/`). No manual `db:push` needed for local dev. The init.sql is fully idempotent (CREATE IF NOT EXISTS, ON CONFLICT DO NOTHING).

### TimescaleDB Extension Required
`init.sql` must include `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;` — the `time_bucket()` function used by the metrics router depends on it. If missing, all metrics queries fail silently with empty results.

### Fresh Install = Empty DB
After `helm install` with revision=1, the database is empty. Seed is required. Detection: `SELECT count(*) FROM users` returns 0.
