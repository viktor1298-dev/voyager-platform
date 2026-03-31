# Database & Caching Performance Audit Report

**Date:** 2026-03-31
**Scope:** PostgreSQL + Redis + Drizzle ORM layer in voyager-platform
**Auditor:** Claude Opus 4.6

---

## Executive Summary

The data layer is architecturally sound -- the WatchManager pattern (in-memory K8s informers with Redis/DB fallback) avoids most read-path latency issues. However, the audit uncovered **6 critical**, **9 high**, and **12 medium** severity issues across schema design, caching, query patterns, and connection management.

The most impactful findings are:

1. **TimescaleDB hypertables never created** -- `time_bucket()` works by accident on regular tables but forfeits all partitioning, compression, and retention benefits
2. **Critical cache TTL bugs** -- Helm and CRD routers pass 30,000 seconds (8.3 hours) as TTL instead of 30 seconds
3. **N+1 queries in watch-db-writer** -- Individual SELECT+INSERT per node and per event during sync
4. **No PostgreSQL pool tuning** -- Default `pg.Pool` settings with no connection limits, idle timeout, or health checks
5. **No cache stampede protection** -- Concurrent requests for the same expired key all execute the expensive fn()
6. **No data retention/cleanup** -- metrics_history, events, audit_log, health_history grow unboundedly

---

## 1. Database Schema Quality

### 1.1 TimescaleDB Hypertables Never Created

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `charts/voyager/sql/init.sql` |
| **Lines** | 1-622 (entire file) |

**Description:** The schema loads the TimescaleDB extension (line 3: `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`) and the metrics router uses `time_bucket()` (line 467 of metrics.ts), but **no table is ever converted to a hypertable**. The `metrics_history`, `node_metrics_history`, and `events` tables are regular PostgreSQL tables.

`time_bucket()` works on regular tables as a simple function, but without hypertables you lose:
- Automatic time-based partitioning (critical for query performance at scale)
- Chunk-level compression (10-20x storage savings)
- Continuous aggregates
- Automated retention policies
- Parallel chunk scans

**Suggested Fix:** Add to `init.sql` after table creation:

```sql
SELECT create_hypertable('metrics_history', 'timestamp', if_not_exists => TRUE,
  migrate_data => TRUE);
SELECT create_hypertable('node_metrics_history', 'timestamp', if_not_exists => TRUE,
  migrate_data => TRUE);
SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE,
  migrate_data => TRUE);

-- Retention policies (auto-drop old chunks)
SELECT add_retention_policy('metrics_history', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('node_metrics_history', INTERVAL '14 days', if_not_exists => TRUE);
SELECT add_retention_policy('events', INTERVAL '7 days', if_not_exists => TRUE);

-- Compression (after 2 days for metrics)
ALTER TABLE metrics_history SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'cluster_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('metrics_history', INTERVAL '2 days', if_not_exists => TRUE);
```

**Note:** The `events` table already has a composite PK `(id, timestamp)` which is hypertable-compatible -- the partitioning column is already part of the PK.

### 1.2 Missing Indexes on Foreign Keys

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `charts/voyager/sql/init.sql` |

The following FK columns lack indexes, which degrades JOIN and CASCADE DELETE performance:

| Table | Column | Missing Index |
|-------|--------|--------------|
| `session` | `user_id` | Needed for user deletion cascades and session lookups |
| `account` | `user_id` | Needed for user deletion cascades |
| `alert_history` | `alert_id` | Has composite index but no standalone FK index |
| `ai_conversations` | `user_id` | Needed for user-scoped queries |
| `ai_conversations` | `cluster_id` | Needed for cluster-scoped queries |
| `ai_recommendations` | `cluster_id` | Needed for cluster-scoped queries |
| `webhook_deliveries` | `webhook_id` | Needed for webhook list + deliveries JOIN |
| `user_tokens` | `user_id` | Needed for user token listing |
| `shared_dashboards` | `created_by` | Needed for user's dashboard listing |

**Suggested Fix:** Add indexes like:
```sql
CREATE INDEX IF NOT EXISTS "idx_session_user" ON "session" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_account_user" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_ai_conversations_user" ON "ai_conversations" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_ai_conversations_cluster" ON "ai_conversations" ("cluster_id");
CREATE INDEX IF NOT EXISTS "idx_ai_recommendations_cluster" ON "ai_recommendations" ("cluster_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_webhook" ON "webhook_deliveries" ("webhook_id");
CREATE INDEX IF NOT EXISTS "idx_user_tokens_user" ON "user_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_shared_dashboards_created_by" ON "shared_dashboards" ("created_by");
```

