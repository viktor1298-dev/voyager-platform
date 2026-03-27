# Phase 2: SSE Streaming Endpoint - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Build a dedicated Fastify SSE endpoint that streams live K8s metrics for short ranges (<=15m) at 10-15s resolution. The MetricsStreamJob should poll K8s metrics-server only for clusters with active SSE subscribers (reference-counted). This is backend-only — no frontend consumers yet (Phase 3 wires the frontend).

Requirements: SSE-01, SSE-02

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key constraints from research:

- Follow existing SSE pattern from `apps/api/src/routes/ai-stream.ts` (raw `reply.raw.write()` on Fastify)
- Use `voyagerEmitter` EventEmitter for decoupling (existing pattern)
- Reference-counted polling: start K8s metrics-server poll on first subscriber, stop on last disconnect
- 10-15s poll interval for live metrics (configurable)
- SSE event format: `data: JSON.stringify({ clusterId, timestamp, cpu, memory, pods, networkBytesIn, networkBytesOut })`
- Heartbeat every 30s to keep connection alive
- Per-cluster streams (client subscribes to a specific clusterId)
- Do NOT use tRPC subscriptions (they require WebSocket transport)
- New route file: `apps/api/src/routes/metrics-stream.ts`
- New job file: `apps/api/src/jobs/metrics-stream-job.ts`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/routes/ai-stream.ts` — proven SSE pattern with Fastify raw response
- `apps/api/src/lib/event-emitter.ts` — `voyagerEmitter` for event decoupling
- `apps/api/src/lib/cluster-client-pool.ts` — `clusterClientPool.getClient(clusterId)` for K8s API access
- `apps/api/src/jobs/metrics-history-collector.ts` — existing K8s metrics collection logic (parseCpuToNano, parseMemToBytes)
- `apps/api/src/lib/k8s-units.ts` — CPU/memory parsing utilities

### Established Patterns
- Non-tRPC routes registered in `server.ts` via `fastify.register()`
- Background jobs started in `server.ts` with start/stop lifecycle
- SSE uses `reply.raw.write('data: ...\n\n')` with `Content-Type: text/event-stream`

### Integration Points
- Register new route in `apps/api/src/server.ts`
- Start/stop MetricsStreamJob in server lifecycle
- K8s metrics-server access via existing cluster-client-pool

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
