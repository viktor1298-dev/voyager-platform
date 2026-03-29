/** SSE (Server-Sent Events) configuration constants */

/** How often the server sends a heartbeat ping to keep the connection alive (ms) */
export const SSE_HEARTBEAT_INTERVAL_MS = 30_000

/** Maximum time a client waits before reconnecting after disconnect (ms) */
export const SSE_MAX_RECONNECT_DELAY_MS = 30_000

/** Initial reconnect delay for exponential backoff (ms) */
export const SSE_INITIAL_RECONNECT_DELAY_MS = 1_000

/** Backoff multiplier for reconnection attempts */
export const SSE_RECONNECT_BACKOFF_MULTIPLIER = 2

/** Maximum number of reconnection attempts before giving up (0 = infinite) */
export const SSE_MAX_RECONNECT_ATTEMPTS = 0

/** How often the metrics stream pushes updates (ms) */
export const SSE_METRICS_INTERVAL_MS = 5_000

/** How often the pod events stream polls K8s watch (ms) — fallback if watch disconnects */
export const SSE_POD_WATCH_RECONNECT_DELAY_MS = 5_000

/** Maximum number of events to buffer before dropping oldest */
export const SSE_EVENT_BUFFER_SIZE = 100

/** Log streaming: number of initial tail lines to send */
export const SSE_LOG_TAIL_LINES = 200

/** Log streaming: polling interval for new log lines (ms) */
export const SSE_LOG_POLL_INTERVAL_MS = 2_000

/** Deployment progress: polling interval (ms) */
export const SSE_DEPLOYMENT_PROGRESS_INTERVAL_MS = 3_000

/** Alert stream: check interval for new alerts (ms) */
export const SSE_ALERT_CHECK_INTERVAL_MS = 5_000

/** Token refresh threshold — refresh at 80% of TTL */
export const TOKEN_REFRESH_THRESHOLD_RATIO = 0.8

/** Metrics polling interval for ClusterWatchManager (ms) */
export const CLUSTER_METRICS_POLL_INTERVAL_MS = 30_000

/** Maximum concurrent cluster watches */
export const MAX_CONCURRENT_CLUSTER_WATCHES = 20

/** How often MetricsStreamJob polls K8s metrics-server for SSE subscribers (ms) */
export const SSE_METRICS_STREAM_POLL_MS = 15_000

/** Resource stream: buffer window before flushing events to SSE clients (ms) */
export const RESOURCE_STREAM_BUFFER_MS = 1_000

/** Maximum concurrent SSE connections per cluster for resource stream */
export const MAX_RESOURCE_CONNECTIONS_PER_CLUSTER = 10

/** Maximum total concurrent SSE connections globally for resource stream */
export const MAX_RESOURCE_CONNECTIONS_GLOBAL = 50

// ── Watch Manager Constants (Phase 10) ────────────────────────

/** Base delay for watch informer reconnection (ms) */
export const WATCH_RECONNECT_BASE_MS = 1_000

/** Maximum delay for watch informer reconnection (ms) */
export const WATCH_RECONNECT_MAX_MS = 30_000

/** Jitter ratio applied to reconnection delay (0-1) */
export const WATCH_RECONNECT_JITTER_RATIO = 0.1

/** How often the watch-db-writer syncs dirty resources to PostgreSQL (ms) */
export const WATCH_DB_SYNC_INTERVAL_MS = 60_000

/** Timeout for watch heartbeat — if no data in this window, reconnect (ms) */
export const WATCH_HEARTBEAT_TIMEOUT_MS = 90_000