### 1.3 Missing Index on `audit_log.user_id`

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `charts/voyager/sql/init.sql`, line 419-421 |

The `audit_log` table has indexes on `timestamp` and `(resource_id, timestamp)` but none on `user_id`. The audit router's `list` endpoint filters by `userId` (audit.ts line 56).

**Suggested Fix:**
```sql
CREATE INDEX IF NOT EXISTS "idx_audit_log_user" ON "audit_log" ("user_id", "timestamp" DESC);
```

### 1.4 Missing NOT NULL on `audit_log.user_email`

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `charts/voyager/sql/init.sql`, line 412 |

`user_email` is nullable but should be NOT NULL for audit trail completeness. Every authenticated request has a user email.

### 1.5 No Data Retention Strategy

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `charts/voyager/sql/init.sql` |

The following tables grow unboundedly with no cleanup:
- `metrics_history` -- 1 row per cluster per minute = ~525,600 rows/cluster/year
- `node_metrics_history` -- 1 row per node per minute
- `events` -- every K8s event ever synced
- `health_history` -- health check records
- `audit_log` -- all audit entries
- `alert_history` -- all alert triggers
- `webhook_deliveries` -- all webhook attempts

**Suggested Fix:** Add cron-based cleanup or TimescaleDB retention policies. For non-hypertables:
```sql
-- Example: scheduled cleanup in a background job
DELETE FROM health_history WHERE checked_at < NOW() - INTERVAL '30 days';
DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '90 days';
DELETE FROM alert_history WHERE triggered_at < NOW() - INTERVAL '30 days';
DELETE FROM webhook_deliveries WHERE delivered_at < NOW() - INTERVAL '30 days';
```

### 1.6 `clusters.nodesCount` Redundant with `nodes` Table

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `charts/voyager/sql/init.sql`, line 108 |

The `clusters` table has a `nodes_count` column but the cluster list endpoint actually counts rows from the `nodes` table (clusters.ts line 201-208). This denormalized column is only updated by `watch-db-writer` and can drift out of sync.

---

## 2. Query Pattern Issues

### 2.1 N+1 Queries in watch-db-writer `syncNodes()`

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `apps/api/src/lib/watch-db-writer.ts`, lines 54-111 |

Each node sync iteration performs:
1. One SELECT per node to check existence (line 77-81)
2. One UPDATE or INSERT per node (lines 83-110)

For a cluster with 100 nodes, this is 200 individual DB calls per sync cycle.

**Suggested Fix:** Use Drizzle's `onConflictDoUpdate` for batch upsert:
```typescript
// Build all values at once
const nodeValues = rawNodes.map(node => ({ clusterId, name, status, ... }))
// Single upsert query
await db.insert(nodes)
  .values(nodeValues)
  .onConflictDoUpdate({
    target: [nodes.clusterId, nodes.name],
    set: { status, role, cpuCapacity, ... }
  })
```

**Note:** This requires adding a UNIQUE constraint on `(cluster_id, name)` to the nodes table (it already has an index `idx_nodes_cluster_name` but not a unique constraint).

### 2.2 N+1 Queries in watch-db-writer `syncEvents()`

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `apps/api/src/lib/watch-db-writer.ts`, lines 122-161 |

Each event sync:
1. One SELECT per event to check existence (lines 135-139)
2. One INSERT per new event (lines 141-159)

For a cluster producing 500 events, this is up to 1000 DB calls.

**Suggested Fix:** Batch insert with `ON CONFLICT DO NOTHING`:
```typescript
const eventValues = rawEvents.filter(e => e.metadata?.uid).map(event => ({
  id: event.metadata!.uid!,
  clusterId,
  namespace: event.metadata?.namespace ?? null,
  kind: event.type ?? 'Normal',
  ...
}))
// Single batch insert, skip existing
await db.insert(events).values(eventValues).onConflictDoNothing()
```

### 2.3 N+1 in Webhooks List

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `apps/api/src/routers/webhooks.ts`, lines 51-69 |

The `webhooks.list` endpoint fetches all webhooks, then for EACH webhook, performs a separate query for its last 10 deliveries (line 55-59). With 20 webhooks, this is 21 DB queries.

