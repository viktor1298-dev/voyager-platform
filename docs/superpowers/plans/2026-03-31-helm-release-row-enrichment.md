# Helm Release Row Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate chart version and last-deployed date in Helm release rows by merging SSE live data with tRPC decoded metadata.

**Architecture:** The `useHelmReleases` hook currently reads raw K8s secrets from the SSE/Zustand store — it gets live presence but can't decode Helm's binary format, leaving `chartName`/`chartVersion` empty and `updatedAt` wrong. We add a parallel `helm.list` tRPC query and merge both sources by `namespace/name` key. SSE drives liveness (status, revision), tRPC provides decoded fields (chart info, timestamps). No backend changes.

**Tech Stack:** React hooks, TanStack Query (via tRPC), Zustand

**Spec:** `docs/superpowers/specs/2026-03-31-helm-release-row-enrichment-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/hooks/useHelmReleases.ts` | Modify | Add tRPC query, merge logic |
| `apps/web/src/app/clusters/[id]/helm/page.tsx` | Modify | Add `chartName` to search filter |

No new files. No backend changes. The `HelmRelease` interface stays in `useHelmReleases.ts` — fields already exist.

---

### Task 1: Add tRPC query and merge logic to useHelmReleases

**Files:**
- Modify: `apps/web/src/hooks/useHelmReleases.ts`

- [ ] **Step 1: Add tRPC import and query**

Add the tRPC import and a `helm.list` query call inside the hook. Follow the pattern from `useCachedResources.ts` — `enabled: !!clusterId`, custom `staleTime`.

```typescript
import { trpc } from '@/lib/trpc'
```

Inside the hook, add after the SSE lines:

```typescript
const { data: trpcReleases } = trpc.helm.list.useQuery(
  { clusterId },
  {
    enabled: !!clusterId,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  },
)
```

- [ ] **Step 2: Build tRPC lookup map**

Inside the `useMemo`, after building the SSE release list, build a lookup map from the tRPC data for O(1) merge:

```typescript
// Build tRPC lookup for decoded metadata (chartName, chartVersion, updatedAt)
const trpcMap = new Map<string, NonNullable<typeof trpcReleases>[number]>()
if (trpcReleases) {
  for (const r of trpcReleases) {
    trpcMap.set(`${r.namespace}/${r.name}`, r)
  }
}
```

- [ ] **Step 3: Merge SSE releases with tRPC metadata + union merge**

Replace the current `.map()` return block. Assign SSE-derived list to a variable (not direct return), enrich with tRPC fields, then append any tRPC-only releases:

```typescript
// SSE-derived releases enriched with tRPC decoded metadata
const merged: HelmRelease[] = [...releaseMap.values()].map((s) => {
  const name = s.labels?.name ?? s.name
  const ns = s.namespace
  const trpcData = trpcMap.get(`${ns}/${name}`)

  return {
    name,
    namespace: ns,
    status: s.labels?.status ?? 'unknown',
    revision: parseInt(s.labels?.version ?? '0', 10),
    chartName: trpcData?.chartName ?? '',
    chartVersion: trpcData?.chartVersion ?? '',
    appVersion: trpcData?.appVersion ?? '',
    updatedAt: trpcData?.updatedAt ?? s.createdAt,
  }
})

// Union: add tRPC-only releases not in SSE (rare, during watch reconnect)
if (trpcReleases) {
  const sseKeys = new Set(merged.map((r) => `${r.namespace}/${r.name}`))
  for (const r of trpcReleases) {
    if (!sseKeys.has(`${r.namespace}/${r.name}`)) {
      merged.push({
        name: r.name,
        namespace: r.namespace,
        status: r.status,
        revision: r.revision,
        chartName: r.chartName,
        chartVersion: r.chartVersion,
        appVersion: r.appVersion,
        updatedAt: r.updatedAt,
      })
    }
  }
}

return merged
```

- [ ] **Step 4: Update useMemo dependencies**

Add `trpcReleases` to the `useMemo` dependency array:

```typescript
}, [secrets, trpcReleases])
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useHelmReleases.ts
git commit -m "feat: enrich helm release rows with chart version and deploy date via tRPC merge"
```

---

### Task 2: Add chartName to search filter

> **Spec deviation:** The spec says "No changes needed" to `page.tsx`, but now that `chartName` is populated, searching by chart name is a natural expectation. This is additive and low-risk.

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/helm/page.tsx:90-94`

- [ ] **Step 1: Add chartName to filterFn**

Now that `chartName` is populated, users should be able to search by chart name (e.g., typing "karpenter"). Update the `filterFn`:

```typescript
filterFn={(r, q) =>
  r.name.toLowerCase().includes(q) ||
  r.namespace.toLowerCase().includes(q) ||
  r.status.toLowerCase().includes(q) ||
  r.chartName.toLowerCase().includes(q)
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/clusters/[id]/helm/page.tsx
git commit -m "feat: add chart name to helm release search filter"
```

---

### Task 3: Build and verify

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: All pages compile, 0 errors

- [ ] **Step 2: Start dev servers and verify visually**

Run: `pnpm dev`

Navigate to a cluster's Helm tab. Verify:
- Release rows show chart version (e.g., `karpenter-1.1.1`) between name and status badge
- Release rows show relative timestamp (e.g., `3d ago`) on the right instead of `—`
- Search works for chart names
- SSE live indicator stays green
- Expanding a release still shows full detail view

- [ ] **Step 3: Final commit if any cleanup needed**
