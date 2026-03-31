# Helm Release Row Enrichment

**Date:** 2026-03-31
**Status:** Approved

## Problem

The Helm tab release rows show empty chart version and inaccurate timestamps. The frontend `useHelmReleases` hook reads raw K8s secrets from the SSE/Zustand store, but Helm stores chart metadata as base64+gzip binary inside the secret — the browser can't decode it. The backend `helm.list` tRPC endpoint already decodes this data correctly, but the frontend doesn't call it.

## Solution

Hybrid data merge: keep SSE for live presence (instant status/revision updates), add a parallel `helm.list` tRPC query for decoded metadata (chartVersion, updatedAt). Merge by `namespace/name` key.

## Changes

### `apps/web/src/hooks/useHelmReleases.ts`

- Import tRPC client and call `helm.list` query with `staleTime: 60s`, `refetchInterval: 60s`, `enabled: !!clusterId`
- Merge SSE-derived releases with tRPC data:
  - SSE fields win for `status` and `revision` (more current)
  - tRPC fields win for `chartName`, `chartVersion`, `appVersion`, `updatedAt` (SSE can't decode these — SSE `updatedAt` is actually `secret.createdAt`, tRPC provides the real `info.last_deployed`)
- Union merge by `${namespace}/${name}` key — releases from either source appear. SSE-only releases show without chart metadata. tRPC-only releases (rare, during watch reconnect) show with full metadata.
- Pass `clusterId` to tRPC query (same input as existing SSE hook)
- Graceful degradation: if `helm.list` fails, SSE-only data shown as-is (no chart version, approximate timestamp). No error toast.
- Note: `staleTime: 60s` intentionally overrides the global 30s default — chart metadata changes infrequently. Effective staleness up to 90s (30s server cache + 60s client).

### `apps/web/src/app/clusters/[id]/helm/page.tsx`

No changes needed. The `ReleaseSummary` component already renders `chartName-chartVersion` conditionally and `timeAgo(updatedAt)`. These fields are just empty/inaccurate today — they'll populate once the hook provides real data.

### Backend

No changes. `helm.list` already returns `chartName`, `chartVersion`, `appVersion`, `updatedAt` (last_deployed).

## Data Flow

```
K8s Watch API (secrets)          helm.list tRPC (30s server cache)
         |                                |
    SSE -> Zustand store           TanStack Query (60s stale)
         |                                |
              useHelmReleases (merge by ns/name)
                      |
              ReleaseSummary component
```

## Row Layout

Before (data missing):
```
[icon] name                  deployed   rev 1                    —
```

After (data populated):
```
[icon] name   karpenter-1.1.1   deployed   rev 1          3d ago
```

## What stays the same

- SSE live-data pipeline: untouched
- Backend helm.ts router: untouched
- HelmRelease interface: unchanged (fields exist, just empty today)
- Expanded detail view: already uses helm.get tRPC
- ResourcePageScaffold usage: unchanged

## Estimated scope

~30 lines changed in `useHelmReleases.ts`.
