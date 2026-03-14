📋 Code Review — v206 targeted fixes

📊 ציון: 10/10 APPROVED

🔍 סיכום: Both scoped fixes are correct and aligned with the current auth/login behavior and DB schema. I found no architecture conflicts: logout now preserves the loggedOut login URL without forcing a refresh, and the seed now recreates deterministic admin/viewer users with viewer@voyager.local correctly assigned the viewer role.

📝 ממצאים:

🔴 CRITICAL (0):
- None.

🟠 HIGH (0):
- None.

🟡 MEDIUM (0):
- None.

🔵 LOW (0):
- None.

⚪ NITPICK (0):
- None.

✅ מה טוב:
- `apps/web/src/components/TopBar.tsx:47` removes the post-redirect `router.refresh()` that could re-trigger login-page session logic and break the intended loggedOut grace flow.
- `apps/web/src/app/login/page.tsx` already has explicit coverage for timestamped `loggedOutAt` handling and re-login redirect behavior; the TopBar change now matches that contract.
- `tests/e2e/auth-betterauth.spec.ts:72` covers the exact logout → loggedOut login URL → re-login path, so E2E parity is preserved.
- `packages/db/src/seed.ts` now imports `user`, clears it during reseed, and inserts deterministic `admin@voyager.local` and `viewer@voyager.local` rows with explicit roles.
- `packages/db/src/schema/auth.ts:11` defaults `user.role` to `viewer`, so explicit viewer seeding is schema-consistent and low risk.
- Architecture guard passed: `charts/voyager/values.yaml` keeps `migrate.enabled: false`, and no runtime migration conflict was introduced by this fix set.

💡 המלצות:
- Optional only: if seed data expands further, wrap destructive reseed steps in a transaction for stronger local reset guarantees.

```json
{"score":10,"verdict":"APPROVED","test_coverage_checked":true,"files_reviewed":["apps/web/src/components/TopBar.tsx","packages/db/src/seed.ts","apps/web/src/app/login/page.tsx","packages/db/src/schema/auth.ts","packages/db/src/schema/index.ts","charts/voyager/values.yaml","apps/api/src/server.ts","tests/e2e/auth-betterauth.spec.ts","tests/e2e/helpers.ts"],"lines_changed":19,"env_blocked_items":[],"findings":[]}
```