**Suggested Fix:** Use a single query with a JOIN or lateral subquery:
```typescript
const rows = await ctx.db
  .select()
  .from(webhooks)
  .leftJoin(webhookDeliveries, eq(webhookDeliveries.webhookId, webhooks.id))
  .orderBy(desc(webhooks.createdAt))
```
Or use a window function to get top-N deliveries per webhook.

### 2.4 `metrics.clusterHealth` Fetches All Rows Into Memory

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `apps/api/src/routers/metrics.ts`, lines 147-149 |

```typescript
const rows = await db
  .select()
  .from(healthHistory)
  .where(gte(healthHistory.checkedAt, timeline.start))
  .orderBy(healthHistory.checkedAt)
```

For a 7-day range with 5-minute checks across 10 clusters, this loads ~20,160 rows into Node.js memory and buckets them in JavaScript. The same applies to `resourceUsage` (lines 193-199) and `alertsTimeline` (lines 278-282).

**Suggested Fix:** Push bucketing to the database using `time_bucket()` (which is already used in `metrics.history`):
```sql
SELECT
  time_bucket('1 hour', checked_at) AS bucket,
  count(*) FILTER (WHERE status = 'healthy') AS healthy,
  count(*) FILTER (WHERE status = 'degraded') AS degraded,
  count(*) AS total
FROM health_history
WHERE checked_at >= $1
GROUP BY bucket
ORDER BY bucket
```

### 2.5 `metrics.currentStats` Sequential Cluster Loop

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `apps/api/src/routers/metrics.ts`, lines 330-391 |

The `currentStats` endpoint iterates over ALL clusters sequentially (line 341: `for (const cluster of allClusters)`), making K8s API calls to each one. With 10 clusters and a 15s timeout per cluster, worst case is 150 seconds.

**Suggested Fix:** Use `Promise.allSettled()` to parallelize cluster metrics collection:
```typescript
const results = await Promise.allSettled(
  allClusters.map(cluster => collectClusterMetrics(cluster.id))
)
```

### 2.6 Full-Table `SELECT *` on Several Queries

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Files** | Multiple routers |

Several queries use `select().from(table)` (selecting all columns) when only a subset is needed:

| Router | Endpoint | Table | Columns Actually Used |
|--------|----------|-------|----------------------|
| `alerts.ts:33` | `alerts.list` | `alerts` | Full row returned to client |
| `alerts.ts:82` | `alerts.evaluate` | `alerts` | Only needs `id`, `metric`, `operator`, `threshold`, `clusterFilter` |
| `health.ts:166` | `health.status` | `clusters` | Only needs `id`, `name`, `provider`, `healthStatus`, `lastHealthCheck` |
| `clusters.ts:185` | `clusters.list` | `clusters` | Strips `connectionConfig` after fetch -- better to never select it |
| `nodes.ts:20` | `nodes.list` | `nodes` | Full row (acceptable for a list endpoint) |

**Suggested Fix:** Use column-specific selects, especially for `clusters.list` which currently fetches `connectionConfig` (potentially large JSONB with encrypted credentials) only to strip it.

### 2.7 Dashboard `list` Missing DISTINCT

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `apps/api/src/routers/dashboard.ts`, lines 144-157 |

The dashboard list query JOINs `shared_dashboards` with `dashboard_collaborators` but uses `select()` not `selectDistinct()`. If a user has multiple collaborator entries (theoretically impossible due to PK, but defensive coding), duplicates could appear.

---

## 3. Redis Caching Issues

### 3.1 Critical TTL Bug: Helm and CRD Routers Pass Seconds as Milliseconds

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `apps/api/src/routers/helm.ts`, lines 113-114, 168-169, 232-233 |
| **File** | `apps/api/src/routers/crds.ts`, line 59, 97 |

The `cached()` function uses `redis.setEx()` which expects TTL in **seconds**. Multiple routers pass large numbers that are clearly intended as milliseconds:

```typescript
// helm.ts line 113-114
cached(CACHE_KEYS.k8sHelmReleases(input.clusterId), 30_000, async () => { ... })
// Actual TTL: 30,000 seconds = 8.3 HOURS (intended: 30 seconds)

// crds.ts line 59
cached(CACHE_KEYS.k8sCrds(input.clusterId), 30_000, async () => { ... })
// Actual TTL: 30,000 seconds = 8.3 HOURS

// crds.ts line 97
cached(CACHE_KEYS.k8sCrdInstances(...), 15_000, async () => { ... })
// Actual TTL: 15,000 seconds = 4.2 HOURS
```

