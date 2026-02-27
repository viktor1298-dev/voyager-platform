# Known Fixes Registry
Track every fix to prevent regressions. Foreman includes this in Review and QA tasks.

## How to use
- After every successful fix: append a row
- Reviewer: verify each row in this table still passes
- QA: flag any regression from this list immediately

| Version | Test/Issue | Fix Description | Files Changed | Status |
|---------|-----------|----------------|---------------|--------|
| v131 | pod-actions: skip when no live K8s | Added `test.skip` guard for env-blocked tests | `tests/e2e/pod-actions.spec.ts` | ✅ Active |
| v132 | alerts: empty state check | Replaced Promise.race with Playwright .or() | `tests/e2e/alerts.spec.ts` | ✅ Active |
