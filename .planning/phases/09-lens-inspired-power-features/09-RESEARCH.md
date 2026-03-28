# Phase 9: Lens-Inspired Power Features - Research

**Researched:** 2026-03-28
**Domain:** Kubernetes Dashboard Power Features (Pod Terminal, YAML/Diff, Helm, RBAC, CRDs, Network Policies, Resource Quotas, Events Timeline, Topology Map)
**Confidence:** HIGH

## Summary

Phase 9 transforms Voyager Platform from a read-only K8s dashboard into a Lens-alternative with interactive operational capabilities. The phase spans 14 features across 5 technical domains: (1) WebSocket-based pod terminal, (2) SSE-based live log streaming, (3) universal YAML/Diff viewer, (4) workload mutations (restart/scale/delete), (5) new cluster-level pages (Helm, CRDs, RBAC, Network Policies, Resource Quotas, Events Timeline, Topology Map).

The codebase is well-prepared for this phase. Phase 8 established the ExpandableCard/DetailTabs component library, ResourcePageScaffold pattern, GroupedTabBar navigation, and reference-counted K8s informers via ResourceWatchManager. The existing deployments router already implements restart and scale mutations, providing a proven pattern. The SSE streaming infrastructure (metrics-stream, resource-stream routes) provides the template for log streaming. The primary technical risk is the pod terminal WebSocket integration -- this is the first WebSocket in the codebase.

**Primary recommendation:** Build in dependency order: shared infrastructure first (YAML viewer, diff viewer, action toolbar), then per-resource enhancements, then new standalone pages (Helm, CRDs, RBAC, Network Policies, Resource Quotas), then complex visualizations (topology map, events timeline, network policy graph) last.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01**: Extend existing GroupedTabBar with "Cluster Ops" group (Helm, CRDs, RBAC), add Network Policies to Networking, Resource Quotas to Config
- **D-02**: Pod Terminal as VS Code-style bottom drawer with tabbed terminals, xterm.js + WebSocket
- **D-03**: Universal YAML viewer as DetailTab on every ExpandableCard, read-only syntax-highlighted with copy
- **D-04**: Live log streaming enhances existing Logs tab with SSE follow mode, pause-on-hover
- **D-05**: Action toolbar in detail panel header, right-aligned alongside DetailTabs
- **D-06**: Tiered confirmation -- Delete: type-name-to-confirm, Restart: single confirm dialog, Scale: inline input
- **D-07**: Helm releases read-only with ExpandableCard pattern, namespace-grouped, DetailTabs [Info][Values][Revisions][Resources]
- **D-08**: Events timeline as horizontal swim lane visualization, toggle between timeline and existing cards view
- **D-09**: Resource topology map using React Flow, Ingress->Service->Pod->Node graph with clickable hyperlinks
- **D-10**: Network policy graph using React Flow, pods/namespaces as nodes, policies as directed edges
- **D-11**: RBAC viewer as permission matrix grid (rows=subjects, columns=resources, cells=CRUD)
- **D-12**: Resource quotas as gauge dashboard with per-namespace cards using ResourceBar pattern
- **D-13**: CRD browser with two-level navigation (CRD list -> instances) using ExpandableCard
- **D-14**: Resource diff as side-by-side comparison (current vs last-applied annotation)
- **D-15**: Port forward as copy kubectl command only (no actual proxy)
- **D-16**: All existing tabs gain YAML tab, Diff tab, action toolbar, and live data

### Claude's Discretion
- Graph layout algorithms for topology map and network policy graph (dagre, elk, or custom)
- xterm.js theme and color scheme (should match existing dark/light mode)
- Exact YAML syntax highlighting color tokens (follow existing log syntax patterns)
- Events timeline time range presets and zoom levels
- CRD schema rendering approach (JSON Schema display)
- Whether to show Helm hooks/tests in release details
- Animation details for new drawer/panel components (follow B-style animation constants)

### Deferred Ideas (OUT OF SCOPE)
- Helm upgrade/rollback mutations
- Actual port forwarding proxy
- AI-powered cluster insights
- Resource topology as default Overview replacement
- Real-time graph updates (animate topology as resources change)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LENS-01 | Web terminal into any pod via kubectl (xterm.js + WebSocket) | xterm.js v6 + @xterm/addon-fit, @fastify/websocket v11, @kubernetes/client-node K8s.Exec class, PassThrough streams |
| LENS-02 | Real-time log streaming via SSE (not polling) with follow mode | Existing SSE pattern (metrics-stream.ts), K8s readNamespacedPodLog with follow:true, ReadableStream |
| LENS-03 | Resource YAML/JSON viewer with syntax highlighting and copy | K8s API raw resource fetch, custom CSS-based YAML tokenizer, Clipboard API |
| LENS-04 | Restart and scale for Deployments/StatefulSets/DaemonSets | Existing restart/scale pattern in deployments router, patch annotation + patch replicas |
| LENS-05 | Helm releases list with chart version, app version, status, values viewer | K8s Secrets with type=helm.sh/release.v1, gzip+base64 decode pattern |
| LENS-06 | Events timeline visualization | Existing events tRPC router data, custom horizontal timeline with swim lanes |
| LENS-07 | Resource diff -- compare current vs desired state | kubectl.kubernetes.io/last-applied-configuration annotation parsing, react-diff-viewer-continued |
| LENS-08 | Port forward command copy | kubectl port-forward command generation from pod metadata |
| LENS-09 | CRD browser -- view any custom resource | ApiextensionsV1Api + CustomObjectsApi from @kubernetes/client-node |
| LENS-10 | RBAC viewer -- permission matrix | RbacAuthorizationV1Api: ClusterRoles, ClusterRoleBindings, Roles, RoleBindings |
| LENS-11 | Network policy graph | NetworkingV1Api: listNetworkPolicyForAllNamespaces, React Flow visualization |
| LENS-12 | Resource quotas dashboard | CoreV1Api: listResourceQuotaForAllNamespaces, existing ResourceBar component |
| LENS-13 | All existing tabs with live data | Phase 8 ResourceWatchManager already provides real-time K8s informers for 15 resource types |
| LENS-14 | Build and typecheck pass with 0 errors | Incremental compilation verification per plan |
</phase_requirements>

