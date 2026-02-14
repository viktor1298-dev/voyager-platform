# Voyager Platform — Modernization Roadmap 2026

> **עיקרון מנחה:** כל פיצ'ר חדש נבנה עם הכלים הכי מודרניים ל-2026. לא בונים ישן אוטומטית.

## Stack Audit — מה יש vs מה צריך

### ✅ כבר מודרני
| טכנולוגיה | סטטוס |
|-----------|--------|
| Next.js 16 (App Router, RSC) | חדש |
| tRPC 11 | חדש |
| Tailwind CSS | סטנדרט |
| Drizzle ORM | מודרני, מהיר |
| pnpm + Turborepo | בול מה שצריך |

### 🟡 עובד אבל יש יותר טוב

#### 1. Auth — JWT ידני → Better-Auth
- **מצב נוכחי:** JWT ידני + bcrypt + cookie management
- **2026:** Better-Auth — הבחירה המובילה. Lucia deprecated (הפך ל-guidelines בלבד)
- **יתרונות:** Drizzle adapter מובנה, Fastify plugin רשמי (`fastify-better-auth`), RBAC plugin, sessions DB, CSRF, OAuth, 2FA — הכל built-in
- **למה:** פחות באגים, zero boilerplate, DB-backed sessions במקום stateless JWT
- **עדיפות:** גבוהה — Phase 3.5

#### 2. State Management — localStorage → Zustand/Jotai
- **מצב נוכחי:** token ב-localStorage, no global state
- **2026:** Zustand או Jotai — קל, zero boilerplate, works with RSC
- **למה:** auth state, theme, notifications — הכל במקום אחד
- **עדיפות:** בינונית

#### 3. Real-time — Polling → Server-Sent Events (SSE)
- **מצב נוכחי:** tRPC queries עם refetch interval (polling)
- **2026:** tRPC subscriptions עם SSE — הserver דוחף updates בזמן אמת
- **למה:** K8s dashboard צריך live data. Polling כל 30 שניות = מיושן. SSE = instant updates, פחות traffic
- **עדיפות:** גבוהה — core feature של dashboard

#### 4. Tables — HTML ידני → TanStack Table v9
- **מצב נוכחי:** HTML tables ידניות
- **2026:** TanStack Table v9 — sorting, filtering, pagination, virtual scrolling, column resize מובנים
- **למה:** מקצועי, performant, לא צריך לכתוב sort/filter logic בעצמנו
- **עדיפות:** גבוהה — משפיע על כל הדפים

#### 5. Forms — Manual useState → TanStack Form v1 + Zod
- **מצב נוכחי:** useState לכל field
- **2026:** TanStack Form v1 — חדש ומודרני יותר מ-RHF, type-safe מובנה, framework agnostic, async validation, תואם TanStack ecosystem
- **Zod:** נשאר לschema validation (shared עם tRPC input)
- **למה:** Add Cluster form, Login form, User management — type-safe ומקצועי
- **עדיפות:** בינונית — Phase 3.5

#### 6. Animations — CSS בסיסי → Motion (Framer Motion)
- **מצב נוכחי:** CSS transitions בסיסיים
- **2026:** Motion — page transitions, layout animations, gesture support
- **למה:** UX premium. Dashboard cards, sidebar slide, page fade-in
- **עדיפות:** נמוכה-בינונית — polish

#### 7. Error Handling — בסיסי → Sonner + Error Boundaries + Retry
- **מצב נוכחי:** error מוצג בUI בצורה בסיסית
- **2026:** Sonner (toast notifications) + proper Error Boundaries + retry logic
- **למה:** "Connection lost, retrying..." במקום מסך שגיאה שבור
- **עדיפות:** בינונית

#### 8. Dark/Light Theme — Manual → next-themes
- **מצב נוכחי:** toggle ידני
- **2026:** next-themes — system preference detection + manual toggle + no flash on load
- **למה:** סטנדרט, 3 שורות קוד
- **עדיפות:** נמוכה (כבר עובד, שיפור קטן)

### 🔴 באמת מיושן

#### 9. Docker Build — Regular → Multi-stage Optimized
- **מצב נוכחי:** --no-cache כל פעם, builds של 3+ דקות
- **2026:** Multi-stage + layer caching + pnpm deploy --filter — builds של 30 שניות
- **למה:** חוסך זמן פיתוח משמעותי
- **עדיפות:** גבוהה מאוד — משפיע על כל cycle

#### 10. Monitoring — kubectl logs → OpenTelemetry
- **מצב נוכחי:** kubectl logs ידני
- **2026:** OpenTelemetry — traces, metrics, logs מובנים
- **למה:** הפלטפורמה שלנו מנטרת K8s אבל לא את עצמה. Meta.
- **עדיפות:** בינונית — after core features

---

## Implementation Plan

### שלב 1 — Phase 3.5: Auth & User Management (CURRENT)

**Backend (דימה):**
- [ ] Better-Auth setup (Fastify plugin + Drizzle adapter)
- [ ] Auth tables auto-generated (user, session, account, verification)
- [ ] RBAC plugin (`@better-auth/rbac`) — admin + viewer roles
- [ ] tRPC context with Better-Auth session
- [ ] Seed admin user
- [ ] Remove: jsonwebtoken, bcryptjs, jose

