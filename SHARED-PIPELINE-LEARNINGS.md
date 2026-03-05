# Shared Pipeline Learnings

## [LEARN-20260305-001] best_practice

**Logged**: 2026-03-05T18:28:00+02:00
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
E2E test failures: always check the navigation URL first before fixing selectors or timeouts.

### Details
v188 had 2 failing E2E tests in optimistic-ui.spec.ts. We went through 3 fix iterations (h2→h1 selector, waitForURL timeout, DOM waitForSelector) before identifying the real root cause: `goto('/')` redirects away from `/clusters`, so the test never reaches the page it expects. The correct fix was simply `goto('/clusters')`.

### Suggested Action
When E2E tests fail on "element not found" or timeout: first verify the test navigates to the correct URL. Check redirect behavior before touching selectors or timeouts.

### Metadata
- Source: pipeline-consolidation
- Agent: foreman
- Wave: Phase-M v188
- Tags: e2e, flaky-tests, root-cause-analysis, fix-loop
