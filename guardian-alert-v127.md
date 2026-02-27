# 🚨 Guardian Alert — E2E v127 Root Cause (2026-02-27 04:04)

## Finding
E2E v127 failed 90/91 with "Cannot navigate to invalid URL" — ALL tests.

## Root Cause (CONFIRMED)
`playwright.config.ts` lives at REPO ROOT:
`/home/vkzone/.openclaw/workspace/voyager-worktree-yuval/playwright.config.ts`

But E2E agent ran Playwright from the `tests/` subdirectory:
`/home/vkzone/.openclaw/workspace/voyager-worktree-yuval/tests/`

→ Playwright did NOT find the config → no `baseURL` applied → `page.goto('/login')` = invalid relative URL.

## Fix Required (ONE LINE)
Run E2E from REPO ROOT:
```bash
cd /home/vkzone/.openclaw/workspace/voyager-worktree-yuval
BASE_URL=http://voyager-platform.voyagerlabs.co npx playwright test --reporter=json
```

NOT from `tests/` subdirectory.

## Action for Foreman
Spawn Yuval/E2E agent again with correct working directory = repo root.
This is NOT a code fix — just a runner path fix.
Expected result: most/all tests should pass.