Also in topology.ts line 93:
```typescript
cached(CACHE_KEYS.k8sTopology(input.clusterId), 15_000, () => ...)
// Actual TTL: 15,000 seconds = 4.2 HOURS
```

This is explicitly called out in `apps/api/CLAUDE.md` as a known gotcha but these instances were never fixed.

**Suggested Fix:** Change all `30_000` to `30` and `15_000` to `15`:
```typescript
cached(CACHE_KEYS.k8sHelmReleases(input.clusterId), 30, async () => { ... })
cached(CACHE_KEYS.k8sCrds(input.clusterId), 30, async () => { ... })
```

### 3.2 No Cache Stampede Protection

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `apps/api/src/lib/cache.ts`, lines 21-36 |

The `cached()` function has no lock or dedup mechanism. When the cache expires, if 50 concurrent requests hit the same key, all 50 will execute `fn()` simultaneously (all see a cache miss), then all 50 will write the result to Redis.

For expensive operations like `listPodForAllNamespaces()` across K8s API, this causes a thundering herd problem.

**Suggested Fix:** Implement a simple in-process promise dedup (singleflight pattern):
```typescript
const inflight = new Map<string, Promise<unknown>>()

export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const redis = await getRedisClient()
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit) return JSON.parse(hit)
    } catch {}
  }

  // Dedup: if another caller is already computing this key, piggyback
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fn().finally(() => inflight.delete(key))
  inflight.set(key, promise)

  const result = await promise
  if (redis) {
    try { await redis.setEx(key, ttl, JSON.stringify(result)) } catch {}
  }
  return result
}
```

### 3.3 Redis Client Singleton Lost on Error

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `apps/api/src/lib/cache.ts`, lines 10-12 |

```typescript
client.on('error', (err) => {
  console.warn('Redis error:', err)
  client = null  // Destroys the client reference
})
```

On ANY Redis error (including transient network blips), the client is set to `null`. The next `getRedisClient()` call creates a new connection. This means:
- Transient errors cause connection churn
- Under load, multiple errors could create multiple simultaneous connections
- The old connection is never explicitly closed (potential leak)

**Suggested Fix:** Use Redis client's built-in reconnection instead of recreating:
```typescript
const client = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
  }
})
client.on('error', (err) => console.warn('Redis error:', err))
// Don't set client = null; let the reconnect strategy handle it
```

### 3.4 Inline Cache Keys Violate CACHE_KEYS Pattern

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Files** | 9 routers |

The CLAUDE.md states: "Never construct cache key strings inline -- use CACHE_KEYS." However, 9 routers use inline strings:

| File | Line | Key Pattern |
|------|------|-------------|
| `ingresses.ts` | 25 | `` `k8s:${input.clusterId}:ingresses` `` |
| `cronjobs.ts` | 25 | `` `k8s:${input.clusterId}:cronjobs` `` |
| `daemonsets.ts` | 27 | `` `k8s:${input.clusterId}:daemonsets` `` |
| `jobs.ts` | 25 | `` `k8s:${input.clusterId}:jobs` `` |
| `hpa.ts` | 25 | `` `k8s:${input.clusterId}:hpa` `` |
| `secrets.ts` | 25 | `` `k8s:${input.clusterId}:secrets` `` |
| `pvcs.ts` | 25 | `` `k8s:${input.clusterId}:pvcs` `` |
| `statefulsets.ts` | 27 | `` `k8s:${input.clusterId}:statefulsets` `` |
| `configmaps.ts` | 25 | `` `k8s:${input.clusterId}:configmaps` `` |

Additionally, `statefulsets.ts` lines 64, 100, 134 and `daemonsets.ts` lines 64, 95 use inline key strings for cache invalidation after mutations.

**Suggested Fix:** Add missing entries to `cache-keys.ts` and use them in all routers.

### 3.5 No Cache Invalidation on Data Mutation

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | Multiple routers |

Several mutation endpoints invalidate caches inconsistently:

