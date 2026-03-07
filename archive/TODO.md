# Voyager Platform — Sub-Tasks

## Phase 1: Foundation
- [x] Sub-task 1: Initialize monorepo (pnpm + Turborepo + Biome)
- [x] Sub-task 2: Set up PostgreSQL + TimescaleDB (docker-compose for dev)
- [x] Sub-task 3: Drizzle ORM schemas (clusters, nodes, events tables)
- [x] Sub-task 4: tRPC router setup (Fastify adapter, context, base routers) ✅ validated
- [ ] Sub-task 5: Auth setup (Clerk integration, middleware)

## Phase 2: Core API
- [x] Sub-task 6: Cluster CRUD tRPC router (clusters.list, clusters.get, clusters.create) ✅ validated
- [ ] Sub-task 7: Metrics ingestion endpoint (REST for agent data)
- [ ] Sub-task 8: Redis + BullMQ setup (cache layer, job queue)

## Phase 3: Frontend Dashboard
- [x] Sub-task 9: tRPC client + providers + shadcn/ui setup + Dashboard page with summary cards & clusters grid ✅ validated
- [x] Sub-task 10: Cluster detail page (nodes table, events timeline, navigation) ✅ validated
- [ ] Sub-task 11: Layout + navigation (sidebar, header)
- [ ] Sub-task 12: Real-time updates (WebSocket / TanStack Query refetch)

## Phase 4: Infrastructure
- [ ] Sub-task 13: Dockerfiles (web + api, multi-stage)
- [ ] Sub-task 14: Helm chart (deployments, services, ingress)
- [ ] Sub-task 15: Deploy to Minikube + validate
- [ ] Sub-task 16: GitHub Actions CI pipeline

## Phase 5: Advanced Features
- [ ] Sub-task 17: FinOps cost dashboard
- [ ] Sub-task 18: Security posture scanning
- [ ] Sub-task 19: Alert management
- [ ] Sub-task 20: Go agent (voyager-monitor) — basic metrics collector