## Standard Stack

### Core (New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xterm/xterm` | 6.0.0 | Web terminal emulator for pod terminal | Industry standard, used by VS Code, GitHub Codespaces, Google Cloud Shell |
| `@xterm/addon-fit` | 0.11.0 | Auto-resize terminal to container | Official xterm.js addon, handles dimension calculation |
| `@xterm/addon-web-links` | 0.12.0 | Clickable URLs in terminal output | Official addon, common UX expectation |
| `@fastify/websocket` | 11.2.0 | WebSocket support for Fastify 5 | Official Fastify plugin, wraps `ws` library, integrates with Fastify lifecycle |
| `@xyflow/react` | 12.10.2 | Graph visualization for topology map and network policy graph | React-native graph rendering, MIT license, ~45KB gzipped |
| `@dagrejs/dagre` | 3.0.0 | Graph layout algorithm for automatic node positioning | Fast directed graph layout, standard choice for topology visualization |
| `react-diff-viewer-continued` | 4.2.0 | Side-by-side diff visualization | GitHub-style diff viewer, syntax highlighting support, maintained fork |
| `yaml` | 2.8.3 | YAML parsing and serialization | Standard YAML library for JS, handles all YAML features including anchors |

### Already Installed (Reuse)

| Library | Version | Purpose | How Reused |
|---------|---------|---------|------------|
| `@kubernetes/client-node` | 1.4.0 | K8s API access (terminal, RBAC, CRD, NetworkPolicy, ResourceQuota) | K8s.Exec class for pod terminal, new API clients for RBAC/CRD/etc |
| `react-resizable-panels` | ^4.7.6 | Resizable panel for terminal bottom drawer | VS Code-style drag handle between main content and terminal |
| `motion` | ^12.38.0 | Animations (B-style) | Drawer slide-up, tab transitions, graph node animations |
| `recharts` | ^3.8.1 | Charts (resource quotas gauge if needed) | Reuse for any gauge/bar visualizations |
| `lucide-react` | ^1.7.0 | Icons | Terminal, copy, scale, restart, delete icons |
| `sonner` | ^2.0.7 | Toast notifications | Copy feedback, action success/error toasts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@xyflow/react` | `vis-network` or D3 | React Flow has native React integration, custom nodes, and Minimap; D3 requires imperative DOM manipulation |
| `@dagrejs/dagre` | `elkjs` | dagre is faster and simpler; elk offers better layouts for complex graphs but adds ~200KB. Use dagre first, upgrade if layout quality insufficient |
| `react-diff-viewer-continued` | `monaco-editor` diff | Monaco is 5MB+; react-diff-viewer is ~30KB and purpose-built for inline diffs |
| `yaml` | `js-yaml` | `yaml` has better TypeScript support and handles YAML 1.2; `js-yaml` is YAML 1.1 only |
| Custom YAML highlighter | `react-syntax-highlighter` / `prism-react-renderer` | Custom CSS-based tokenizer is lighter (~50 LOC), reuses existing `--color-log-*` CSS vars, avoids 200KB+ highlighter library |

**Installation:**
```bash
# Web app (frontend)
pnpm --filter web add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xyflow/react @dagrejs/dagre react-diff-viewer-continued yaml

# API (backend)
pnpm --filter api add @fastify/websocket
```

**Version verification:** All versions confirmed via `npm view` on 2026-03-28.

## Architecture Patterns

### Recommended Project Structure (New Files)

```
apps/api/src/
  routers/
    helm.ts                  # Helm releases (read-only)
    crds.ts                  # CRD browser
    rbac.ts                  # RBAC viewer
    network-policies.ts      # Network policies
    resource-quotas.ts       # Resource quotas
    yaml.ts                  # Universal resource YAML fetcher
  routes/
    log-stream.ts            # SSE log streaming endpoint
    pod-terminal.ts          # WebSocket pod terminal route