| Mutation | Invalidation | Issue |
|----------|-------------|-------|
| `pods.delete` | Invalidates 3 pod cache keys | Good |
| `deployments.restart/scale/delete` | Invalidates global deployments key only | Missing per-cluster key invalidation |
| `statefulsets.restart/scale/delete` | Invalidates statefulsets cache | Good |
| `clusters.create/update/delete` | Calls `invalidateK8sCache()` (SCAN all k8s:*) | Overly broad -- invalidates all K8s caches for all clusters |
| `health.check` | No cache invalidation | Health history endpoint returns stale data |

### 3.6 `invalidateK8sCache()` Uses SCAN Which Can Be Slow

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `apps/api/src/lib/cache.ts`, lines 46-63 |

`invalidateK8sCache()` uses `SCAN` to find all keys matching `k8s:*` and deletes them. This is O(N) across all Redis keys. With many clusters and resource types, this could be hundreds of keys. Consider using a more targeted invalidation by cluster ID.

---

## 4. Connection Pool Management

### 4.1 PostgreSQL Pool Has No Configuration

| Field | Value |
|-------|-------|
| **Severity** | CRITICAL |
| **File** | `packages/db/src/client.ts`, lines 8-10 |

```typescript
const pool = new pg.Pool({ connectionString })
```

The pool uses `pg.Pool` defaults which are:
- `max`: 10 connections (may be too low for 43 routers + background jobs)
- `idleTimeoutMillis`: 10,000ms (10s)
- `connectionTimeoutMillis`: 0 (infinite -- will hang forever on connection failure)
- No statement timeout
- No health check (`allowExitOnIdle` is false by default)

**Suggested Fix:**
```typescript
const pool = new pg.Pool({
  connectionString,
  max: 20,                        // Tune based on Postgres max_connections / replicas
  idleTimeoutMillis: 30_000,      // Close idle connections after 30s
  connectionTimeoutMillis: 5_000, // Fail fast if can't get connection in 5s
  statement_timeout: 30_000,      // Kill queries running over 30s
  allowExitOnIdle: true,          // Let process exit when pool is idle
})

// Log pool errors
pool.on('error', (err) => {
  console.error('[pg-pool] Unexpected error on idle client', err)
})
```

### 4.2 No PostgreSQL Connection Cleanup on Shutdown

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `apps/api/src/server.ts`, lines 299-320 |

The graceful shutdown handler stops watchers, jobs, and Fastify, but **never closes the PostgreSQL pool**:

```typescript
process.on(signal, async () => {
  watchManager.stopAll()
  stopWatchDbWriter()
  stopAlertEvaluator()
  stopMetricsHistoryCollector()
  metricsStreamJob.stopAll()
  // ...
  await app.close()
  // *** Missing: await pool.end() ***
  process.exit(0)
})
```

This leaves active/idle PG connections open during shutdown, which can cause connection leaks if the process doesn't terminate cleanly.

**Suggested Fix:** Export the pool from `@voyager/db` and call `pool.end()` in the shutdown handler.

### 4.3 Redis Connection Not Closed on Shutdown

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `apps/api/src/server.ts` (shutdown handler) |

Similar to PostgreSQL, the Redis client is never explicitly closed during shutdown. The `getRedisClient()` pattern creates a singleton that should be `.quit()`-ed.

### 4.4 ClusterClientPool Has No Max-Age Cleanup

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `apps/api/src/lib/cluster-client-pool.ts`, lines 64-74 |

The LRU eviction only triggers when the pool hits `CLIENT_POOL_MAX` (50). There's no periodic sweep of expired entries. A cluster that was used once 4 hours ago still occupies a slot until the pool is full. This is low severity since the check at line 45 (`if (cached.expiresAt > now)`) handles staleness on access.

---

## 5. Data Integrity Issues

### 5.1 Missing UNIQUE Constraint on `nodes(cluster_id, name)`

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `charts/voyager/sql/init.sql`, lines 113-129 |

The `nodes` table has an index `idx_nodes_cluster_name` on `(cluster_id, name)` but no UNIQUE constraint. This means:
- `watch-db-writer` can accidentally insert duplicate nodes if two sync cycles race
- The upsert in `nodes.upsert` (nodes.ts:89) manually checks existence instead of using `ON CONFLICT`

**Suggested Fix:**
```sql
ALTER TABLE nodes ADD CONSTRAINT nodes_cluster_name_unique
  UNIQUE (cluster_id, name);
```

### 5.2 `connectionConfig` Stored as Plaintext JSONB When Encryption Key Missing

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **File** | `apps/api/src/routers/clusters.ts`, lines 28-34 |

