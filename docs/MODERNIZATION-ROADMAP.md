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

#### 1. Auth — JWT ידני → Better-Auth / Lucia v4
- **מצב נוכחי:** JWT ידני + bcrypt + cookie management
- **2026:** Better-Auth או Lucia v4 — auth library קלת משקל, self-hosted
- **למה:** פחות באגים (Secure flag, cookie sync, middleware), sessions/CSRF/OAuth/magic links מובנים
- **עדיפות:** גבוהה — לטפל ב-Phase 3.5 (Auth & User Management)

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

#### 5. Forms — Manual useState → React Hook Form + Zod
- **מצב נוכחי:** useState לכל field
- **2026:** React Hook Form + Zod — validation shared עם tRPC, zero re-renders
- **למה:** Add Cluster form, Login form — הכל פשוט יותר ו-type-safe
- **עדיפות:** בינונית

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

### שלב 1 — יוטמע עם Phase 3.5 (Auth & User Management)
- [ ] Better-Auth / Lucia v4 (במקום JWT ידני)
- [ ] React Hook Form + Zod (login + user forms)
- [ ] Zustand (auth state + theme + notifications)

### שלב 2 — שדרוג UI (מיד אחרי)
- [ ] TanStack Table v9 (כל הטבלאות)
- [ ] Sonner toast notifications
- [ ] next-themes (שדרוג theme system)

### שלב 3 — Real-time & Performance
- [ ] tRPC SSE subscriptions (live K8s data)
- [ ] Multi-stage Docker builds
- [ ] Motion animations (page transitions, cards)

### שלב 4 — Observability
- [ ] OpenTelemetry integration
- [ ] Self-monitoring dashboard

---

*Created: 2026-02-14*
*Last updated: 2026-02-14*