apps/web/src/
  app/clusters/[id]/
    helm/page.tsx            # Helm releases page
    crds/page.tsx            # CRD browser page
    rbac/page.tsx            # RBAC viewer page
    network-policies/page.tsx # Network policies page
    resource-quotas/page.tsx # Resource quotas page
  components/
    terminal/
      TerminalDrawer.tsx     # Bottom drawer with tabbed terminals
      TerminalTab.tsx        # Individual session tab
      TerminalSession.tsx    # xterm.js instance + WS lifecycle
    resource/
      YamlViewer.tsx         # Syntax-highlighted read-only YAML
      ResourceDiff.tsx       # Side-by-side diff viewer
      ActionToolbar.tsx      # Restart/Scale/Delete/Terminal buttons
      ScaleInput.tsx         # Inline replica count changer
      DeleteConfirmDialog.tsx  # Type-name-to-confirm
      RestartConfirmDialog.tsx # Impact-aware confirmation
      PortForwardCopy.tsx    # Copy kubectl command
    topology/
      TopologyMap.tsx        # React Flow graph
      TopologyNode.tsx       # Custom node per resource type
      TopologyEdge.tsx       # Health-colored edge
    events/
      EventsTimeline.tsx     # Horizontal swim lane timeline
      TimelineSwimLane.tsx   # Single resource type row
      TimelineEventDot.tsx   # Color-coded event dot
    network/
      NetworkPolicyGraph.tsx
      NetworkPolicyNode.tsx
      NetworkPolicyEdge.tsx
    rbac/
      RbacMatrix.tsx         # Permission matrix grid
      RbacCell.tsx           # CRUD permission cell
    quotas/
      ResourceQuotaCard.tsx
    helm/
      HelmReleaseDetail.tsx
    crds/
      CrdBrowser.tsx
      CrdInstanceList.tsx
```

### Pattern 1: Pod Terminal via WebSocket

**What:** Bidirectional terminal session between browser and K8s pod using xterm.js (client) + @fastify/websocket + @kubernetes/client-node K8s.Exec class (server).

**When to use:** Pod terminal feature (LENS-01).

**Architecture:**
```
Browser (xterm.js) <--WebSocket--> Fastify (@fastify/websocket)
                                       |
                                  K8s.Exec class
                                       |
                                  K8s API Server <--> Pod
```

**Server-side pattern:**
```typescript
// apps/api/src/routes/pod-terminal.ts
import { Exec } from '@kubernetes/client-node'
import { PassThrough } from 'node:stream'

export async function registerPodTerminalRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/pod-terminal', { websocket: true }, async (socket, request) => {
    // 1. Authenticate via cookie (extract from upgrade request headers)
    // 2. Parse query params: clusterId, namespace, podName, container
    // 3. Get KubeConfig from ClusterClientPool
    const kc = await clusterClientPool.getClient(clusterId)
    const k8sExec = new Exec(kc)

    // 4. Create PassThrough streams to bridge WebSocket <-> K8s
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const stdin = new PassThrough()

    // 5. Forward stdout/stderr to WebSocket
    stdout.on('data', (data: Buffer) => socket.send(data))
    stderr.on('data', (data: Buffer) => socket.send(data))

    // 6. Forward WebSocket messages to stdin
    socket.on('message', (data) => stdin.write(data))

    // 7. Start terminal session -- try shells in order
    const shells = ['/bin/bash', '/bin/sh', '/bin/ash']
    let ws: WebSocket | null = null
    for (const shell of shells) {
      try {
        ws = await k8sExec.exec(
          namespace, podName, container,
          [shell],
          stdout, stderr, stdin,
          true, // tty
          (status) => { socket.close() }
        )
        break
      } catch { continue }
    }
    if (!ws) {
      socket.close(1008, 'No shell available in container')
      return
    }

    // 8. Cleanup on disconnect
    socket.on('close', () => {
      stdin.end()
      ws?.close()
    })
  })
}
```

**Key detail:** The K8s.Exec class returns a `Promise<WebSocket>` that connects to the K8s API server. The server acts as a bridge between the browser WebSocket and the K8s WebSocket. PassThrough streams bridge the two connections.

**Client-side pattern:**
```typescript
// components/terminal/TerminalSession.tsx
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

const term = new Terminal({
  cursorBlink: true,
  fontSize: 13,
  fontFamily: 'var(--font-geist-mono)',
  theme: { /* map to --color-terminal-* CSS vars */ }
})
const fitAddon = new FitAddon()
term.loadAddon(fitAddon)
term.open(containerRef.current)
fitAddon.fit()

// WebSocket connection
const ws = new WebSocket(
  `${wsBaseUrl}/api/pod-terminal?clusterId=...&namespace=...&podName=...&container=...`
)
ws.binaryType = 'arraybuffer'

// Terminal -> WebSocket
term.onData((data) => ws.send(new TextEncoder().encode(data)))

// WebSocket -> Terminal
ws.onmessage = (event) => term.write(new Uint8Array(event.data))
```

### Pattern 2: SSE Log Streaming

**What:** Real-time pod log streaming using SSE, extending the existing metrics-stream pattern.

**When to use:** Live log follow mode (LENS-02).

**Server-side pattern (new Fastify route, NOT tRPC):**
```typescript
// apps/api/src/routes/log-stream.ts
export async function registerLogStreamRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/logs/stream', async (request, reply) => {
    // 1. Auth check (same as metrics-stream.ts)
    // 2. Parse: clusterId, podName, namespace, container
    // 3. Get K8s client
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    // 4. SSE headers (same as metrics-stream)
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    })

    // 5. Use follow:true to get a readable stream
    const logStream = await coreApi.readNamespacedPodLog({
      name: podName, namespace, container,
      follow: true, tailLines: 100, timestamps: true,
    })

    // 6. Pipe log lines to SSE
    // K8s log follow returns a Node.js stream when follow=true
    logStream.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        reply.raw.write(`event: log\ndata: ${JSON.stringify({ line })}\n\n`)
      }
    })

    // 7. Heartbeat + cleanup (same as metrics-stream)
  })
}
```

**Key insight:** The `readNamespacedPodLog` with `follow: true` returns a response whose body is a readable stream. This needs verification at implementation time -- the exact return shape depends on the K8s client version's HTTP backend. Alternative: use the `Log` class from @kubernetes/client-node which has an explicit `.log()` method returning a Readable stream.

### Pattern 3: Helm Release Decoding

**What:** Reading Helm release data from K8s Secrets (type `helm.sh/release.v1`).

**When to use:** Helm releases page (LENS-05).

```typescript
// apps/api/src/routers/helm.ts
import * as k8s from '@kubernetes/client-node'
import { gunzipSync } from 'node:zlib'