```typescript
const isEncryptionEnabled = /^[0-9a-fA-F]{64}$/.test(K8S_CONFIG.ENCRYPTION_KEY)
function encryptConnectionConfig(config) {
  if (!isEncryptionEnabled) return config  // ← stored as plaintext
}
```

If `CLUSTER_CRED_ENCRYPTION_KEY` is missing or invalid, connection configs (which may contain cloud credentials, kubeconfig data, access tokens) are stored as plaintext JSONB. The server only logs a warning (server.ts line 44-46) but continues running.

**Suggested Fix:** In production, refuse to start if the encryption key is invalid. Add an environment check:
```typescript
if (process.env.NODE_ENV === 'production' && !isEncryptionEnabled) {
  throw new Error('CLUSTER_CRED_ENCRYPTION_KEY is required in production')
}
```

### 5.3 Credential Encryption Uses Static Format, No Key Rotation

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **File** | `apps/api/src/lib/credential-crypto.ts` |

The AES-256-GCM implementation is cryptographically sound (random IV, auth tag), but:
- No key version is stored with the ciphertext -- key rotation would require decrypting/re-encrypting all rows
- No key derivation function -- the raw hex key is used directly as the AES key

**Suggested Fix:** Prefix ciphertext with a key version: `v1:iv:authTag:ciphertext`

### 5.4 `account` Table Missing Composite Unique on `(user_id, provider_id)`

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `charts/voyager/sql/init.sql`, lines 32-46 |

The `account` table has no unique constraint preventing multiple accounts for the same provider per user. Better-Auth may handle this at the application level, but a DB constraint would be safer.

### 5.5 `events` Table Uses UUID for `id` but K8s UIDs Are Not Standard UUIDs

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `apps/api/src/lib/watch-db-writer.ts`, line 131 |

The watch-db-writer uses `event.metadata?.uid` as the event `id`. K8s UIDs are UUID-like but the column is typed as `uuid` with `defaultRandom()`. If a K8s UID doesn't conform to UUID format, the insert will fail silently.

---

## 6. Performance Recommendations

### 6.1 Add Materialized View for Cluster Health Dashboard

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM (performance enhancement) |
| **Benefit** | Eliminates 3 full-table scans on `health_history` for dashboard load |

The dashboard home page triggers `clusterHealth`, `resourceUsage`, and `uptimeHistory` simultaneously. All three scan `health_history` or `metrics_history` with different aggregation logic.

**Suggested Fix:** Create a TimescaleDB continuous aggregate:
```sql
CREATE MATERIALIZED VIEW health_hourly
  WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', checked_at) AS bucket,
  cluster_id,
  count(*) FILTER (WHERE status = 'healthy') AS healthy,
  count(*) FILTER (WHERE status = 'degraded') AS degraded,
  count(*) AS total
FROM health_history
GROUP BY 1, 2;
```

### 6.2 Batch Node Metrics History Insert

| Field | Value |
|-------|-------|
| **Severity** | LOW (already implemented) |
| **File** | `apps/api/src/jobs/metrics-history-collector.ts`, lines 172-195 |

Good practice: the metrics collector already uses a single batch insert for `nodeMetricsHistory.values(nodeValues)`. This is the correct pattern -- the watch-db-writer should adopt it too.

### 6.3 Consider `CONCURRENTLY` for Index Creation

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `charts/voyager/sql/init.sql` |

All indexes use `CREATE INDEX IF NOT EXISTS` which takes a lock on the table. For production deployments, use `CREATE INDEX CONCURRENTLY IF NOT EXISTS` to avoid blocking writes. Note: this cannot be run inside a transaction block.

### 6.4 Add Partial Index for Active Alerts

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **File** | `charts/voyager/sql/init.sql`, alert_history section |

The `alerts.evaluate` endpoint (alerts.ts line 82) only queries `enabled = true` alerts. A partial index would speed this up:
```sql
CREATE INDEX IF NOT EXISTS "idx_alerts_enabled" ON "alerts" ("enabled")
  WHERE "enabled" = true;
```

### 6.5 Connection Pool Sizing Guidance

| Field | Value |
|-------|-------|
| **Current** | pg.Pool default of 10 connections |
| **Recommended** | 20-25 connections |

The API has 43 routers, multiple background jobs (metrics collector, alert evaluator, watch-db-writer), and SSE streams. Under load, 10 connections can become a bottleneck. PostgreSQL's default `max_connections` is 100, so 20-25 per API pod is reasonable for 2-4 pods.

