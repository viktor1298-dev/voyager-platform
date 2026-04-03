---
name: seed-and-verify
description: >
  Reset and verify the local dev environment for voyager-platform. Wipes Docker volumes,
  restarts Postgres + Redis containers, waits for health, seeds the database with test data,
  ensures admin user exists, and runs the health check suite. Use this skill whenever the user
  says "reset dev", "reseed", "fresh start", "nuke and reseed", "seed and verify", "reset database",
  "start fresh", or when data is corrupted, schema changed, or docker containers are unhealthy.
disable-model-invocation: true
---

# Reset Local Dev Environment

Full reset of the local development environment with verification at each step.

## Prerequisites

- Docker Desktop running
- Working directory: voyager-platform monorepo root
- `.env` file exists with valid `DATABASE_URL` and `REDIS_URL`

## Execution Steps

Run these steps sequentially. Each step depends on the previous one succeeding.

### Step 1: Stop Dev Servers

Kill any running dev servers first to release port locks and database connections:

```bash
pkill -f 'tsx watch.*server\.ts' 2>/dev/null
pkill -f 'turbo dev' 2>/dev/null
pkill -f 'next dev.*port 3000' 2>/dev/null
lsof -ti:4001 | xargs kill 2>/dev/null
lsof -ti:3000 | xargs kill 2>/dev/null
sleep 1
```

Do NOT use `killall node` — it kills Docker port forwarding and MCP servers.

### Step 2: Wipe Docker Volumes & Restart

```bash
docker compose down -v
docker compose up -d
```

The `-v` flag removes `postgres_data` and `redis_data` volumes, giving a truly fresh start.
The init script (`charts/voyager/sql/init.sql`) auto-runs on fresh Postgres start, creating the full schema.

### Step 3: Wait for Container Health

Both containers have health checks. Wait for them before proceeding:

```bash
echo "Waiting for Postgres..."
until docker compose exec postgres pg_isready -U voyager -d voyager_dev 2>/dev/null; do sleep 2; done

echo "Waiting for Redis..."
until docker compose exec redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 2; done

echo "Both services healthy"
```

Typical wait time: 5-10 seconds. If Postgres takes longer than 30 seconds, check `docker compose logs postgres` for errors.

### Step 4: Seed Database

```bash
pnpm db:seed
```

This creates:
- **5 clusters** (minikube-dev, production-eks, staging-aks, analytics-gke, dev-k3s)
- **37 nodes** distributed across clusters (with mixed Ready/NotReady statuses)
- **30 events** (Warning + Normal types, various reasons like BackOff, FailedScheduling)
- **4 feature flags** (audit_log, sse_subscriptions, new_dashboard_layout, advanced_metrics)

The seed script preserves Better-Auth user tables if they exist, so it's safe to re-run.

### Step 5: Seed Admin User

```bash
pnpm --filter api seed:admin
```

Creates the default admin user: `admin@voyager.local` / `admin123` with `role=admin`.
This is idempotent — if the admin already exists, it's a no-op.

### Step 6: Health Check

```bash
pnpm health:check
```

Verifies:
- API responds on `http://localhost:4001/health`
- Docker services (postgres, redis) are running
- No error patterns in postgres/redis logs (FATAL, OOM, corruption)
- Web pages accessible at `http://localhost:3000` (/, /clusters, /login)

**Exit codes:** 0 = PASS, 1 = WARN (non-critical issues), 2 = FAIL (critical)

If health check reports WARN, review the output but it's usually safe to proceed.
If FAIL, check `docker compose logs` for the failing service.

### Step 7: Start Dev Servers

```bash
pnpm dev
```

Wait for both API and Web to be ready (API prints "Server listening on port 4001", Web prints "Ready").

## Quick Reference

| Step | Command | Expected Time |
|------|---------|---------------|
| Stop servers | pkill + lsof | 1s |
| Wipe & restart | docker compose down -v && up -d | 5-10s |
| Wait for health | pg_isready + redis-cli ping | 5-10s |
| Seed data | pnpm db:seed | 2-3s |
| Seed admin | pnpm --filter api seed:admin | 1-2s |
| Health check | pnpm health:check | 5-10s |
| Start dev | pnpm dev | 10-15s |
| **Total** | | **~30-50s** |

## Troubleshooting

**Port 4000/4001 conflict:** NoMachine uses port 4000. Check `.env` has `PORT=4001`.

**Postgres won't start:** Check `docker compose logs postgres`. Common issue: corrupted volume (the `-v` flag should fix this).

**Seed fails with "relation does not exist":** The init.sql didn't run. Check it's mounted: `docker compose exec postgres ls /docker-entrypoint-initdb.d/`. If missing, restart with `docker compose down -v && docker compose up -d`.

**Health check FAIL on web pages:** Web server may not be running. Start it with `pnpm --filter web dev` and re-run health check.

**Redis OOM:** Unlikely in dev, but if it happens: `docker compose exec redis redis-cli FLUSHALL` then restart.