// Helm stores releases as secrets with naming: sh.helm.release.v1.<release>.<version>
// Secret data.release = base64(gzip(JSON.stringify(release)))

async function decodeHelmRelease(secret: k8s.V1Secret): HelmRelease {
  const releaseData = secret.data?.release
  if (!releaseData) throw new Error('No release data in secret')

  // 1. Base64 decode the secret data
  const compressed = Buffer.from(releaseData, 'base64')

  // 2. Decompress gzip
  const jsonBuffer = gunzipSync(compressed)

  // 3. Parse JSON
  const release = JSON.parse(jsonBuffer.toString('utf-8'))

  return {
    name: release.name,
    namespace: release.namespace,
    chartName: release.chart?.metadata?.name,
    chartVersion: release.chart?.metadata?.version,
    appVersion: release.chart?.metadata?.appVersion,
    status: release.info?.status,
    revision: release.version,
    firstDeployed: release.info?.first_deployed,
    lastDeployed: release.info?.last_deployed,
    values: release.config,
    defaultValues: release.chart?.values,
  }
}

// List all Helm releases in a cluster
async function listHelmReleases(kc: k8s.KubeConfig): Promise<HelmRelease[]> {
  const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
  // Filter secrets by type
  const { items } = await coreV1.listSecretForAllNamespaces({
    fieldSelector: 'type=helm.sh/release.v1'
  })

  // Group by release name, keep only latest revision per release
  const releases = new Map<string, k8s.V1Secret>()
  for (const secret of items) {
    const name = secret.metadata?.labels?.name
    if (!name) continue
    const existing = releases.get(name)
    const currentVersion = parseInt(secret.metadata?.labels?.version ?? '0')
    const existingVersion = parseInt(existing?.metadata?.labels?.version ?? '0')
    if (currentVersion > existingVersion) {
      releases.set(name, secret)
    }
  }

  return Promise.all([...releases.values()].map(decodeHelmRelease))
}
```

### Pattern 4: K8s Resource Router (for new routers)

**What:** Standard pattern for RBAC, CRDs, Network Policies, Resource Quotas routers.

**When to use:** All new K8s API routers.

```typescript
// Follow the exact pattern from existing routers (pods.ts, services.ts)
import * as k8s from '@kubernetes/client-node'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

export const networkPoliciesRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api)
        const result = await cached(
          CACHE_KEYS.k8sNetworkPolicies(input.clusterId),
          15_000,
          () => networkingApi.listNetworkPolicyForAllNamespaces(),
        )
        return result.items.map(mapNetworkPolicy)
      } catch (err) {
        handleK8sError(err, 'list network policies')
      }
    }),
})
```

### Pattern 5: Universal YAML Fetcher

**What:** Generic endpoint to fetch raw resource JSON from K8s API, converted to YAML for display.

**When to use:** YAML tab on every ExpandableCard (LENS-03).

```typescript
// apps/api/src/routers/yaml.ts
// Single router that fetches any resource's raw spec by type + name + namespace
const RESOURCE_API_MAP: Record<string, (kc: k8s.KubeConfig) => {
  read: (name: string, namespace: string) => Promise<unknown>
}> = {
  pods: (kc) => ({
    read: (name, ns) => kc.makeApiClient(k8s.CoreV1Api)
      .readNamespacedPod({ name, namespace: ns }),
  }),
  deployments: (kc) => ({
    read: (name, ns) => kc.makeApiClient(k8s.AppsV1Api)
      .readNamespacedDeployment({ name, namespace: ns }),
  }),
  // ... all resource types
}
```

### Pattern 6: React Flow Topology Map with Dagre Layout

**What:** Automatic graph layout for cluster resource topology.

**When to use:** Topology map (LENS-09) and network policy graph (LENS-11).

```typescript
// components/topology/TopologyMap.tsx
import { ReactFlow, Controls, MiniMap, Background } from '@xyflow/react'
import dagre from '@dagrejs/dagre'

