# Helm Revision Values — Inline Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Helm revision rows clickable to expand inline and show per-revision YAML values.

**Architecture:** New `helm.revisionValues` backend endpoint decodes a specific revision's secret to extract values. Frontend adds accordion expand/collapse to revision rows in `HelmReleaseDetail.tsx`, fetching values on demand and rendering via existing `ValuesViewer`. Uses existing `expandVariants`/`chevronVariants` from animation-constants.

**Tech Stack:** tRPC, Zod, Motion (motion/react), ValuesViewer, cached()

**Spec:** `docs/superpowers/specs/2026-03-31-helm-revision-values-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/lib/cache-keys.ts:51` | Modify | Add `k8sHelmRevisionValues` cache key builder |
| `apps/api/src/routers/helm.ts:275` | Modify | Add `revisionValues` procedure to helmRouter |
| `apps/web/src/components/helm/HelmReleaseDetail.tsx:250-289` | Modify | Make revision rows expandable with values accordion |

No new files.

---

### Task 1: Add cache key and backend endpoint

**Files:**
- Modify: `apps/api/src/lib/cache-keys.ts:50-51`
- Modify: `apps/api/src/routers/helm.ts:275`

- [ ] **Step 1: Add cache key builder**

In `apps/api/src/lib/cache-keys.ts`, after the `k8sHelmRevisions` entry (line 51), add:

```typescript
  k8sHelmRevisionValues: (clusterId: string, name: string, ns: string, revision: number) =>
    `k8s:helm:revision-values:${clusterId}:${ns}:${name}:${revision}`,
```

- [ ] **Step 2: Add `revisionValues` procedure**

In `apps/api/src/routers/helm.ts`, add a new procedure inside the `helmRouter` object (before the closing `})` on line 275). This sits after the `revisions` procedure:

```typescript
  revisionValues: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        releaseName: z.string(),
        namespace: z.string(),
        revision: z.number().int().min(1),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const values = await cached(
          CACHE_KEYS.k8sHelmRevisionValues(
            input.clusterId,
            input.releaseName,
            input.namespace,
            input.revision,
          ),
          30,
          async () => {
            const response = await coreV1.listNamespacedSecret({
              namespace: input.namespace,
              labelSelector: `owner=helm,name=${input.releaseName},version=${input.revision}`,
            })

            const secret = response.items.find((s) => s.type === 'helm.sh/release.v1')
            if (!secret?.data?.release) {
              return {}
            }

            try {
              const release = decodeHelmRelease(secret.data.release)
              return (release.config as Record<string, unknown>) ?? {}
            } catch {
              return {}
            }
          },
        )

        return { values: values ?? {} }
      } catch (err) {
        handleK8sError(err, 'get helm revision values')
      }
    }),
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/cache-keys.ts apps/api/src/routers/helm.ts
git commit -m "feat: add helm.revisionValues endpoint for per-revision values"
```

---

### Task 2: Make revision rows expandable with values accordion

**Files:**
- Modify: `apps/web/src/components/helm/HelmReleaseDetail.tsx:250-289`

- [ ] **Step 1: Add imports**

At the top of the file, add `ChevronDown` to the lucide-react import (line 3), and add Motion imports:

```typescript
import { ChevronDown, Clock, Copy, FileText, GitBranch, Info, Package } from 'lucide-react'
```

Add after the existing imports (after line 9):

```typescript
import { AnimatePresence, motion } from 'motion/react'
import { expandVariants, chevronVariants, DURATION, EASING } from '@/lib/animation-constants'
```

- [ ] **Step 2: Add expandedRevision state**

Inside the `HelmReleaseDetail` component (after line 173 where `revisions` is defined), add:

```typescript
const [expandedRevision, setExpandedRevision] = useState<number | null>(null)

const revisionValuesQuery = trpc.helm.revisionValues.useQuery(
  { clusterId, releaseName, namespace, revision: expandedRevision! },
  {
    enabled: expandedRevision !== null,
    staleTime: 30_000,
  },
)
```

- [ ] **Step 3: Replace the Revisions tab content**

Replace the revisions tab content block (lines 254-289, the `content:` value for the revisions tab) with the new expandable version:

```typescript
      content: (
        <div className="space-y-1.5">
          {revisionsQuery.isLoading ? (
            <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
          ) : revisions.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">No revision history.</p>
          ) : (
            revisions.map((rev) => (
              <div key={rev.revision}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRevision(expandedRevision === rev.revision ? null : rev.revision)
                  }
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] w-full text-left cursor-pointer hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <span className="text-[12px] font-bold font-mono text-[var(--color-accent)] w-8 shrink-0">
                    #{rev.revision}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusColor(rev.status)}`}
                  >
                    {rev.status}
                  </span>
                  {rev.updatedAt && (
                    <span className="text-[11px] font-mono text-[var(--color-text-dim)] flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(rev.updatedAt)}
                    </span>
                  )}
                  {rev.description && (
                    <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1">
                      {rev.description}
                    </span>
                  )}
                  <motion.span
                    variants={chevronVariants}
                    animate={expandedRevision === rev.revision ? 'expanded' : 'collapsed'}
                    transition={{ duration: DURATION.fast, ease: EASING.default }}
                    className="shrink-0 text-[var(--color-text-dim)]"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {expandedRevision === rev.revision && (
                    <motion.div
                      key={`values-${rev.revision}`}
                      variants={expandVariants}
                      initial="collapsed"
                      animate="expanded"
                      exit="exit"
                      className="overflow-hidden"
                    >
                      <div className="ml-1 border-l-2 border-emerald-500/60 bg-black/20 rounded-r-lg mt-1 mb-2">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                            Values — Revision #{rev.revision}
                          </span>
                        </div>
                        <div className="px-4 py-3">
                          {revisionValuesQuery.isLoading ? (
                            <div className="space-y-2">
                              <div className="h-3 w-48 rounded bg-white/[0.06] animate-pulse" />
                              <div className="h-3 w-64 rounded bg-white/[0.04] animate-pulse" />
                              <div className="h-3 w-40 rounded bg-white/[0.04] animate-pulse" />
                            </div>
                          ) : (
                            <ValuesViewer
                              values={
                                (revisionValuesQuery.data?.values as Record<string, unknown>) ?? {}
                              }
                            />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      ),
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/helm/HelmReleaseDetail.tsx
git commit -m "feat: expandable revision rows with per-revision YAML values accordion"
```

---

### Task 3: Build and verify

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: All pages compile, 0 errors

- [ ] **Step 2: Restart dev servers and verify**

Restart API server (to pick up new endpoint): `pkill -f "tsx watch"; pnpm --filter api dev &`

Navigate to a cluster's Helm tab, expand a release (e.g., nginx-ingress), click the Revisions tab. Verify:
- Revision rows show chevrons (▼/▶)
- Clicking a revision expands to show YAML values with emerald left border
- Loading skeleton shows briefly before values appear
- Copy YAML button works
- Clicking the same revision collapses it
- Clicking a different revision collapses the previous and expands the new one
- Empty values show "No custom values configured" message
- 0 console errors

- [ ] **Step 3: Final commit if any cleanup needed**
