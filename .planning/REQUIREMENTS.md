# Requirements: Voyager Platform Reset & Stabilization

**Defined:** 2026-03-26
**Core Value:** Main branch is the single source of truth — all meaningful work merged, stale branches removed, project builds and passes tests.

## v1 Requirements

### Pre-Merge Safety

- [x] **SAFE-01**: Create recovery tags on main and feat/init-monorepo branch tips before any mutations
- [x] **SAFE-02**: Enable `git rerere` to record conflict resolutions for replay if merge needs retry
- [x] **SAFE-03**: Record all branch HEADs to `.planning/branch-tips.txt` for full recovery capability

### Merge & Conflict Resolution

- [x] **MERGE-01**: Execute `git merge --no-ff --no-commit origin/feat/init-monorepo` on main to stage all 54 commits
- [x] **MERGE-02**: Resolve 9 conflicting files using tiered strategy (trivial → accept-theirs → manual → heavy)
- [x] **MERGE-03**: Manually review auto-resolved files (server.ts, ClusterHealthWidget.tsx) for evil merge logic errors
- [x] **MERGE-04**: Normalize Motion imports (m vs motion convention) across 10+ diverged component files
- [x] **MERGE-05**: Verify init.sql contains all tables from both branches (nodeMetricsHistory schema risk)
- [x] **MERGE-06**: Commit the merge with a descriptive message referencing the 54-commit integration

### Validation Gate

- [x] **VALID-01**: `pnpm build` succeeds (TypeScript compilation for all packages)
- [x] **VALID-02**: `pnpm typecheck` passes (strict TypeScript checking)
- [x] **VALID-03**: `pnpm test` passes (Vitest unit tests across all packages)

### Push & Branch Cleanup

- [x] **CLEAN-01**: Push merged main to origin
- [x] **CLEAN-02**: Delete 22+ fully-merged remote branches (worktree/*, old feature branches, develop)
- [x] **CLEAN-03**: Evaluate fix/v117-phase-d-r2 unique commit (encryption key + connection-config schemas) — cherry-pick if relevant, document if discarded
- [x] **CLEAN-04**: Delete local branches that are no longer needed (claude/objective-shockley)
- [x] **CLEAN-05**: Verify all worktree/ron, worktree/dima commits are contained in feat/init-monorepo before deletion

### GitHub Protection

- [ ] **PROT-01**: Set up branch protection rules on main (require PR, prevent force push)
- [ ] **PROT-02**: Enable auto-delete of merged branches on GitHub

## v2 Requirements

### Extended Validation

- **VALID-04**: E2E tests (Playwright) pass against running instance
- **VALID-05**: Docker image builds succeed (Dockerfile.api, Dockerfile.web)
- **VALID-06**: Helm chart `helm template` renders cleanly

### Post-Stabilization

- **POST-01**: Update CLAUDE.md to reflect post-cleanup project state
- **POST-02**: Visual regression check on Sidebar and chart components
- **POST-03**: Audit E2E test selectors for post-merge accuracy (1-2 fix rounds expected)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New feature development | Stabilize first, then build |
| Code refactoring beyond merge fixes | Risk scope creep; merge-only changes |
| CI/CD pipeline setup | Separate initiative, not part of cleanup |
| Helm chart deployment to K8s | Requires cluster access, deferred |
| Rebase strategy | Ruled out — shared history, merge commits, PROJECT.md constraint |
| Force-pushing to main | Destructive, violates git safety constraint |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAFE-01 | Phase 1 | Complete |
| SAFE-02 | Phase 1 | Complete |
| SAFE-03 | Phase 1 | Complete |
| MERGE-01 | Phase 2 | Complete |
| MERGE-02 | Phase 2 | Complete |
| MERGE-03 | Phase 2 | Complete |
| MERGE-04 | Phase 2 | Complete |
| MERGE-05 | Phase 2 | Complete |
| MERGE-06 | Phase 2 | Complete |
| VALID-01 | Phase 3 | Complete |
| VALID-02 | Phase 3 | Complete |
| VALID-03 | Phase 3 | Complete |
| CLEAN-01 | Phase 4 | Complete |
| CLEAN-02 | Phase 4 | Complete |
| CLEAN-03 | Phase 4 | Complete |
| CLEAN-04 | Phase 4 | Complete |
| CLEAN-05 | Phase 4 | Complete |
| PROT-01 | Phase 5 | Pending |
| PROT-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