---

## Summary Table

| # | Severity | Category | Issue | File |
|---|----------|----------|-------|------|
| 1.1 | CRITICAL | Schema | TimescaleDB hypertables never created | `init.sql` |
| 2.1 | CRITICAL | Query | N+1 in watch-db-writer syncNodes() | `watch-db-writer.ts:54-111` |
| 2.2 | CRITICAL | Query | N+1 in watch-db-writer syncEvents() | `watch-db-writer.ts:122-161` |
| 3.1 | CRITICAL | Cache | TTL bug: 30,000 seconds instead of 30 | `helm.ts`, `crds.ts`, `topology.ts` |
| 4.1 | CRITICAL | Pool | PG pool has no configuration | `client.ts:8-10` |
| 5.2 | HIGH | Security | connectionConfig plaintext when key missing | `clusters.ts:28-34` |
| 1.5 | HIGH | Schema | No data retention strategy | `init.sql` |
| 2.3 | HIGH | Query | N+1 in webhooks list | `webhooks.ts:51-69` |
| 2.4 | HIGH | Query | Full table scan for health bucketing | `metrics.ts:147-149` |
| 3.2 | HIGH | Cache | No stampede protection | `cache.ts:21-36` |
| 3.3 | HIGH | Cache | Redis client lost on error | `cache.ts:10-12` |
| 4.2 | HIGH | Pool | PG pool not closed on shutdown | `server.ts:299-320` |
| 5.1 | HIGH | Integrity | Missing UNIQUE on nodes(cluster_id, name) | `init.sql:113-129` |
| 1.2 | MEDIUM | Schema | Missing FK indexes (9 tables) | `init.sql` |
| 1.3 | MEDIUM | Schema | Missing audit_log user_id index | `init.sql:419-421` |
| 2.5 | MEDIUM | Query | Sequential cluster loop in currentStats | `metrics.ts:330-391` |
| 2.6 | MEDIUM | Query | Full SELECT * when subset needed | Multiple routers |
| 3.4 | MEDIUM | Cache | Inline cache keys violate pattern | 9 routers |
| 3.5 | MEDIUM | Cache | Inconsistent cache invalidation | Multiple routers |
| 4.3 | MEDIUM | Pool | Redis not closed on shutdown | `server.ts` |
| 5.3 | MEDIUM | Security | No encryption key rotation support | `credential-crypto.ts` |
| 6.1 | MEDIUM | Perf | Should use continuous aggregates | `metrics.ts` |
| 1.4 | LOW | Schema | audit_log.user_email nullable | `init.sql:412` |
| 1.6 | LOW | Schema | Redundant nodesCount column | `init.sql:108` |
| 2.7 | LOW | Query | Dashboard list missing DISTINCT | `dashboard.ts:144-157` |
| 3.6 | LOW | Cache | SCAN-based invalidation is O(N) | `cache.ts:46-63` |
| 4.4 | LOW | Pool | No periodic cleanup of expired pool entries | `cluster-client-pool.ts` |
| 5.4 | LOW | Integrity | Missing unique on account(user_id, provider_id) | `init.sql:32-46` |
| 5.5 | LOW | Integrity | UUID type vs K8s UID format mismatch | `watch-db-writer.ts:131` |
| 6.4 | LOW | Perf | Missing partial index for enabled alerts | `init.sql` |
| 6.5 | LOW | Perf | Pool sizing guidance | `client.ts` |

---

## Priority Action Items

### Immediate (fix before next deploy)
1. Fix Helm/CRD/Topology cache TTL bugs (30_000 -> 30, 15_000 -> 15)
2. Add PG pool configuration (max, timeouts)
3. Close PG pool and Redis in shutdown handler

### Short-term (next sprint)
4. Batch upserts in watch-db-writer (syncNodes, syncEvents)
5. Add missing FK indexes
6. Add UNIQUE constraint on nodes(cluster_id, name)
7. Add cache stampede protection (singleflight pattern)
8. Fix Redis client error handling (use reconnect strategy)
9. Centralize remaining inline cache keys

### Medium-term (next milestone)
10. Create TimescaleDB hypertables + retention policies
11. Add data retention cleanup job for non-hypertables
12. Push metric bucketing to SQL (replace JS-side aggregation)
13. Parallelize currentStats cluster loop
14. Fail-fast in production if encryption key is missing
