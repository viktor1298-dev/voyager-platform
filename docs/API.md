# Voyager API Documentation

Base URL: `/trpc`

All endpoints use tRPC protocol. Queries use GET, mutations use POST.

## Authentication

JWT-based. Obtain a token via `auth.login`, then pass it as `Authorization: Bearer <token>` header.

---

## `auth` Router

### `auth.login` (mutation)
Authenticate and receive a JWT token.

**Input:**
```json
{ "password": "string" }
```

**Output:**
```json
{ "token": "string" }
```

### `auth.me` (query) 🔒
Get current authenticated user info.

**Output:**
```json
{ "role": "admin" }
```

---

## `clusters` Router

### `clusters.list` (query)
List all clusters from the database.

**Output:** `Cluster[]`

### `clusters.get` (query)
Get a single cluster by ID.

**Input:**
```json
{ "id": "uuid" }
```

**Output:** `Cluster`

### `clusters.live` (query)
Get live cluster metrics from the Kubernetes API (cached in Redis).

**Output:** Real-time cluster health data including node count, pod count, CPU/memory usage.

### `clusters.liveNodes` (query)
Get live node-level metrics from the Kubernetes API.

**Output:** Per-node resource utilization data.

### `clusters.metrics` (query)
Get cluster metrics with time range filtering.

**Input:**
```json
{ "clusterId": "uuid", "range": "1h | 6h | 24h | 7d" }
```

### `clusters.invalidateCache` (mutation) 🔒
Force-refresh cached cluster data from the Kubernetes API.

### `clusters.create` (mutation) 🔒
Register a new cluster.

### `clusters.update` (mutation) 🔒
Update cluster configuration.

### `clusters.delete` (mutation) 🔒
Remove a cluster.

---

## `nodes` Router

### `nodes.list` (query)
List all nodes with optional filtering.

**Input:**
```json
{ "clusterId": "uuid (optional)" }
```

**Output:** `Node[]` with status, CPU, memory, pod capacity.

### `nodes.get` (query)
Get a single node by ID.

**Input:**
```json
{ "id": "uuid" }
```

### `nodes.update` (mutation) 🔒
Update node metadata.

---

## `deployments` Router

### `deployments.list` (query)
List all deployments across namespaces.

**Output:** `DeploymentInfo[]` — name, namespace, replicas, image, status.

### `deployments.scale` (mutation) 🔒
Scale a deployment to a target replica count.

**Input:**
```json
{ "name": "string", "namespace": "string", "replicas": "number" }
```

### `deployments.restart` (mutation) 🔒
Trigger a rolling restart of a deployment.

**Input:**
```json
{ "name": "string", "namespace": "string" }
```

---

## `events` Router

### `events.list` (query)
List Kubernetes events with filtering and pagination.

**Input:**
```json
{
  "namespace": "string (optional)",
  "type": "Normal | Warning (optional)",
  "limit": "number (optional)",
  "offset": "number (optional)"
}
```

### `events.dismiss` (mutation) 🔒
Mark an event as dismissed.

### `events.stats` (query)
Get event counts grouped by type.

---

## `alerts` Router

### `alerts.list` (query)
List all configured alerts.

**Output:** `Alert[]` — id, name, condition, threshold, enabled.

### `alerts.create` (mutation) 🔒
Create a new alert rule.

**Input:**
```json
{
  "name": "string",
  "metric": "cpu | memory | pods",
  "operator": "gt | lt | eq",
  "threshold": "number",
  "enabled": "boolean"
}
```

### `alerts.update` (mutation) 🔒
Update an existing alert rule.

### `alerts.delete` (mutation) 🔒
Delete an alert rule.

**Input:**
```json
{ "id": "uuid" }
```

---

## `health` Router

### `health.status` (query)
Get overall platform health status (API, database, Redis, Kubernetes connectivity).

**Output:**
```json
{
  "api": "ok",
  "database": "ok | error",
  "redis": "ok | error",
  "kubernetes": "ok | error"
}
```

### `health.check` (query)
Run a health check for a specific component.

### `health.update` (mutation) 🔒
Manually update health status for a component.

---

## `logs` Router

### `logs.stream` (query)
Stream container logs for a specific pod.

**Input:**
```json
{
  "namespace": "string",
  "pod": "string",
  "container": "string (optional)",
  "tailLines": "number (optional, default: 100)"
}
```

### `logs.list` (query)
List available pods for log viewing.

**Input:**
```json
{ "namespace": "string (optional)" }
```

---

## Error Handling

All errors follow tRPC error format:

```json
{
  "error": {
    "code": "UNAUTHORIZED | NOT_FOUND | BAD_REQUEST | INTERNAL_SERVER_ERROR",
    "message": "Human-readable error description"
  }
}
```

🔒 = Requires authentication (JWT Bearer token)