**Frontend (רון):**
- [ ] Zustand stores (auth, theme, notifications)
- [ ] TanStack Form v1 + Zod (login, add cluster, user management)
- [ ] Better-Auth client SDK (`createAuthClient`)
- [ ] AuthGuard rewrite (Zustand-based)
- [ ] Login page rewrite (TanStack Form)
- [ ] Middleware rewrite (Better-Auth session check)
- [ ] Logout button (full flow)
- [ ] User management page (admin only)
- [ ] Hide admin actions from viewer role

**Packages to add:**
```
better-auth, @better-auth/rbac, fastify-better-auth  (API)
better-auth/client, zustand, @tanstack/react-form     (Web)
```

**Packages to remove:**
```
jsonwebtoken, bcryptjs, jose  (replaced by Better-Auth)
```

### שלב 2 — שדרוג UI + Enterprise Features (CURRENT)

**Frontend — רון:**
- [ ] TanStack Table v9 — כל הטבלאות (clusters, deployments, events, users, alerts) עם sorting, filtering, pagination, column resize
- [ ] Sonner toast notifications — החלפת כל ה-error/success messages ב-toasts מקצועיים
- [ ] next-themes — שדרוג theme system (system preference detection, zero flash)
- [ ] cmdk — Command Palette (Ctrl+K) — חיפוש גלובלי + ניווט מהיר לכל הדפים/clusters/deployments
- [ ] Skeleton loading — החלפת loading spinners ב-skeleton screens
- [ ] Confirmation dialogs — AlertDialog לפעולות הרסניות (delete, restart)
- [ ] Keyboard shortcuts — R=refresh, N=new, /=search, ?=show shortcuts

**Backend — דימה:**
- [ ] Recharts — גרפים: CPU/memory trends, request rates, cluster health over time, uptime history
- [ ] TanStack Query integration — verify tRPC+TanStack Query caching, background refetch, optimistic updates
- [ ] API endpoints for metrics/charts data — time-series data for dashboard graphs
- [ ] Prefetching + stale-while-revalidate patterns

### שלב 3 — Real-time & Performance
- [ ] tRPC SSE subscriptions (live K8s data — instant pod crash alerts, deployment progress, live metrics, log streaming)
- [ ] Multi-stage Docker builds (3-4 min → 20-30 sec, image size 1GB → ~150MB, layer caching)
- [ ] Motion animations (page transitions, layout animations, exit animations, spring physics)
- [ ] Optimistic UI mutations (TanStack Query `onMutate` — instant UI feedback before server response)

### שלב 4 — Observability & Error Tracking
- [ ] **OpenTelemetry (OTel)** — Traces + Metrics + Logs unified. תקן התעשייה ב-2026. Datadog, Grafana, New Relic — כולם OTel native. Self-monitoring dashboard
- [ ] **Sentry** — Structured error tracking. Stack traces, user context, release tracking, source maps. SDK ל-Next.js + Fastify. כל חברה רצינית רצה Sentry
- [ ] **Audit Log** — מי עשה מה, מתי. "User X restarted pod Y at 14:32". SOC2 compliance, DB table with user/action/resource/timestamp. Better-Auth session context → automatic user attribution

### שלב 5 — Enterprise Features
- [ ] **Feature Flags (OpenFeature SDK)** — open standard, runtime toggles. Deploy ≠ release. Gradual rollout 1% → 10% → 100%. Zero-risk releases. LaunchDarkly/Unleash compatible
- [ ] **OpenAPI Schema** — tRPC 11 OpenAPI adapter. חשיפת REST API spec (Swagger). Third-party integrations, CLI tools, webhook consumers
- [ ] **Webhook & Integration Framework** — Slack alerts, PagerDuty, email, custom webhooks. Configurable per alert type/severity. Pluggable notification channels
- [ ] **Edge Caching / PPR** — Next.js 16 Partial Pre-Rendering. Dashboard shell loads instantly (200ms), data streams in. CDN strategy for static assets

### שלב 6 — AI & Collaboration (Wow Factor)
- [ ] **AI Assistant** — Natural language queries: "show me pods that crashed in the last hour". Ctrl+K → AI mode. Vercel v0, Linear, Raycast — כולם הוסיפו AI ב-2026
- [ ] **Real-time Presence** — "Viktor is viewing cluster X". Live cursors/indicators. Collaborative debugging
- [ ] **Shared Dashboards & Annotations** — Custom dashboard layouts, chart annotations ("CPU spike here = deploy v14"), team-shared views
- [ ] **Collaborative Incident Response** — Shared timeline, action items, post-mortem templates. Like PagerDuty/incident.io built into the platform

---

## Enterprise Readiness Checklist

| Requirement | Status | Phase |
|-------------|--------|-------|
| Authentication (Better-Auth + RBAC) | ✅ Done | 3.5 |
| Rate Limiting | ✅ Done | 1 |
| CORS + Security Headers | ✅ Done | 2 |
| Audit Log | ❌ Planned | 4 |
| Error Tracking (Sentry) | ❌ Planned | 4 |
| OpenTelemetry | ❌ Planned | 4 |
| Feature Flags | ❌ Planned | 5 |
| OpenAPI / REST API | ❌ Planned | 5 |
| Webhook Integrations | ❌ Planned | 5 |
| SOC2 Compliance Ready | ❌ Needs Audit Log + Sentry | 4 |
| Multi-tenant Support | ❌ Future | TBD |

---

*Created: 2026-02-14*
*Last updated: 2026-02-14*