const nodeWidth = 180
const nodeHeight = 48

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 60 })

  nodes.forEach((node) => g.setNode(node.id, { width: nodeWidth, height: nodeHeight }))
  edges.forEach((edge) => g.setEdge(edge.source, edge.target))
  dagre.layout(g)

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id)
      return {
        ...node,
        position: { x: x - nodeWidth / 2, y: y - nodeHeight / 2 },
        sourcePosition: 'right',
        targetPosition: 'left',
      }
    }),
    edges,
  }
}
```

### Anti-Patterns to Avoid

- **Do NOT use `httpBatchLink`** for tRPC (Gotcha #1) -- stick with `httpLink`
- **Do NOT add `migrate()` to server.ts** (Iron Rule #1) -- schema via init.sql only
- **Do NOT hardcode colors** -- use CSS custom properties (`--color-*` variables)
- **Do NOT skip reduced motion checks** -- every Motion component must call `useReducedMotion()`
- **Do NOT use `typeof window` checks in render** (Gotcha #13) -- use `useState(false)` + `useEffect`
- **Do NOT put `useMutation` in useEffect deps** (Gotcha #11) -- use ref pattern
- **Do NOT build a full YAML syntax highlighter** -- use CSS-based tokenizer (~50 LOC) reusing `--color-log-*` tokens
- **Do NOT use `monaco-editor` for YAML/Diff** -- 5MB+ bundle, overkill for read-only viewing

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal emulator | Custom canvas/DOM terminal | `@xterm/xterm` | Terminal rendering is extremely complex (escape codes, UTF-8, cursor positioning, selection) |
| Graph layout | Manual node positioning algorithm | `@dagrejs/dagre` | Graph layout is a well-studied problem; dagre handles edge crossing minimization, rank assignment |
| Text diff computation | Custom diff algorithm | `react-diff-viewer-continued` (uses `diff` internally) | Myers diff algorithm has edge cases; the library handles word-level diff, syntax highlighting |
| YAML serialization | Custom JSON-to-YAML converter | `yaml` npm package | YAML has many edge cases (multiline strings, anchors, special characters, quoting rules) |
| WebSocket management | Raw WebSocket + reconnect logic | `@fastify/websocket` (server) / native WebSocket (client) | Fastify plugin handles upgrade, integrates with lifecycle hooks, error handling |
| Helm release decoding | Custom base64+gzip parser | `Buffer.from(data, 'base64')` + `zlib.gunzipSync` | Node.js built-ins handle this; the pattern is well-documented in Helm source code |

**Key insight:** This phase adds the most new dependencies of any phase so far (8 new packages). Each solves a genuinely hard problem that would take days to hand-roll and still have edge cases.

## Common Pitfalls

### Pitfall 1: xterm.js Theme Not Matching Dark/Light Mode
**What goes wrong:** Terminal renders with hardcoded dark colors, looks broken in light mode.
**Why it happens:** xterm.js `theme` object is set once at construction time and not updated on theme change.
**How to avoid:** Listen to theme changes via `next-themes` `useTheme()` hook. When theme changes, call `term.options.theme = newTheme` to update colors. Map `--color-terminal-*` CSS vars to xterm.js theme properties at mount time.
**Warning signs:** Terminal looks fine in dark mode but has invisible text in light mode.

### Pitfall 2: WebSocket Authentication
**What goes wrong:** WebSocket connections bypass auth because they don't go through standard auth flow.
**Why it happens:** WebSocket upgrade requests are GET requests. The `@fastify/websocket` plugin runs hooks before the handler, but cookie-based auth needs explicit extraction.
**How to avoid:** In the WebSocket route handler, manually extract and verify the session cookie from `request.headers.cookie`. Use the same `auth.api.getSession({ headers })` pattern as SSE endpoints. Reject unauthenticated connections immediately with `socket.close(1008, 'Unauthorized')`.
**Warning signs:** Pod terminal works without login.

### Pitfall 3: Helm Secret Data Size
**What goes wrong:** Listing all Helm secrets with full data causes memory pressure for clusters with many releases.
**Why it happens:** Each Helm release secret contains the entire chart (templates, values, etc.) as compressed data. A cluster with 50+ releases can have 100+ secrets (multiple revisions per release).
**How to avoid:** First list secrets with `labelSelector=owner=helm` but WITHOUT fetching data (use metadata-only listing). Decode individual releases on-demand when user expands a card. Cache decoded releases with 30s TTL.
**Warning signs:** Slow initial page load, high memory usage in API server.

### Pitfall 4: React Flow Performance with 100+ Nodes
**What goes wrong:** Topology map becomes sluggish with many pods/services, especially during drag/pan.
**Why it happens:** React re-renders all nodes on any state change (drag position, selection).
**How to avoid:** (1) Wrap custom node components with `React.memo`. (2) Use React Flow's `nodeTypes` as a stable reference (define outside component). (3) Collapse namespaces into grouped nodes by default, expand on click. (4) Limit initial render to top 50 resources, with "show more" button.
**Warning signs:** Lag when panning/zooming the topology map.

### Pitfall 5: K8s Terminal Shell Detection
**What goes wrong:** Terminal fails with "not found" because the pod doesn't have `/bin/sh`.
**Why it happens:** Distroless containers (e.g., Go binaries) don't include a shell.
**How to avoid:** Try shells in order: `/bin/bash`, `/bin/sh`, `/bin/ash`. If all fail, show an error message: "No shell available in this container. This container may be a distroless image." The attempt should catch the error from the K8s API and surface it gracefully.
**Warning signs:** Terminal button works for nginx pods but fails for Go/Java pods.

### Pitfall 6: Log Stream Memory Leak
**What goes wrong:** SSE log stream connections accumulate, consuming K8s API connections.
**Why it happens:** K8s log follow creates a persistent connection to the API server. If the SSE client disconnects without proper cleanup, the K8s connection stays open.
**How to avoid:** Use the same reference-counted cleanup pattern as `metrics-stream.ts`. On SSE disconnect (`request.raw.on('close')`), destroy the K8s log stream. Set a maximum log line buffer (e.g., 10,000 lines) to prevent memory growth.
**Warning signs:** Increasing K8s API connection count, API server warns about too many watches.

### Pitfall 7: CRD Custom Objects API Requires Group/Version/Plural
**What goes wrong:** CRD instance listing fails because the API requires exact group, version, and plural name.
**Why it happens:** The `CustomObjectsApi` in @kubernetes/client-node needs runtime-determined API group info that varies per CRD.
**How to avoid:** First list CRDs via `ApiextensionsV1Api.listCustomResourceDefinition()`. For each CRD, extract `spec.group`, `spec.versions[0].name`, and `spec.names.plural`. Then use `CustomObjectsApi.listClusterCustomObject(group, version, plural)` or `listNamespacedCustomObject(group, version, namespace, plural)` depending on scope.
**Warning signs:** "404 Not Found" errors when trying to list CRD instances.

### Pitfall 8: RBAC Matrix Performance
**What goes wrong:** Building the full RBAC matrix is extremely slow for clusters with many roles/bindings.
**Why it happens:** A production cluster can have 200+ ClusterRoles, 100+ ClusterRoleBindings, plus per-namespace Roles and RoleBindings. Building a matrix of subjects x resources x verbs is O(n^3).
**How to avoid:** (1) Fetch all RBAC data in parallel (4 API calls). (2) Build the matrix server-side and cache it (60s TTL). (3) Default to showing only non-system service accounts (exclude `system:*`). (4) Add namespace filter to reduce scope.
**Warning signs:** RBAC page takes 10+ seconds to load.

### Pitfall 9: Resource Diff Missing Annotation
**What goes wrong:** Diff tab shows "No last-applied configuration" for most resources.
**Why it happens:** The `kubectl.kubernetes.io/last-applied-configuration` annotation is only set when using `kubectl apply`. Resources created via Helm, operators, or direct API calls don't have it.
**How to avoid:** (1) Show a clear message when the annotation is missing. (2) For Helm-managed resources (detected by `app.kubernetes.io/managed-by: Helm` label), offer revision-to-revision diff instead. (3) Consider showing the full YAML as a fallback "diff" with no left side.
**Warning signs:** Diff tab appears empty/useless on most resources.

### Pitfall 10: Fastify WebSocket Plugin Registration Order
**What goes wrong:** WebSocket routes don't work, connections get 404.
**Why it happens:** `@fastify/websocket` must be registered BEFORE defining WebSocket routes. The plugin hooks into Fastify's route registration to detect `{ websocket: true }` options.
**How to avoid:** Register `@fastify/websocket` early in server.ts, before any route that uses `{ websocket: true }`. The plugin should be registered alongside other core plugins (cors, rateLimit, compress).
**Warning signs:** WebSocket upgrade requests return HTTP 404 or regular HTTP response.

## Code Examples

### Universal YAML Viewer Component

```typescript
// components/resource/YamlViewer.tsx
// CSS-based YAML tokenizer reusing existing --color-log-* tokens

