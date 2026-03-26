📋 Code Review — Auth regression delta

📊 ציון: 9/10 CHANGES_REQUESTED

🔍 סיכום: The previous blocker is functionally satisfied: the login page now bypasses the logged-out grace redirect after a fresh session is established, and the new E2E covers the exact logout → stay on loggedOut page → re-login → clean exit flow. However, I found one adjacent architecture/config inconsistency: Helm values still document runtime API migration even though the codebase invariant is init.sql-only.

📝 ממצאים:

🔴 CRITICAL (0):
- None.

🟠 HIGH (0):
- None.

🟡 MEDIUM (1):
[MEDIUM] charts/voyager/values.yaml:23 — Migration comment conflicts with architecture invariant. File says migration is handled by API on startup, but apps/api/src/server.ts says no migrate() and schema is initialized by Helm sql/init.sql.
  Fix: Update the values.yaml comment to reflect the real deploy invariant (init.sql-only, no runtime migration).

🔵 LOW (1):
[LOW] tests/e2e/auth-betterauth.spec.ts:84,92 — New regression test uses fixed waitForTimeout(2_000) checks. This is acceptable for a timing-sensitive loop guard, but event-based assertions would be less flaky long-term.
  Fix: If this gets flaky in CI, replace sleeps with a poll/assert helper tied to stable URL/session state.

⚪ NITPICK (0):
- None.

✅ מה טוב:
- Login page adds an explicit bypass flag so a freshly restored session no longer gets trapped by the loggedOut grace window.
- The exact requested E2E scenario is now covered in tests/e2e/auth-betterauth.spec.ts.
- Safe returnUrl behavior remains covered by the adjacent protected-route logout/re-login test.
- No auth/security regression found in the reviewed delta.
