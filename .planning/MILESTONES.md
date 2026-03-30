# Milestones

## v1.0 Live Data Pipeline (Shipped: 2026-03-30)

**Phases completed:** 4 phases, 8 plans, 17 tasks

**Key accomplishments:**

- Per-informer heartbeat timeout (90s) for silent death detection and EventEmitter listener pattern replacing fragile monkeypatch in watch-db-writer
- Eliminated TanStack Query polling for SSE-watched types on cluster detail pages, switched RelatedPodsList to Zustand store, added EventSource visibility-change reconnect, and created E2E test suite for live data pipeline
- Monotonic event IDs with 100-event ring buffer replay on reconnect and named heartbeat event for client-side monitoring
- Exponential backoff reconnect, client heartbeat dead-connection detection, and 1-second event buffer with Zustand batch flush for burst event handling
- Extended live watch pipeline from 15 to 17 K8s resource types (network-policies, resource-quotas), added watch health endpoint for lifecycle monitoring, and verified subscribe/unsubscribe chain
- Switched network-policies, resource-quotas, and Helm tabs from tRPC polling to Zustand store, removed DB fallback paths from Overview and Events pages, and added topology auto-refresh
- Removed 1312 lines of dead legacy watcher code (6 files), added 8 DB indexes on 5 tables, and enforced TypeScript build checks by disabling ignoreBuildErrors
- 8 database indexes added to events, nodes, audit_log, alert_history, and health_history tables for query performance optimization

---
