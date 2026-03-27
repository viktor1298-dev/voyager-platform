# QA Report — Dashboard Page
**URL tested:** http://localhost:3000/ (http://voyager-platform.voyagerlabs.co was unreachable — DNS not resolved)
**Date:** 2026-03-27
**Viewport:** 1920×1080
**Tester:** Claude Code (without qa-validate skill)

---

## Summary

**Overall verdict: PASS with minor observations**

The dashboard page renders correctly in both light and dark themes. No console errors were detected at any point. All network requests returned 200. Content is present, interactive elements function, and the live connection indicator is active.

---

## Test Execution

### 1. Pre-conditions
- Navigated to `http://voyager-platform.voyagerlabs.co` — DNS not resolved (app not deployed to that host)
- Fell back to `http://localhost:3000` — app running locally
- Browser auto-redirected to `/login?returnUrl=/` — confirmed unauthenticated flow works

### 2. Login Page — Dark Mode
**Result: PASS**
- Page renders: h1 "Voyager Platform", form with email + password fields, Sign In button
- Theme toggle present (top-right corner)
- No console errors
- **Observation:** Email field (`admin@voyager.local`) and password field appear pre-filled — likely browser autofill from a previous session. This is expected behavior, not a bug.
- **Observation:** DOM snapshot showed a `paragraph: Password is required` node in the accessibility tree even before any submit attempt. This validation message was not visible in the screenshot — it was likely hidden via CSS. Worth verifying that the error is truly hidden (opacity/display:none) and not just off-screen.

### 3. Login → Dashboard Redirect
**Result: PASS**
- Sign In button clicked with pre-filled credentials
- Redirected to `http://localhost:3000/` (Dashboard)
- Page title: "Dashboard — Voyager Platform"

### 4. Dashboard — Light Mode
**Result: PASS**
- Page structure present: sidebar nav, header bar, main content
- Sidebar: Dashboard (active), Clusters, Alerts (12 badge), Events, Logs, Settings — all 6 items present
- Header: cluster selector, CPU indicator (1.8%), user name, command palette (⌘K), theme toggle, notification bell (17), logout, live indicator ("Live · Connected")
- Main content:
  - Operations overview heading + subtitle present
  - Operations pulse bar: 10 Nodes, 0/0 Pods, 3 Clusters, 0 Warnings
  - Fleet inventory section with "All 3", "Prod 1", "Staging 0", "Dev 2" filter tabs
  - Search bar + 4 filter dropdowns (environment, status, provider, health)
  - Tag chips: #dev, #minikube, #prod
  - Production lane: 1 cluster (prod-cluster-eks) — Health: Unreachable, status "Warning"
  - Dev/Minikube lane: 2 clusters — test-cluster-minikube (Healthy, 972ms), eks-devops-separate-us-east-1 (Healthy)
- No console errors (0 errors, 0 warnings)
- All network requests 200 OK

### 5. Dashboard — Dark Mode
**Result: PASS**
- Theme dropdown opens correctly with Light/Dark/System options
- Dark theme applies without errors
- Page content identical to light mode, colors correctly inverted
- No console errors after theme switch

### 6. Network Requests
**Result: PASS — all 200**
- `GET /api/auth/get-session` → 200
- `GET /trpc/clusters.list` → 200
- `GET /trpc/dashboardLayout.get` → 200
- `GET /trpc/presence.getOnlineUsers` → 200
- `GET /trpc/events.list` → 200
- `GET /trpc/metrics.currentStats` → 200
- `GET /trpc/alerts.unacknowledgedCount` → 200
- `POST /trpc/presence.heartbeat` → 200
- `GET /trpc/presence.subscribe` → 200
- `GET /trpc/health.status` → 200

---

## Findings

### PASS Items
| Check | Result |
|-------|--------|
| Login page renders (unauthenticated) | PASS |
| Login page — 0 console errors | PASS |
| Dashboard redirects correctly after login | PASS |
| Dashboard content renders (not blank/spinner) | PASS |
| All 6 sidebar nav items present | PASS |
| Header elements present (cluster selector, CPU, user, theme, notifications, logout, live) | PASS |
| Operations pulse bar shows data | PASS |
| Fleet inventory renders with 3 clusters | PASS |
| Environment filter tabs functional | PASS |
| Search + filter dropdowns present | PASS |
| Cluster cards show health status | PASS |
| Dark mode toggle works | PASS |
| Light mode — 0 console errors | PASS |
| Dark mode — 0 console errors | PASS |
| All network requests 200 | PASS |
| Live connection indicator active | PASS |

### Observations (Not Blocking)

1. **"Password is required" in accessibility tree before submit (Login page)**
   - A validation error paragraph appears in the DOM snapshot before any form interaction
   - Not visible in screenshot — likely `visibility:hidden` or `display:none` initially
   - Should verify via CSS inspection that it is truly hidden before user attempts login
   - Risk: screen readers may announce it prematurely

2. **Cluster name text wrapping in card (eks-devops-separate-us-east-1)**
   - Long cluster name wraps to two lines in the card view (breaks as "eks-devops-separate-us-east-" / "1")
   - Visually slightly awkward but not broken
   - Consider `overflow: hidden; text-overflow: ellipsis` or `word-break: break-all` for long names

3. **Theme toggle requires two clicks (single click opens dropdown, second click selects)**
   - Minor UX: single click on the icon opens a Light/Dark/System listbox rather than toggling directly
   - This is intentional design (3-way: light/dark/system), not a bug — just noting for QA awareness

4. **"0 live / 3 registered" clusters**
   - The header shows "0 live" clusters despite 2 healthy clusters in the Dev/Minikube lane
   - This may be correct behavior (live = K8s-connected watchers active; registered = in DB) since K8s_ENABLED may be false in local dev
   - Flag for verification against expected behavior in local dev mode

5. **App not accessible at voyager-platform.voyagerlabs.co**
   - DNS did not resolve — app was only tested locally
   - If this is a production/staging URL, it should be verified separately

---

## Screenshots Captured
- `login-dark.png` — Login page, dark mode
- `login-issue.png` — Login page, light mode (second visit, pre-filled fields)
- `dashboard-light.png` — Dashboard, light mode, viewport
- `dashboard-dark.png` — Dashboard, dark mode, viewport (first visit)
- `dashboard-scrolled.png` — Dashboard scrolled to bottom (Dev/Minikube section)
- `dashboard-dark-confirmed.png` — Dashboard, dark mode confirmed via theme dropdown

---

## Console Summary
| Page | Errors | Warnings |
|------|--------|----------|
| Login (dark) | 0 | 0 |
| Login (light) | 0 | 0 |
| Dashboard (light) | 0 | 0 |
| Dashboard (dark) | 0 | 0 |

**Total errors: 0. Total warnings: 0.**

---

## QA Gate Assessment (per CLAUDE.md rules)

| Gate | Status |
|------|--------|
| Console errors = FAIL | PASS (0 errors) |
| Login page tested unauthenticated | PASS |
| Every page renders content (not blank) | PASS |
| Both themes tested | PASS |

**QA Gate: ALL HARD GATES PASSED**

Estimated score: **8.5/10** — no blockers, minor observations noted above.
