# Voyager Platform — Project Reset & Stabilization

## What This Is

Voyager Platform is a Kubernetes operations dashboard (multi-cloud cluster management, monitoring, alerting, AI-assisted ops) built as a monorepo: Next.js 16 frontend + Fastify 5 backend + tRPC 11 + PostgreSQL + Redis. The project has accumulated significant git branch divergence and needs a full reset — merging 54 unmerged commits from `feat/init-monorepo` into `main`, cleaning up 27 remote branches, and stabilizing the codebase so it builds, tests pass, and main is the single source of truth.

## Core Value

**Main branch is the single source of truth** — all meaningful work is merged, stale branches are removed, the project builds and passes tests from a clean `main` checkout.

## Requirements

### Validated

- [x] SAFE-01, SAFE-02, SAFE-03 — Recovery tags, rerere, branch-tips snapshot (Validated in Phase 1: Safety Net)
- [x] MERGE-01 through MERGE-06 — 54-commit merge executed, 9 conflicts resolved, Motion normalized, init.sql 33 tables verified, evil-merge review clean (Validated in Phase 2: The Big Merge)
- [x] VALID-01, VALID-02, VALID-03 — Build, typecheck, 144/144 tests pass with Docker (Validated in Phase 3: Validation Gate)
- [x] CLEAN-01 through CLEAN-05 — Main pushed to origin, 26 stale branches deleted, fix/v117-phase-d-r2 documented and discarded, local branches cleaned (Validated in Phase 4: Push & Branch Cleanup)

### Active

- [x] Merge all 54 unmerged commits from `feat/init-monorepo` into `main` cleanly
- [x] Evaluate all 27 remote branches — delete fully-merged branches, flag branches with unmerged useful work
- [ ] Clean up stale worktree branches (`worktree/ron`, `worktree/dima`, `worktree/shiri`, `worktree/uri`, `worktree/yuval`, `worktree/beni`, `worktree/noam`, `worktree/lior`, and approved variants)
- [ ] Clean up old feature branches that are fully merged (`feat/api-improvements`, `feat/helm-infra`, `feat/k8s-live-dashboard`, `feat/phase6-ia-redesign`, `feat/ui-cluster-detail`, `feat/ui-cluster-groups`, `feat/ui-clusters-page`, `feat/ui-events-page`, `feat/ui-settings-page`, `fix/v117-phase-d-bugs`, `fix/v117-phase-d-r2`, `develop`)
- [x] Verify `pnpm build` succeeds on the merged `main` branch
- [x] Verify `pnpm test` (Vitest unit tests) passes
- [ ] Verify E2E tests pass (Playwright) against a running instance
- [x] Push the clean, merged `main` to `origin`
- [x] Ensure no work is lost — any unmerged branch with unique, valuable commits is preserved or documented

### Out of Scope

- New feature development — stabilize first, then build
- Docker image builds / Helm chart deployment verification — deferred to after stabilization
- CI/CD pipeline setup — not part of this cleanup
- Rewriting or restructuring code — only fixing what's broken to pass tests

## Context

- Project was developed on a different PC with an agent team (Ron, Dima, Shiri, etc.) using worktree-based parallel development
- `feat/init-monorepo` was the primary integration branch where worktree branches were merged
- `main` received periodic merges from `feat/init-monorepo` but stopped after v202 (merge base: `58a8407`)
- Since then, 54 commits of active development accumulated in `feat/init-monorepo` (v207-v225 work: UX fixes, E2E updates, DA2 batches, presence fixes)
- Meanwhile, `main` received 32 commits from other feature branches (Phases 4-6, sidebar polish, metrics, E2E fixes)
- The two branches have **diverged** and need careful merge conflict resolution
- Branches with unmerged commits to main: `feat/init-monorepo` (54), `worktree/ron` (50), `worktree/dima` (45), `fix/v117-phase-d-r2` (1)
  - Note: `worktree/ron` and `worktree/dima` commits are likely already included in `feat/init-monorepo` via merge commits

## Constraints

- **Git safety**: No force-pushing to main. Merge only — preserve full history.
- **No work loss**: Every branch must be evaluated before deletion. Document any discarded work.
- **Test baseline**: "Stable" = `pnpm build` + `pnpm test` + E2E tests all pass.
- **Local dev infra**: `docker compose up -d` needed for Postgres + Redis before testing.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Merge feat/init-monorepo into main (not rebase) | Preserve commit history, avoid rewriting shared history | -- Pending |
| Evaluate ALL branches before deletion | Prevent accidental work loss | -- Pending |
| Stabilize before adding features | Solid foundation prevents compounding issues | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after Phase 4 completion*