function tokenizeYaml(yaml: string): TokenLine[] {
  return yaml.split('\n').map((line, i) => {
    const tokens: Token[] = []
    // Comments
    if (line.trimStart().startsWith('#')) {
      tokens.push({ type: 'comment', value: line })
      return { lineNumber: i + 1, tokens }
    }
    // Key-value pairs
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      tokens.push({ type: 'key', value: line.slice(0, colonIndex + 1) })
      const value = line.slice(colonIndex + 1).trim()
      if (value) {
        tokens.push({ type: classifyValue(value), value: ' ' + value })
      }
    } else {
      tokens.push({ type: 'string', value: line })
    }
    return { lineNumber: i + 1, tokens }
  })
}

function classifyValue(value: string): 'string' | 'number' | 'boolean' | 'null' {
  if (value === 'null' || value === '~') return 'null'
  if (value === 'true' || value === 'false') return 'boolean'
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number'
  return 'string'
}
```

### K8s RBAC Data Aggregation

```typescript
// apps/api/src/routers/rbac.ts

async function aggregateRbac(kc: k8s.KubeConfig) {
  const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api)

  // Fetch all 4 RBAC resource types in parallel
  const [clusterRoles, clusterRoleBindings, roles, roleBindings] = await Promise.all([
    rbacApi.listClusterRole(),
    rbacApi.listClusterRoleBinding(),
    rbacApi.listRoleForAllNamespaces(),
    rbacApi.listRoleBindingForAllNamespaces(),
  ])

  // Build subject -> permissions map
  // 1. Map ClusterRoleBindings to their ClusterRoles
  // 2. Map RoleBindings to their Roles (namespace-scoped)
  // 3. Aggregate verbs per resource per subject
  // Return as matrix data structure for frontend rendering
}
```

### CRD Instance Listing via CustomObjectsApi

```typescript
// apps/api/src/routers/crds.ts
async function listCrdInstances(
  kc: k8s.KubeConfig,
  group: string,
  version: string,
  plural: string,
  scope: 'Namespaced' | 'Cluster',
) {
  const customApi = kc.makeApiClient(k8s.CustomObjectsApi)

  if (scope === 'Cluster') {
    return customApi.listClusterCustomObject({ group, version, plural })
  }
  // For namespaced CRDs, list across all namespaces
  // CustomObjectsApi doesn't have listForAllNamespaces
  // Use raw API path: /apis/<group>/<version>/<plural>
  const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
  const { items: namespaces } = await coreV1.listNamespace()
  const results = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const result = await customApi.listNamespacedCustomObject({
          group, version, plural,
          namespace: ns.metadata?.name ?? 'default',
        })
        return (result as { items?: unknown[] }).items ?? []
      } catch { return [] }
    }),
  )
  return results.flat()
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xterm` (v4 package name) | `@xterm/xterm` (v5+) | xterm.js v5 (2023) | Package renamed from `xterm` to `@xterm/xterm`. Addons also renamed. Current: v6.0.0 |
| `reactflow` | `@xyflow/react` | React Flow v12 (2024) | Package renamed. Default import removed. Node dimensions now at `node.measured.width/height` |
| `dagre` (original) | `@dagrejs/dagre` | 2024 | Maintained fork at `@dagrejs/dagre` v3.0.0. Original `dagre` v0.8.5 unmaintained |
| `react-diff-viewer` | `react-diff-viewer-continued` | 2023 | Original package unmaintained. `continued` fork has React 18/19 support |
| K8s client `getJSON` | K8s client typed methods | @kubernetes/client-node v1.x | V1 rewrite uses OpenAPI-generated typed methods |

**Deprecated/outdated:**
- `xterm` package (v4): Use `@xterm/xterm` (v5+/v6) instead
- `dagre` v0.8.5: Use `@dagrejs/dagre` v3.0.0 instead
- `reactflow`: Use `@xyflow/react` v12 instead
- `react-diff-viewer`: Use `react-diff-viewer-continued` instead

## Open Questions

1. **K8s log follow stream return type in @kubernetes/client-node v1.4.0**
   - What we know: `readNamespacedPodLog` with `follow: true` should return a stream-like response
   - What's unclear: The exact return type in v1.4.0 -- whether it's a Node.js ReadableStream, a raw HTTP response, or requires using the `Log` class instead of `CoreV1Api`
   - Recommendation: At implementation time, test with `new k8s.Log(kc)` class which has an explicit `.log()` method returning a Readable stream. Fall back to raw API request if needed. HIGH priority to verify during Plan 1 implementation.

2. **WebSocket terminal resize handling**
   - What we know: When the user resizes the terminal drawer, xterm.js needs to be informed AND the K8s session needs to receive resize signals
   - What's unclear: Whether @kubernetes/client-node's K8s.Exec class supports resize signaling via the channel 4 protocol
   - Recommendation: Use `fitAddon.fit()` on resize, which updates terminal dimensions. For K8s resize, check if `Exec.handler` has a `resize` method. If not, the terminal may not resize properly in the pod -- this is acceptable for v1. LOW confidence.

3. **CustomObjectsApi for CRD instances across all namespaces**
   - What we know: `CustomObjectsApi` has `listClusterCustomObject` and `listNamespacedCustomObject` but no `listForAllNamespaces` equivalent
   - What's unclear: Whether we need to iterate over all namespaces individually or if there's a pattern for cross-namespace listing
   - Recommendation: For cluster-scoped CRDs, use `listClusterCustomObject`. For namespaced CRDs, iterate namespaces or use raw K8s API URL. MEDIUM confidence.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | Yes | 22.x | -- |
| pnpm | Build | Yes | 10.6.2 | -- |
| Docker | Local dev (Postgres, Redis) | Yes | Available | -- |
| K8s cluster (minikube or remote) | Pod terminal, live features | Optional (K8S_ENABLED=false) | -- | Features degrade gracefully; can test with mock data |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** K8s cluster is optional -- all new features handle K8s unavailability gracefully via `handleK8sError`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LENS-01 | Pod terminal WebSocket connection | integration | Manual -- requires K8s cluster | No (Wave 0) |
| LENS-02 | SSE log streaming | unit | `pnpm --filter api test -- src/__tests__/log-stream.test.ts -x` | No (Wave 0) |
| LENS-03 | YAML viewer rendering | unit | `pnpm --filter web test -- src/__tests__/yaml-viewer.test.ts -x` | No (Wave 0) |
| LENS-04 | Restart/scale mutations | unit | `pnpm --filter api test -- src/__tests__/workload-actions.test.ts -x` | No (existing restart/scale already in deployments router) |
| LENS-05 | Helm release decoding | unit | `pnpm --filter api test -- src/__tests__/helm.test.ts -x` | No (Wave 0) |
| LENS-06 | Events timeline rendering | manual-only | Visual verification | -- |
| LENS-07 | Resource diff computation | unit | `pnpm --filter web test -- src/__tests__/resource-diff.test.ts -x` | No (Wave 0) |
| LENS-08 | Port-forward command generation | unit | `pnpm --filter web test -- src/__tests__/port-forward.test.ts -x` | No (Wave 0) |
| LENS-09 | CRD listing | unit | `pnpm --filter api test -- src/__tests__/crds.test.ts -x` | No (Wave 0) |
| LENS-10 | RBAC aggregation | unit | `pnpm --filter api test -- src/__tests__/rbac.test.ts -x` | No (Wave 0) |
| LENS-11 | Network policy graph | manual-only | Visual verification | -- |
| LENS-12 | Resource quotas | unit | `pnpm --filter api test -- src/__tests__/resource-quotas.test.ts -x` | No (Wave 0) |
| LENS-13 | Live data updates | E2E | `pnpm test:e2e` | No (existing E2E infrastructure) |
| LENS-14 | Build passes | build | `pnpm build && pnpm typecheck` | Yes (existing) |

### Sampling Rate
- **Per task commit:** `pnpm typecheck && pnpm build`
- **Per wave merge:** `pnpm test && pnpm build && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/helm.test.ts` -- Helm release decode/list (LENS-05)
- [ ] `apps/api/src/__tests__/rbac.test.ts` -- RBAC aggregation (LENS-10)
- [ ] `apps/api/src/__tests__/resource-quotas.test.ts` -- ResourceQuota listing (LENS-12)
- [ ] Framework install: `pnpm --filter web add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xyflow/react @dagrejs/dagre react-diff-viewer-continued yaml` and `pnpm --filter api add @fastify/websocket`

## Project Constraints (from CLAUDE.md)

These directives from CLAUDE.md are binding on all plans:

1. **NEVER add `migrate()` to server.ts** -- schema via `charts/voyager/sql/init.sql` only
2. **NEVER hardcode `localhost` in E2E tests** -- use `BASE_URL` env var
3. **Deploy = `helm uninstall` + `helm install`** -- never `helm upgrade`
4. **ALL Discord messages use Components v2**
5. **E2E gate: 0 failures**
6. **Code review gate: 10/10**
7. **QA gate: 8.5+/10** at 1920x1080
8. **Before any UI/animation change, read `docs/DESIGN.md`** -- B-style animation source of truth
9. **tRPC uses `httpLink` NOT `httpBatchLink`** (Gotcha #1)
10. **Zod v4: `z.record()` requires TWO arguments** (Gotcha #8)
11. **LazyMotion: do NOT add `strict` flag** (Gotcha #10)
12. **SSR hydration: never branch on `typeof window/document` in render** (Gotcha #13)
13. **All packages are ESM** -- use `.js` extensions in imports
14. **Biome lint**: 2-space indent, 100-char line width, single quotes, semicolons as-needed
15. **Cache keys centralized in `cache-keys.ts`** -- never construct inline
16. **Config centralized** -- add constants to config files, not inline in routers
17. **handleK8sError** for all K8s router errors
18. **logAudit in try/catch** -- never let audit logging break the main operation
19. **Chart colors use CSS custom properties** -- never hardcode
20. **Redis failures non-fatal** -- catch and fall through
21. **Use `ui-ux-pro-max` and `frontend-design` skills** for frontend-heavy plans

## Sources

### Primary (HIGH confidence)
- @kubernetes/client-node v1.4.0 type definitions -- K8s.Exec class, RbacAuthorizationV1Api, ApiextensionsV1Api, CustomObjectsApi, NetworkingV1Api, CoreV1Api (ResourceQuota) all verified in local `node_modules/.pnpm`
- Existing codebase: deployments.ts restart/scale pattern, metrics-stream.ts SSE pattern, resource-watch-manager.ts informer pattern, pods.ts router pattern
- Phase 8 component library: ExpandableCard, DetailTabs, ResourceBar, SearchFilterBar, GroupedTabBar, cluster-tabs-config.ts
- Phase 9 UI-SPEC (09-UI-SPEC.md): Component inventory, interaction contracts, color tokens, typography

### Secondary (MEDIUM confidence)
- [React Flow Performance](https://reactflow.dev/learn/advanced-use/performance) -- memoization, lazy loading, style simplification
- [React Flow Dagre Example](https://reactflow.dev/examples/layout/dagre) -- `getLayoutedElements` pattern, node dimension handling
- [Helm Secret Storage](https://codeengineered.com/blog/2020/helm-secret-storage/) -- base64+gzip decode, naming pattern `sh.helm.release.v1.*`
- [@fastify/websocket](https://github.com/fastify/fastify-websocket) -- `{ websocket: true }` route option, handler receives `(socket, request)`
- [K8s TypeScript Client Examples](https://github.com/kubernetes-client/javascript/blob/master/examples/typescript/exec/exec-example.ts) -- K8s.Exec class API
- [K8s Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/) -- podSelector, ingress/egress rules, namespace selectors
- [K8s RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) -- ClusterRole, ClusterRoleBinding, Role, RoleBinding, subjects, verbs

### Tertiary (LOW confidence)
- K8s log follow streaming return type in @kubernetes/client-node v1.4.0 -- needs implementation-time verification
- Terminal resize signaling through K8s protocol -- channel 4 resize support unclear

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via `npm view`, dependencies checked in local `node_modules`
- Architecture: HIGH -- patterns derived from existing codebase (metrics-stream SSE, pods/deployments routers, ExpandableCard/DetailTabs)
- Pitfalls: HIGH -- based on common K8s dashboard implementation issues and project-specific gotchas from CLAUDE.md
- WebSocket integration: MEDIUM -- first WebSocket in codebase, Fastify 5 + @fastify/websocket compatibility verified but bridge pattern needs implementation validation
- React Flow performance: MEDIUM -- dagre layout verified via docs, 100+ node performance needs runtime testing

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable libraries, 30-day validity)
